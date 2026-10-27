/**
 * Dog Meetups — DATABASE-LEVEL security tests (opt-in; NOT part of `npm test`).
 *
 * Replays every repo migration (plus migrations 030–034) on a throwaway local
 * Postgres and proves, with real RLS / triggers / RPCs:
 *   - pending meetups are not publicly readable or discoverable
 *   - non-admins cannot self-publish, edit after review, or smuggle
 *     paid/featured/contact/link fields
 *   - the pending photo bucket is private; the public bucket is admin-write
 *   - approve / reject flows, the upcoming window, and expiry
 *   - meetups are never "verified" and never grant trust points
 *   - report policies (own insert, one per user, admin-only review)
 *   - 030–034 are idempotent
 *
 * Limits (see docs/dog-meetups.md): storage is exercised at the SQL level
 * (storage.objects policies), NOT through the Supabase Storage HTTP API; PostGIS
 * is replaced by haversine stand-ins.
 *
 * Run:  DATABASE_URL=postgres://postgres:postgres@localhost:55432/xnext_test \
 *       node --test tests/db/dogMeetupDb.test.mjs
 * WARNING: resets public/auth/storage/extensions schemas of that database.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, adaptSql, resetAndReplay } from './replay.mjs'

const require = createRequire(process.env.PG_RESOLVE_FROM ?? '/workspace/pgtest/')
const pg = require('pg')

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/xnext_test'
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 6 })

async function runAs(userId, fn) {
  const c = await pool.connect()
  try {
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
    await c.query(`SET ROLE authenticated`)
    return await fn(c)
  } finally {
    await c.query(`RESET ROLE`).catch(() => {})
    await c.query(`RESET ALL`).catch(() => {})
    c.release()
  }
}
async function runAsAnon(fn) {
  const c = await pool.connect()
  try {
    await c.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
    await c.query(`SET ROLE anon`)
    return await fn(c)
  } finally {
    await c.query(`RESET ROLE`).catch(() => {})
    await c.query(`RESET ALL`).catch(() => {})
    c.release()
  }
}
const admin = (sql, params) => pool.query(sql, params) // superuser / "service role"

let owner, other, adminU
// Search centre (Seattle-ish)
const LAT = 47.6
const LNG = -122.33
const h = (n) => `now() + interval '${n} hours'`
const d = (n) => `now() + interval '${n} days'`

let slugN = 0
/** Insert a meetup as `userId` through RLS + guard. Overrides merge over defaults. */
function meetupInsert(c, userId, o = {}) {
  const v = {
    title: 'Sunday sniff walk',
    description: 'Relaxed off-peak playdate',
    location_name: 'Gas Works Dog Park',
    dog_size: 'all',
    status: 'pending_review',
    starts: h(48),
    expires: 'NULL',
    photo: null,
    extra: '',
    ...o,
  }
  const slug = `meetup-${++slugN}-${Math.random().toString(36).slice(2, 7)}`
  return c.query(
    `INSERT INTO quests (created_by, slug, title, description, experience_class, listing_type,
        location_name, location_point, location_radius_m, status, starts_at, expires_at,
        dog_size, dog_fenced, dog_leash_info, dog_parking_info, dog_photo_pending_path
        ${v.extraCols ?? ''})
     VALUES ($1, $2, $3, $4, 'connection', 'dog_meetup', $5,
        public.ST_MakePoint(${LNG}, ${LAT}), 100, '${v.status}', ${v.starts}, ${v.expires},
        $6, true, 'leash near the gate', 'street parking', $7 ${v.extraVals ?? ''})
     RETURNING id`,
    [userId, slug, v.title, v.description, v.location_name, v.dog_size, v.photo],
  )
}
/** Blocked = throws, or silently affects 0 rows (RLS USING filters the row out). */
async function assertBlocked(promise, re) {
  try {
    const r = await promise
    assert.equal(r.rowCount, 0, 'statement unexpectedly changed rows')
  } catch (e) {
    if (e.name === 'AssertionError') throw e
    if (re) assert.match(String(e.message), re)
  }
}
const nearby = (c) =>
  c.query(`SELECT id, status, verified_location, completed_count, external_url, dog_size
           FROM public.find_quests_nearby(${LAT}, ${LNG}, 50, 100, 0)`)
const ids = (r) => r.rows.map((x) => x.id)

before(async () => {
  const c = await pool.connect()
  try {
    await resetAndReplay(c)
    const u = await c.query(
      `INSERT INTO profiles (full_name, username, is_admin) VALUES
        ('Owner','owner',false), ('Other','other',false), ('Admin','admin',true) RETURNING id`,
    )
    ;[owner, other, adminU] = u.rows.map((r) => r.id)
  } finally {
    c.release()
  }
})
after(async () => {
  await pool.end()
})

// ─── Submission: pending only ────────────────────────────────────────────────
test('owner can submit a pending_review meetup; guard forces safe fields', async () => {
  const r = await runAs(owner, async (c) => {
    const ins = await meetupInsert(c, owner, {
      extraCols: ', is_featured, is_paid_listing, payment_status, external_url, ticket_url, contact_email, business_name, media_urls, priority_boost, published_at',
      extraVals: `, true, true, 'paid', 'https://evil.example', 'https://evil.example/t', 'x@y.z', 'Biz', '["https://evil.example/a.jpg"]'::jsonb, 9, now()`,
    })
    return c.query(`SELECT * FROM quests WHERE id = $1`, [ins.rows[0].id])
  })
  const q = r.rows[0]
  assert.equal(q.status, 'pending_review')
  assert.equal(q.is_featured, false)
  assert.equal(q.is_paid_listing, false)
  assert.equal(q.payment_status, 'unpaid')
  assert.equal(q.external_url, null)
  assert.equal(q.ticket_url, null)
  assert.equal(q.contact_email, null)
  assert.equal(q.business_name, null)
  assert.deepEqual(q.media_urls, [])
  assert.equal(q.priority_boost, 0)
  assert.equal(q.published_at, null)
  assert.equal(q.verified_location, false)
  // Default expiry = start + 2h
  const diff = (new Date(q.expires_at) - new Date(q.starts_at)) / 3600000
  assert.equal(diff, 2)
})

test('owner CANNOT insert a meetup as published (trigger)', async () => {
  await runAs(owner, async (c) => {
    await assert.rejects(meetupInsert(c, owner, { status: 'published' }), /approved by an admin/)
  })
})

test('RLS alone also blocks published meetups (trigger disabled → restrictive policy)', async () => {
  await admin(`ALTER TABLE quests DISABLE TRIGGER trg_quests_dog_meetup_guard`)
  try {
    await runAs(owner, async (c) => {
      await assert.rejects(
        meetupInsert(c, owner, { status: 'published', expires: h(50) }),
        /row-level security/,
      )
      const ok = await meetupInsert(c, owner, { status: 'pending_review', expires: h(50) })
      await assertBlocked(
        c.query(`UPDATE quests SET status = 'published' WHERE id = $1`, [ok.rows[0].id]),
        /row-level security/,
      )
    })
  } finally {
    await admin(`ALTER TABLE quests ENABLE TRIGGER trg_quests_dog_meetup_guard`)
  }
})

test('owner cannot self-publish, archive→republish, or retype a meetup via UPDATE', async () => {
  await runAs(owner, async (c) => {
    const id = (await meetupInsert(c, owner)).rows[0].id
    await assert.rejects(c.query(`UPDATE quests SET status='published' WHERE id=$1`, [id]), /admin/)
    await assert.rejects(c.query(`UPDATE quests SET listing_type=NULL WHERE id=$1`, [id]), /cannot be changed/)
    // editing own pending meetup is fine
    const r = await c.query(`UPDATE quests SET description='Updated text' WHERE id=$1 RETURNING description`, [id])
    assert.equal(r.rows[0].description, 'Updated text')
  })
})

test('cannot convert someone’s normal quest into a published meetup, nor create one as published via type switch', async () => {
  const id = (
    await admin(
      `INSERT INTO quests (created_by, slug, title, experience_class, status, location_point, location_radius_m)
       VALUES ($1,'normal-own','Normal quest','wonder','draft',public.ST_MakePoint(${LNG},${LAT}),100) RETURNING id`,
      [owner],
    )
  ).rows[0].id
  await runAs(owner, async (c) => {
    await assert.rejects(
      c.query(
        `UPDATE quests SET listing_type='dog_meetup', status='published', dog_size='all',
           starts_at=${h(30)}, expires_at=${h(32)}, description='x', location_name='y' WHERE id=$1`,
        [id],
      ),
      /(admin|row-level security|cannot be changed)/,
    )
  })
})

test('validation: past start, end before start, >24h, missing size/fields are rejected by the DB', async () => {
  await runAs(owner, async (c) => {
    await assert.rejects(meetupInsert(c, owner, { starts: h(-3) }), /in the past/)
    await assert.rejects(meetupInsert(c, owner, { starts: h(24), expires: h(23) }), /violates check constraint/)
    await assert.rejects(meetupInsert(c, owner, { starts: h(24), expires: h(24) }), /violates check constraint/)
    await assert.rejects(meetupInsert(c, owner, { starts: h(24), expires: h(50) }), /violates check constraint/)
    await assert.rejects(meetupInsert(c, owner, { starts: d(120) }), /too far/)
    await assert.rejects(meetupInsert(c, owner, { dog_size: 'huge' }), /violates check constraint/)
    await assert.rejects(meetupInsert(c, owner, { title: 'ab' }), /violates check constraint/)
    await assert.rejects(meetupInsert(c, owner, { description: ' ' }), /violates check constraint/)
    // explicit valid end is accepted
    await meetupInsert(c, owner, { starts: h(24), expires: h(26) })
  })
})

test('pending photo path must be inside the owner’s own folder', async () => {
  await runAs(owner, async (c) => {
    await assert.rejects(meetupInsert(c, owner, { photo: `${other}/a.jpg` }), /invalid pending photo path/)
    await assert.rejects(meetupInsert(c, owner, { photo: `${owner}/../x.jpg` }), /invalid pending photo path/)
    await assert.rejects(meetupInsert(c, owner, { photo: `https://x/${owner}/a.jpg` }), /invalid pending photo path/)
    await assert.rejects(meetupInsert(c, owner, { photo: `${owner}/a.gif` }), /invalid pending photo path/)
    await meetupInsert(c, owner, { photo: `${owner}/ok-1.jpg` })
  })
})

// ─── Privacy of pending ──────────────────────────────────────────────────────
test('pending meetups are invisible to anon / other users / discovery; visible to owner and admin', async () => {
  const id = await runAs(owner, async (c) => (await meetupInsert(c, owner, { title: 'Private pending' })).rows[0].id)
  const count = (rows) => rows.filter((x) => x.id === id).length
  await runAsAnon(async (c) => {
    assert.equal(count((await c.query(`SELECT id FROM quests`)).rows), 0)
    assert.equal(count((await nearby(c)).rows), 0)
  })
  await runAs(other, async (c) => {
    assert.equal(count((await c.query(`SELECT id FROM quests`)).rows), 0)
    assert.equal(count((await nearby(c)).rows), 0)
  })
  await runAs(owner, async (c) => {
    assert.equal(count((await c.query(`SELECT id FROM quests`)).rows), 1)
    assert.equal(count((await nearby(c)).rows), 0, 'even the owner does not see pending in discovery')
  })
  await runAs(adminU, async (c) => {
    assert.equal(count((await c.query(`SELECT id FROM quests`)).rows), 1)
    assert.equal(count((await nearby(c)).rows), 0)
  })
})

// ─── Storage ─────────────────────────────────────────────────────────────────
test('pending bucket is private with server-side size/type limits; public bucket is public', async () => {
  const b = (await admin(`SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets`)).rows
  const pend = b.find((x) => x.id === 'meetup-photos-pending')
  const pub = b.find((x) => x.id === 'meetup-photos')
  assert.equal(pend.public, false)
  assert.equal(pub.public, true)
  for (const x of [pend, pub]) {
    assert.equal(Number(x.file_size_limit), 3145728)
    assert.deepEqual(x.allowed_mime_types.sort(), ['image/jpeg', 'image/png', 'image/webp'])
  }
})

const putObj = (c, bucket, name) =>
  c.query(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1,$2,auth.uid())`, [bucket, name])

test('pending photo: owner can upload to own folder only; others/anon cannot read; admin can', async () => {
  const name = `${owner}/p1.jpg`
  await runAs(owner, async (c) => {
    await putObj(c, 'meetup-photos-pending', name)
    await assert.rejects(putObj(c, 'meetup-photos-pending', `${other}/x.jpg`), /row-level security/)
    await assert.rejects(putObj(c, 'meetup-photos-pending', `${owner}/sub/x.jpg`), /row-level security/)
    await assert.rejects(putObj(c, 'meetup-photos-pending', `${owner}/x.gif`), /row-level security/)
    await assert.rejects(putObj(c, 'meetup-photos', `${owner}/x.jpg`), /row-level security/)
    const own = await c.query(`SELECT name FROM storage.objects WHERE bucket_id='meetup-photos-pending'`)
    assert.deepEqual(own.rows.map((r) => r.name), [name])
    // no UPDATE policy: cannot overwrite/replace in place
    const upd = await c.query(`UPDATE storage.objects SET name=name WHERE bucket_id='meetup-photos-pending'`)
    assert.equal(upd.rowCount, 0)
  })
  await runAs(other, async (c) => {
    const r = await c.query(`SELECT name FROM storage.objects WHERE bucket_id='meetup-photos-pending'`)
    assert.equal(r.rows.length, 0)
    const del = await c.query(`DELETE FROM storage.objects WHERE bucket_id='meetup-photos-pending'`)
    assert.equal(del.rowCount, 0)
  })
  await runAsAnon(async (c) => {
    const r = await c.query(`SELECT name FROM storage.objects WHERE bucket_id='meetup-photos-pending'`)
    assert.equal(r.rows.length, 0)
    await assert.rejects(putObj(c, 'meetup-photos-pending', `${owner}/anon.jpg`), /(permission denied|row-level)/)
  })
  await runAs(adminU, async (c) => {
    const r = await c.query(`SELECT name FROM storage.objects WHERE bucket_id='meetup-photos-pending'`)
    assert.deepEqual(r.rows.map((x) => x.name), [name])
  })
})

test('public meetup-photos bucket: only admins write; no SELECT policy (cannot be listed via API)', async () => {
  await runAs(owner, async (c) => {
    await assert.rejects(putObj(c, 'meetup-photos', `abc/x.jpg`), /row-level security/)
  })
  await runAs(adminU, async (c) => {
    await putObj(c, 'meetup-photos', `abc/x.jpg`)
  })
  const pol = await admin(
    `SELECT polname, polcmd FROM pg_policy WHERE polrelid='storage.objects'::regclass
       AND pg_get_expr(polqual, polrelid) ILIKE '%meetup-photos''%'`,
  )
  assert.ok(!pol.rows.some((p) => p.polcmd === 'r' && /Meetup photos:/.test(p.polname)))
  await runAsAnon(async (c) => {
    const r = await c.query(`SELECT 1 FROM storage.objects WHERE bucket_id='meetup-photos'`)
    assert.equal(r.rows.length, 0)
  })
})

// ─── Approve / reject ────────────────────────────────────────────────────────
test('approve flow: non-admin denied; admin approves; becomes discoverable; frozen for owner', async () => {
  const photo = `${owner}/appr.jpg`
  const id = await runAs(owner, async (c) => (await meetupInsert(c, owner, { title: 'Approve me', photo, starts: h(48) })).rows[0].id)
  await runAs(owner, async (c) => {
    await assert.rejects(c.query(`SELECT approve_dog_meetup($1, NULL)`, [id]), /admin only/)
  })
  await runAs(other, async (c) => {
    await assert.rejects(c.query(`SELECT approve_dog_meetup($1, NULL)`, [id]), /admin only/)
  })
  await runAs(adminU, async (c) => {
    await assert.rejects(
      c.query(`SELECT approve_dog_meetup($1, 'https://evil.example/a.jpg')`, [id]),
      /public meetup-photos bucket/,
    )
    const url = `https://x.supabase.co/storage/v1/object/public/meetup-photos/${id}/a.jpg`
    const r = await c.query(`SELECT approve_dog_meetup($1, $2) AS old`, [id, url])
    assert.equal(r.rows[0].old, photo, 'returns the pending path so the client can delete it')
    await assert.rejects(c.query(`SELECT approve_dog_meetup($1, NULL)`, [id]), /not pending review/)
  })
  const q = (await admin(`SELECT status, media_urls, dog_photo_pending_path, published_at FROM quests WHERE id=$1`, [id])).rows[0]
  assert.equal(q.status, 'published')
  assert.equal(q.dog_photo_pending_path, null)
  assert.equal(q.media_urls.length, 1)
  assert.ok(q.published_at)
  // discoverable by anyone within the lead window
  const seen = await runAsAnon(async (c) => ids(await nearby(c)))
  assert.ok(seen.includes(id))
  // frozen for the owner
  await runAs(owner, async (c) => {
    await assertBlocked(c.query(`UPDATE quests SET description='bait and switch' WHERE id=$1`, [id]), /(reviewed|row-level)/)
    await assertBlocked(c.query(`UPDATE quests SET status='pending_review' WHERE id=$1`, [id]), /(reviewed|row-level)/)
  })
})

test('approve without photo works; ended meetups cannot be approved', async () => {
  const id = await runAs(owner, async (c) => (await meetupInsert(c, owner, { title: 'No photo' })).rows[0].id)
  await runAs(adminU, async (c) => {
    await c.query(`SELECT approve_dog_meetup($1, NULL)`, [id])
  })
  const q = (await admin(`SELECT status, media_urls FROM quests WHERE id=$1`, [id])).rows[0]
  assert.equal(q.status, 'published')
  assert.deepEqual(q.media_urls, [])

  const stale = (
    await admin(
      `INSERT INTO quests (created_by, slug, title, description, experience_class, listing_type, location_name,
          location_point, status, starts_at, expires_at, dog_size)
       VALUES ($1,'stale-pending','Stale','x','connection','dog_meetup','Park',public.ST_MakePoint(${LNG},${LAT}),
          'pending_review', ${h(-5)}, ${h(-3)}, 'all') RETURNING id`,
      [owner],
    )
  ).rows[0].id
  await runAs(adminU, async (c) => {
    await assert.rejects(c.query(`SELECT approve_dog_meetup($1, NULL)`, [stale]), /already ended/)
  })
})

test('reject flow: archived, hidden everywhere public, photo path cleared+returned, owner cannot revive', async () => {
  const photo = `${owner}/rej.jpg`
  const id = await runAs(owner, async (c) => (await meetupInsert(c, owner, { title: 'Reject me', photo })).rows[0].id)
  await runAs(other, async (c) => {
    await assert.rejects(c.query(`SELECT reject_dog_meetup($1)`, [id]), /admin only/)
  })
  const old = await runAs(adminU, async (c) => (await c.query(`SELECT reject_dog_meetup($1) AS old`, [id])).rows[0].old)
  assert.equal(old, photo)
  const q = (await admin(`SELECT status, dog_photo_pending_path FROM quests WHERE id=$1`, [id])).rows[0]
  assert.equal(q.status, 'archived')
  assert.equal(q.dog_photo_pending_path, null)
  await runAsAnon(async (c) => {
    assert.equal((await c.query(`SELECT id FROM quests WHERE id=$1`, [id])).rows.length, 0)
    assert.ok(!ids(await nearby(c)).includes(id))
  })
  await runAs(owner, async (c) => {
    await assertBlocked(c.query(`UPDATE quests SET status='pending_review' WHERE id=$1`, [id]), /(reviewed|row-level)/)
  })
  const after = (await admin(`SELECT status FROM quests WHERE id=$1`, [id])).rows[0].status
  assert.equal(after, 'archived')
})

// ─── Upcoming window + expiry ────────────────────────────────────────────────
async function seedPublished(slug, startsExpr, endsExpr, type = 'dog_meetup', extra = '') {
  const r = await admin(
    `INSERT INTO quests (created_by, slug, title, description, experience_class, listing_type, location_name,
        location_point, location_radius_m, status, starts_at, expires_at, dog_size, published_at ${extra ? ', ' + extra.cols : ''})
     VALUES ($1,$2,$2,'d','connection',${type === 'null' ? 'NULL' : `'${type}'`},'Park',
        public.ST_MakePoint(${LNG},${LAT}),100,'published',${startsExpr},${endsExpr},
        ${type === 'dog_meetup' ? `'all'` : 'NULL'}, now() ${extra ? ', ' + extra.vals : ''}) RETURNING id`,
    [owner, slug],
  )
  return r.rows[0].id
}

test('window: visible up to 14 days before start and while running; hidden after end; rows preserved', async () => {
  const soon = await seedPublished('w-soon', h(48), h(50))
  const day13 = await seedPublished('w-13d', `now() + interval '13 days'`, `now() + interval '13 days 2 hours'`)
  const day15 = await seedPublished('w-15d', `now() + interval '15 days'`, `now() + interval '15 days 2 hours'`)
  const running = await seedPublished('w-running', h(-1), h(1))
  const ended = await seedPublished('w-ended', h(-4), h(-2))
  const seen = await runAsAnon(async (c) => ids(await nearby(c)))
  assert.ok(seen.includes(soon))
  assert.ok(seen.includes(day13))
  assert.ok(!seen.includes(day15), '15 days out is beyond the 14-day lead window')
  assert.ok(seen.includes(running))
  assert.ok(!seen.includes(ended), 'hidden after end')
  const row = (await admin(`SELECT status FROM quests WHERE id=$1`, [ended])).rows[0]
  assert.equal(row.status, 'published', 'expired meetups stay published (history preserved)')
})

test('other listing types keep their original timing (future starts_at stays hidden; no meetup fields)', async () => {
  const future = await seedPublished('o-future', h(48), h(50), 'null')
  const open = await seedPublished('o-open', 'NULL', 'NULL', 'null')
  const expired = await seedPublished('o-expired', 'NULL', h(-1), 'null')
  const rows = await runAsAnon(async (c) => (await nearby(c)).rows)
  const seen = rows.map((r) => r.id)
  assert.ok(!seen.includes(future), 'starts_at in the future is still hidden for non-meetups (023 behaviour)')
  assert.ok(seen.includes(open))
  assert.ok(!seen.includes(expired))
  assert.equal(rows.find((r) => r.id === open).dog_size, null)
})

test('radius still applies to meetups', async () => {
  const far = (
    await admin(
      `INSERT INTO quests (created_by, slug, title, description, experience_class, listing_type, location_name,
          location_point, status, starts_at, expires_at, dog_size, published_at)
       VALUES ($1,'far-meetup','Far','d','connection','dog_meetup','Park',public.ST_MakePoint(-118.2,34.0),
          'published', ${h(48)}, ${h(50)}, 'all', now()) RETURNING id`,
      [owner],
    )
  ).rows[0].id
  const seen = await runAsAnon(async (c) => ids(await nearby(c)))
  assert.ok(!seen.includes(far))
})

// ─── No verification / trust for meetups ─────────────────────────────────────
test('completing a meetup never verifies the location or grants trust; normal quests still do', async () => {
  const meetup = await seedPublished('v-meetup', h(-1), h(1))
  const normal = await seedPublished('v-normal', 'NULL', 'NULL', 'null')
  const trust = async (id) => Number((await admin(`SELECT trust_score FROM profiles WHERE id=$1`, [id])).rows[0].trust_score)
  const t0 = { owner: await trust(owner), other: await trust(other) }
  // three completers on each (verification threshold is by distinct completers)
  const extra = (await admin(`INSERT INTO profiles (full_name, username) VALUES ('c1','c1'),('c2','c2') RETURNING id`)).rows.map((r) => r.id)
  for (const qid of [meetup, normal]) {
    for (const u of [other, adminU, ...extra]) {
      await admin(`INSERT INTO quest_completions (user_id, quest_id) VALUES ($1,$2)`, [u, qid])
    }
  }
  const m = (await admin(`SELECT verified_location, completed_count FROM quests WHERE id=$1`, [meetup])).rows[0]
  assert.equal(m.verified_location, false)
  assert.equal(m.completed_count, 4, 'completion history is preserved')
  const n = (await admin(`SELECT verified_location FROM quests WHERE id=$1`, [normal])).rows[0]
  assert.equal(n.verified_location, true, 'control: normal quests still verify')
  const rpc = (await runAsAnon(async (c) => (await nearby(c)).rows)).find((r) => r.id === meetup)
  assert.equal(rpc.verified_location, false)
  assert.equal(rpc.completed_count, 0, 'completion count is not advertised as attendance proof')
  assert.equal(await trust(owner), t0.owner + 5, 'control: creator earned +5 from the NORMAL quest only')
})

// ─── Reports ─────────────────────────────────────────────────────────────────
test('reports: one per user, own insert only, published only, rate-limited, admin-only review', async () => {
  const pub = await seedPublished('r-pub', h(48), h(50))
  const pending = await runAs(owner, async (c) => (await meetupInsert(c, owner)).rows[0].id)

  await runAs(other, async (c) => {
    const first = await c.query(`SELECT report_quest($1,'inappropriate_content','bad') AS ok`, [pub])
    assert.equal(first.rows[0].ok, true)
    const dup = await c.query(`SELECT report_quest($1,'spam_or_commercial',NULL) AS ok`, [pub])
    assert.equal(dup.rows[0].ok, false, 'second report by same user is ignored')
    await assert.rejects(c.query(`SELECT report_quest($1,'other',$2)`, [pub, 'x'.repeat(501)]), /(500|too long|violates)/)
    // cannot report pending (invisible) meetups
    const pend = await c.query(`SELECT report_quest($1,'other',NULL) AS ok`, [pending]).catch((e) => e)
    assert.ok(pend instanceof Error || pend.rows[0].ok === false)
    // direct insert for someone else is blocked
    await assert.rejects(
      c.query(`INSERT INTO quest_reports (quest_id, reporter_user_id, reason) VALUES ($1,$2,'other')`, [pub, owner]),
      /row-level security/,
    )
    // cannot self-review
    await assert.rejects(
      c.query(`UPDATE quest_reports SET status='dismissed'`),
      /(permission denied|row-level)/,
    ).catch(async () => {
      const r = await c.query(`UPDATE quest_reports SET status='dismissed' RETURNING 1`)
      assert.equal(r.rowCount, 0)
    })
    const mine = await c.query(`SELECT quest_id FROM quest_reports`)
    assert.equal(mine.rows.length, 1)
  })
  await runAs(owner, async (c) => {
    const r = await c.query(`SELECT 1 FROM quest_reports`)
    assert.equal(r.rows.length, 0, 'other users cannot read reports (not even the quest owner)')
  })
  await runAsAnon(async (c) => {
    await assert.rejects(c.query(`SELECT 1 FROM quest_reports`), /permission denied/)
    await assert.rejects(c.query(`SELECT report_quest($1,'other',NULL)`, [pub]), /permission denied/)
  })
  await runAs(adminU, async (c) => {
    const all = await c.query(`SELECT id, status FROM quest_reports WHERE quest_id=$1`, [pub])
    assert.equal(all.rows.length, 1)
    const upd = await c.query(
      `UPDATE quest_reports SET status='reviewed', reviewed_by=auth.uid(), reviewed_at=now() WHERE id=$1 RETURNING status`,
      [all.rows[0].id],
    )
    assert.equal(upd.rows[0].status, 'reviewed')
    // admin cannot rewrite the report content
    await assert.rejects(c.query(`UPDATE quest_reports SET reason='other'`), /permission denied/)
  })
})

test('reports: rate limit (20 per 24h per user)', async () => {
  const quests = []
  for (let i = 0; i < 21; i++) quests.push(await seedPublished(`rl-${i}`, h(48), h(50)))
  await runAs(adminU, async () => {})
  const limited = (
    await admin(`INSERT INTO profiles (full_name, username) VALUES ('rl','rl') RETURNING id`)
  ).rows[0].id
  await runAs(limited, async (c) => {
    for (let i = 0; i < 20; i++) {
      const r = await c.query(`SELECT report_quest($1,'other',NULL) AS ok`, [quests[i]])
      assert.equal(r.rows[0].ok, true)
    }
    await assert.rejects(c.query(`SELECT report_quest($1,'other',NULL)`, [quests[20]]), /(too many|rate|limit)/i)
  })
})

// ─── Idempotency ─────────────────────────────────────────────────────────────
test('030–034 re-apply cleanly (idempotent)', async () => {
  const dir = join(ROOT, 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => /^03[0-4]_/.test(f)).sort()
  assert.equal(files.length, 5)
  const c = await pool.connect()
  try {
    for (const f of files) await c.query(adaptSql(readFileSync(join(dir, f), 'utf8')))
  } finally {
    c.release()
  }
})

// ─── Pre-existing risk + proposed fix (NOT in the migration chain) ───────────
test('FINDING: repo-defined profiles RLS lets a user set their own is_admin (proposed fix blocks it)', async () => {
  const victim = (await admin(`INSERT INTO profiles (full_name, username) VALUES ('Mallory','mal') RETURNING id`)).rows[0].id
  // Without protection (as in the repo’s 001 policy): the escalation works.
  await runAs(victim, async (c) => {
    const r = await c.query(`UPDATE profiles SET is_admin = true WHERE id = auth.uid() RETURNING is_admin`)
    assert.equal(r.rows[0].is_admin, true, 'documents the pre-existing exposure in the repo schema')
  })
  await admin(`UPDATE profiles SET is_admin=false WHERE id=$1`, [victim])
  // Apply the proposed (separate, unapplied) fix and re-test.
  await admin(readFileSync(join(ROOT, 'docs', 'proposed', 'profiles_protect_privileged_columns.sql'), 'utf8'))
  await runAs(victim, async (c) => {
    await assert.rejects(c.query(`UPDATE profiles SET is_admin = true WHERE id = auth.uid()`), /cannot be changed/)
    await assert.rejects(c.query(`UPDATE profiles SET trust_score = 999 WHERE id = auth.uid()`), /cannot be changed/)
    const ok = await c.query(`UPDATE profiles SET bio='hello' WHERE id = auth.uid() RETURNING bio`)
    assert.equal(ok.rows[0].bio, 'hello')
  })
  // Legit nested trust updates still work (normal quest completion by a user).
  const nq = await seedPublished('fix-normal', 'NULL', 'NULL', 'null')
  await runAs(victim, async (c) => {
    await c.query(`INSERT INTO quest_completions (user_id, quest_id) VALUES (auth.uid(), $1)`, [nq])
  })
})
