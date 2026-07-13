/**
 * Explorer Markers — DATABASE-LEVEL security + concurrency tests.
 *
 * Runs migration 027 against a real (local/dev) Postgres and verifies RLS,
 * function permissions, award idempotency, inventory enforcement, Legacy
 * uniqueness, discovery eligibility, privacy filtering, and the advisory-
 * lock serialization of concurrent placements.
 *
 * Requirements (NOT part of `npm test` — opt-in, needs a database):
 *   * a local Postgres you can trash (the run RESETS public/auth/extensions
 *     schemas in the target database)
 *   * `pg` available (npm i -D pg, or NODE_PATH pointing at a copy)
 *   * DATABASE_URL, e.g. postgres://postgres:postgres@localhost:55432/xnext_test
 *
 * Run:  DATABASE_URL=... node --test tests/db/markerDb.test.mjs
 *
 * The harness shim (supabase/tests/harness_shim.sql) recreates auth.uid(),
 * anon/authenticated roles, and a haversine ST_DWithin so 027 applies on
 * plain Postgres. NEVER apply the shim to a Supabase project.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/xnext_test'

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 })

/** Run `fn` on a dedicated connection impersonating a signed-in user. */
async function runAs(userId, fn) {
  const client = await pool.connect()
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
    await client.query(`SET ROLE authenticated`)
    return await fn(client)
  } finally {
    await client.query(`RESET ROLE`).catch(() => {})
    await client.query(`RESET ALL`).catch(() => {})
    client.release()
  }
}

async function runAsAnon(fn) {
  const client = await pool.connect()
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
    await client.query(`SET ROLE anon`)
    return await fn(client)
  } finally {
    await client.query(`RESET ROLE`).catch(() => {})
    await client.query(`RESET ALL`).catch(() => {})
    client.release()
  }
}

// Fixture ids (filled in `before`)
let userA, userB, userC
let quest1, quest2, questFar

before(async () => {
  const c = await pool.connect()
  try {
    // Full local reset (fresh application of shim + 027 every run).
    await c.query(`DROP SCHEMA IF EXISTS public CASCADE`)
    await c.query(`DROP SCHEMA IF EXISTS auth CASCADE`)
    await c.query(`DROP SCHEMA IF EXISTS extensions CASCADE`)
    await c.query(`CREATE SCHEMA public`)
    await c.query(`GRANT ALL ON SCHEMA public TO public`)

    await c.query(readFileSync(join(ROOT, 'supabase', 'tests', 'harness_shim.sql'), 'utf8'))

    // Apply 027 verbatim, minus the PostGIS extension line (shimmed locally).
    const migration = readFileSync(
      join(ROOT, 'supabase', 'migrations', '027_explorer_markers.sql'),
      'utf8',
    ).replace(/^CREATE EXTENSION IF NOT EXISTS postgis.*$/m, '-- (postgis shimmed by harness)')
    await c.query(migration)

    // Fixtures: three explorers, three experiences.
    const users = await c.query(
      `INSERT INTO profiles (full_name, username) VALUES
        ('Explorer A', 'a'), ('Explorer B', 'b'), ('Explorer C', 'c')
       RETURNING id`,
    )
    ;[userA, userB, userC] = users.rows.map((r) => r.id)

    const quests = await c.query(
      `INSERT INTO quests (title, slug, status, location_point, location_radius_m) VALUES
        ('Valley of Fire', 'valley-of-fire', 'published', extensions.ST_MakePoint(-114.5, 36.4), 500),
        ('Hidden Falls', 'hidden-falls', 'published', extensions.ST_MakePoint(-119.1, 46.2), 500),
        ('Far Ridge', 'far-ridge', 'published', extensions.ST_MakePoint(10.0, 50.0), 500)
       RETURNING id`,
    )
    ;[quest1, quest2, questFar] = quests.rows.map((r) => r.id)

    // A and C completed quest1; A also completed quest2.
    await c.query(
      `INSERT INTO quest_completions (user_id, quest_id) VALUES
        ($1, $3), ($1, $4), ($2, $3)`,
      [userA, userC, quest1, quest2],
    )
  } finally {
    c.release()
  }
})

after(async () => {
  await pool.end()
})

// ─── Function permissions ────────────────────────────────────────────────────

test('count_verified_completions(uuid) is NOT executable by authenticated (no cross-user counts)', async () => {
  await runAs(userB, async (c) => {
    await assert.rejects(
      c.query(`SELECT public.count_verified_completions($1)`, [userA]),
      /permission denied/i,
    )
  })
})

test('get_my_verified_completion_count() returns only the caller’s own count', async () => {
  const a = await runAs(userA, (c) => c.query(`SELECT public.get_my_verified_completion_count() n`))
  const b = await runAs(userB, (c) => c.query(`SELECT public.get_my_verified_completion_count() n`))
  assert.equal(a.rows[0].n, 2) // A completed quest1 + quest2
  assert.equal(b.rows[0].n, 0) // B completed nothing — and cannot see A's 2
})

test('anon cannot execute placement or claims', async () => {
  await runAsAnon(async (c) => {
    await assert.rejects(c.query(`SELECT public.claim_explorer_milestones()`), /permission denied/i)
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest1]),
      /permission denied/i,
    )
  })
})

// ─── Awards: idempotent, unforgeable ─────────────────────────────────────────

test('claim is idempotent; awards cannot be forged or read cross-user', async () => {
  const first = await runAs(userA, (c) => c.query(`SELECT * FROM public.claim_explorer_milestones()`))
  assert.equal(first.rows.length, 1) // Trail milestone (A has 2 completions)
  assert.equal(first.rows[0].tier, 'trail')
  assert.equal(first.rows[0].quantity, 3)

  const second = await runAs(userA, (c) => c.query(`SELECT * FROM public.claim_explorer_milestones()`))
  assert.equal(second.rows.length, 0) // impossible to claim twice

  await runAs(userB, async (c) => {
    // Cannot grant self awards directly (no INSERT policy).
    await assert.rejects(
      c.query(
        `INSERT INTO explorer_marker_awards (user_id, tier, quantity, reason, milestone_key)
         VALUES ($1, 'legacy', 99, 'forged', 'completions_500')`,
        [userB],
      ),
      /row-level security/i,
    )
    // Cannot read A's award ledger.
    const rows = await c.query(`SELECT * FROM explorer_marker_awards WHERE user_id = $1`, [userA])
    assert.equal(rows.rows.length, 0)
  })
})

// ─── Placement rules ─────────────────────────────────────────────────────────

test('placement rejected without completion, with bad notes, and without inventory', async () => {
  await runAs(userB, async (c) => {
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest1]),
      /Complete this experience/i,
    )
  })
  await runAs(userA, async (c) => {
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'trail', $2, NULL)`, [quest1, 'x'.repeat(121)]),
      /120 characters/i,
    )
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'trail', 'see https://spam.example', NULL)`, [quest1]),
      /cannot contain links/i,
    )
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'gold', NULL, NULL)`, [quest1]),
      /No gold markers available/i,
    )
  })
})

test('placement succeeds at a completed experience; inventory depletes to zero', async () => {
  await runAs(userA, async (c) => {
    await c.query(`SELECT public.place_explorer_marker($1, 'trail', 'The east rim at sunrise', NULL)`, [quest1])
    await c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest2])
    await c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest1])
    // 3 awarded, 3 active → none left.
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest2]),
      /No trail markers available/i,
    )
    const inv = await c.query(
      `SELECT available FROM public.get_my_marker_inventory() WHERE tier = 'trail'`,
    )
    assert.equal(Number(inv.rows[0].available), 0)
  })
})

// ─── Raw-row privacy (hardened SELECT policy) ────────────────────────────────

test('B cannot SELECT A’s raw marker rows; owner still sees their own', async () => {
  const asB = await runAs(userB, (c) =>
    c.query(`SELECT * FROM explorer_markers WHERE owner_user_id = $1`, [userA]),
  )
  assert.equal(asB.rows.length, 0) // policy hides other users' raw rows entirely

  const asA = await runAs(userA, (c) => c.query(`SELECT * FROM explorer_markers`))
  assert.equal(asA.rows.length, 3) // owner's complete record
})

test('B cannot UPDATE or DELETE A’s marker', async () => {
  await runAs(userB, async (c) => {
    const upd = await c.query(
      `UPDATE explorer_markers SET note = 'defaced' WHERE owner_user_id = $1`,
      [userA],
    )
    assert.equal(upd.rowCount, 0)
    const del = await c.query(`DELETE FROM explorer_markers WHERE owner_user_id = $1`, [userA])
    assert.equal(del.rowCount, 0)
  })
})

// ─── Privacy-aware read path ─────────────────────────────────────────────────

test('get_experience_markers shows community names, anonymizes private profiles', async () => {
  const before = await runAs(userB, (c) =>
    c.query(`SELECT * FROM public.get_experience_markers($1)`, [quest1]),
  )
  assert.equal(before.rows.length, 2)
  assert.equal(before.rows[0].explorer_name, 'Explorer A') // default: community

  const su = await pool.connect()
  await su.query(`UPDATE profiles SET journey_visibility = 'private' WHERE id = $1`, [userA])
  su.release()

  const after = await runAs(userB, (c) =>
    c.query(`SELECT * FROM public.get_experience_markers($1)`, [quest1]),
  )
  assert.equal(after.rows[0].explorer_name, 'An explorer')
  assert.equal(after.rows[0].note, null) // private profile's note withheld

  const asOwner = await runAs(userA, (c) =>
    c.query(`SELECT * FROM public.get_experience_markers($1)`, [quest1]),
  )
  const mine = asOwner.rows.find((r) => r.is_mine)
  assert.ok(mine.note !== undefined) // owner always sees their own record
})

// ─── Discovery ───────────────────────────────────────────────────────────────

test('discovery: remote rejected, nearby accepted, duplicate rejected, own marker rejected', async () => {
  const marker = await runAs(userA, (c) =>
    c.query(`SELECT id FROM explorer_markers WHERE quest_id = $1 AND note IS NOT NULL`, [quest1]),
  )
  const markerId = marker.rows[0].id

  await runAs(userB, async (c) => {
    // No completion, no coordinates → rejected.
    await assert.rejects(
      c.query(`SELECT public.discover_explorer_marker($1, NULL, NULL)`, [markerId]),
      /Reach this experience/i,
    )
    // Coordinates far from the quest → rejected.
    await assert.rejects(
      c.query(`SELECT public.discover_explorer_marker($1, 50.0, 10.0)`, [markerId]),
      /Reach this experience/i,
    )
    // Within the 500 m radius → success.
    await c.query(`SELECT public.discover_explorer_marker($1, 36.4001, -114.5001)`, [markerId])
    // Duplicate discovery → rejected (unique constraint + friendly error).
    await assert.rejects(
      c.query(`SELECT public.discover_explorer_marker($1, 36.4001, -114.5001)`, [markerId]),
      /Already part of your journey/i,
    )
  })

  await runAs(userA, async (c) => {
    await assert.rejects(
      c.query(`SELECT public.discover_explorer_marker($1, 36.4001, -114.5001)`, [markerId]),
      /your own marker/i,
    )
  })

  // Keepsakes flow through the privacy-aware RPC (A is private → note NULL).
  const keeps = await runAs(userB, (c) => c.query(`SELECT * FROM public.get_my_keepsakes(50)`))
  assert.equal(keeps.rows.length, 1)
  assert.equal(keeps.rows[0].quest_title, 'Valley of Fire')
  assert.equal(keeps.rows[0].note, null)

  // Discovery never removes the marker.
  const still = await runAs(userA, (c) =>
    c.query(`SELECT status FROM explorer_markers WHERE id = $1`, [markerId]),
  )
  assert.equal(still.rows[0].status, 'active')
})

// ─── Legacy uniqueness ───────────────────────────────────────────────────────

test('only one active Legacy Marker per explorer', async () => {
  const su = await pool.connect()
  await su.query(
    `INSERT INTO explorer_marker_awards (user_id, tier, quantity, reason, milestone_key)
     VALUES ($1, 'legacy', 2, 'test fixture', 'completions_500')`,
    [userA],
  )
  su.release()

  await runAs(userA, async (c) => {
    await c.query(`SELECT public.place_explorer_marker($1, 'legacy', NULL, NULL)`, [quest1])
    await assert.rejects(
      c.query(`SELECT public.place_explorer_marker($1, 'legacy', NULL, NULL)`, [quest2]),
      /already have an active Legacy Marker/i,
    )
  })
})

// ─── Grace-window cancellation ───────────────────────────────────────────────

test('cancellation inside grace returns marker to inventory; record is kept', async () => {
  await runAs(userA, async (c) => {
    const placed = await c.query(
      `SELECT id FROM explorer_markers WHERE tier = 'legacy' AND status = 'active'`,
    )
    await c.query(`SELECT public.cancel_explorer_marker($1)`, [placed.rows[0].id])

    const inv = await c.query(
      `SELECT available FROM public.get_my_marker_inventory() WHERE tier = 'legacy'`,
    )
    assert.equal(Number(inv.rows[0].available), 2) // returned to inventory

    const audit = await c.query(
      `SELECT status, consumed, retired_at FROM explorer_markers WHERE id = $1`,
      [placed.rows[0].id],
    )
    assert.equal(audit.rows[0].status, 'retired') // audit trail preserved
    assert.equal(audit.rows[0].consumed, false)
    assert.ok(audit.rows[0].retired_at)
  })
})

test('cancellation after the grace window is rejected (marker permanent)', async () => {
  await runAs(userA, async (c) => {
    const placed = await c.query(
      `SELECT public.place_explorer_marker($1, 'legacy', NULL, NULL) AS m`, [quest2],
    )
    const id = placed.rows[0].m.replace(/^\((.*?),.*$/, '$1')
    const su = await pool.connect()
    await su.query(`UPDATE explorer_markers SET locked_at = now() - interval '1 hour' WHERE id = $1`, [id])
    su.release()
    await assert.rejects(
      c.query(`SELECT public.cancel_explorer_marker($1)`, [id]),
      /no longer be cancelled/i,
    )
  })
})

// ─── Concurrency: advisory lock prevents inventory double-spend ─────────────

test('two concurrent placements with ONE available marker → exactly one succeeds', async () => {
  // C: 1 completion → claim → 3 trail markers. Consume 2, leaving exactly 1.
  await runAs(userC, async (c) => {
    await c.query(`SELECT public.claim_explorer_milestones()`)
    await c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest1])
    await c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest1])
  })

  // Two parallel connections race for the final marker.
  const attempt = () =>
    runAs(userC, (c) =>
      c.query(`SELECT public.place_explorer_marker($1, 'trail', NULL, NULL)`, [quest1]),
    )
  const results = await Promise.allSettled([attempt(), attempt()])

  const ok = results.filter((r) => r.status === 'fulfilled')
  const failed = results.filter((r) => r.status === 'rejected')
  assert.equal(ok.length, 1, 'exactly one placement must succeed')
  assert.equal(failed.length, 1, 'exactly one placement must fail')
  assert.match(String(failed[0].reason), /No trail markers available/i)

  // Ledger truth: 3 awarded, 3 active — never 4.
  const su = await pool.connect()
  const count = await su.query(
    `SELECT COUNT(*) n FROM explorer_markers WHERE owner_user_id = $1 AND status = 'active'`,
    [userC],
  )
  su.release()
  assert.equal(Number(count.rows[0].n), 3)
})
