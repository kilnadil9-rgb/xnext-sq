/**
 * DB-level tests for 035 (profiles privileged columns) and 036 (quests: no
 * self-publish / admin fields). Opt-in, NOT part of `npm test`.
 * Run: DB_REPLAY_SKIP=027,029 node --test tests/db/questSelfPublishDb.test.mjs
 * (skip mirrors production, where 027/029 are not applied).
 * WARNING: resets public/auth/storage/extensions schemas of DATABASE_URL.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resetAndReplay } from './replay.mjs'

const require = createRequire(process.env.PG_RESOLVE_FROM ?? '/workspace/pgtest/')
const pg = require('pg')
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/xnext_test',
  max: 4,
})
async function runAs(uid, fn) {
  const c = await pool.connect()
  try {
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid])
    await c.query(`SET ROLE authenticated`)
    return await fn(c)
  } finally {
    await c.query('RESET ROLE').catch(() => {})
    await c.query('RESET ALL').catch(() => {})
    c.release()
  }
}
const su = (s, p) => pool.query(s, p)
let user, adminU, n = 0
async function mkUser(isAdmin) {
  const { rows } = await su(`INSERT INTO auth.users(id) VALUES (gen_random_uuid()) RETURNING id`)
  const id = rows[0].id
  await su(`INSERT INTO public.profiles(id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [id])
  if (isAdmin) await su(`UPDATE public.profiles SET is_admin = true WHERE id = $1`, [id])
  return id
}
const ins = (c, uid, extra = {}) => {
  const cols = { title: `t${++n}`, slug: `s-${n}-${Date.now()}`, created_by: uid, status: 'draft', experience_class: 'wonder', ...extra }
  const k = Object.keys(cols)
  return c.query(`INSERT INTO public.quests(${k.join(',')}) VALUES (${k.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, Object.values(cols))
}
const denied = (p) => assert.rejects(p, (e) => e.code === '42501' || /row-level security|cannot|Only an admin|admin-controlled/i.test(e.message))

before(async () => {
  const c = await pool.connect()
  try { await resetAndReplay(c) } finally { c.release() }
  user = await mkUser(false)
  adminU = await mkUser(true)
})
after(() => pool.end())

test('035: user cannot set own is_admin / trust_score; ordinary edit works', async () => {
  await runAs(user, async (c) => {
    await denied(c.query(`UPDATE public.profiles SET is_admin = true WHERE id = $1`, [user]))
    await denied(c.query(`UPDATE public.profiles SET trust_score = 99 WHERE id = $1`, [user]))
    const r = await c.query(`UPDATE public.profiles SET bio = 'hi' WHERE id = $1`, [user])
    assert.equal(r.rowCount, 1)
  })
})

test('036: user may create draft / pending_review, not published', async () => {
  await runAs(user, async (c) => {
    assert.equal((await ins(c, user)).rowCount, 1)
    assert.equal((await ins(c, user, { status: 'pending_review' })).rowCount, 1)
    await denied(ins(c, user, { status: 'published' }))
    await denied(ins(c, user, { status: 'pending_review', payment_status: 'paid' }))
    await denied(ins(c, user, { status: 'draft', priority_boost: 5 }))
  })
})

test('036: paid-listing insert shape (PostListingPage) is allowed', async () => {
  await runAs(user, async (c) => {
    const r = await ins(c, user, { status: 'pending_review', is_paid_listing: true, payment_status: 'pending', tier: 'yard_sale', listing_type: 'yard_sale', is_featured: false, starts_at: new Date(), expires_at: new Date(Date.now() + 864e5) })
    assert.equal(r.rowCount, 1)
  })
})

test('036: user cannot self-publish or change admin fields; can unpublish/archive', async () => {
  const q = await runAs(user, async (c) => (await ins(c, user, { status: 'pending_review', is_paid_listing: true, payment_status: 'pending', tier: 'yard_sale', starts_at: new Date(), expires_at: new Date(Date.now() + 864e5) })).rows[0])
  await runAs(user, async (c) => {
    await denied(c.query(`UPDATE public.quests SET status='published' WHERE id=$1`, [q.id]))
    for (const set of [`payment_status='paid'`, `tier='monthly_partner'`, `is_paid_listing=false`, `published_at=now()`, `is_featured=true`, `verified_location=true`, `completed_count=9`, `priority_boost=3`, `expires_at=expires_at + interval '30 days'`]) {
      await denied(c.query(`UPDATE public.quests SET ${set} WHERE id=$1`, [q.id]))
    }
    assert.equal((await c.query(`UPDATE public.quests SET title='edited' WHERE id=$1`, [q.id])).rowCount, 1)
  })
  // service role (stripe-webhook) can mark paid; admin can publish
  await su(`UPDATE public.quests SET payment_status='paid' WHERE id=$1`, [q.id])
  await runAs(adminU, async (c) => {
    const r = await c.query(`UPDATE public.quests SET status='published', published_at=now() WHERE id=$1 RETURNING status`, [q.id])
    assert.equal(r.rows[0].status, 'published')
  })
  // editing a live quest sends it back to review
  await runAs(user, async (c) => {
    const r = await c.query(`UPDATE public.quests SET description='changed' WHERE id=$1 RETURNING status`, [q.id])
    assert.equal(r.rows[0].status, 'pending_review')
  })
  await su(`UPDATE public.quests SET status='published' WHERE id=$1`, [q.id])
  await runAs(user, async (c) => {
    assert.equal((await c.query(`UPDATE public.quests SET status='draft' WHERE id=$1 RETURNING status`, [q.id])).rows[0].status, 'draft')
    assert.equal((await c.query(`UPDATE public.quests SET status='archived' WHERE id=$1 RETURNING status`, [q.id])).rows[0].status, 'archived')
  })
})

test('036: admin can still edit admin fields directly', async () => {
  const q = await runAs(user, async (c) => (await ins(c, user)).rows[0])
  await runAs(adminU, async (c) => {
    const r = await c.query(`UPDATE public.quests SET is_featured=true, priority_boost=2, status='published', published_at=now() WHERE id=$1`, [q.id])
    assert.equal(r.rowCount, 1)
  })
})

test('035/036 trust + verified path still works via completions trigger', async () => {
  const q = (await su(`INSERT INTO public.quests(title, slug, created_by, status, experience_class, published_at) VALUES ('v','v-${Date.now()}',$1,'published','wonder',now()) RETURNING id`, [user])).rows[0]
  const before = (await su(`SELECT trust_score FROM public.profiles WHERE id=$1`, [user])).rows[0].trust_score
  for (let i = 0; i < 3; i++) {
    const u = await mkUser(false)
    await runAs(u, (c) => c.query(`INSERT INTO public.quest_completions(user_id, quest_id) VALUES ($1,$2)`, [u, q.id]))
  }
  const after = (await su(`SELECT trust_score FROM public.profiles WHERE id=$1`, [user])).rows[0].trust_score
  const v = (await su(`SELECT verified_location, completed_count FROM public.quests WHERE id=$1`, [q.id])).rows[0]
  assert.equal(v.verified_location, true)
  assert.equal(v.completed_count, 3)
  assert.ok(after - before >= 5)
})

test('035/036 are idempotent', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['035_profiles_protect_privileged_columns.sql', '036_quests_protect_admin_fields.sql'])
    await su(readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8'))
})
