/**
 * Explorer Markers — unit tests for the pure domain lib (progression
 * thresholds, inventory ledger math, note validation, display sorting).
 * Plain node:test, no new deps — matches the existing RC5 harness.
 *
 * Database-enforced behavior (award idempotency, RLS, placement/discovery
 * eligibility, Legacy uniqueness) lives in SECURITY DEFINER functions in
 * migration 027 and is covered by the manual QA checklist — it cannot run
 * inside this pure-node harness.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_MILESTONES,
  MARKER_NOTE_MAX_CHARS,
  MARKER_TIER_ORDER,
  computeInventory,
  isWithinGraceWindow,
  nextMilestoneFor,
  progressionLevelFor,
  sortMarkersForDisplay,
  summarizeMarkerTiers,
  unlockHintFor,
  validateMarkerNote,
} from '../src/lib/explorerMarkers'

// ─── Progression thresholds ──────────────────────────────────────────────────

test('progression: zero completions → no level (no invented Level 0)', () => {
  assert.equal(progressionLevelFor(0), null)
  assert.equal(progressionLevelFor(-3), null)
  assert.equal(progressionLevelFor(Number.NaN), null)
})

test('progression: exactly at each milestone boundary', () => {
  assert.equal(progressionLevelFor(1)?.level_name, 'Trail Explorer')
  assert.equal(progressionLevelFor(9)?.level_name, 'Trail Explorer')
  assert.equal(progressionLevelFor(10)?.level_name, 'Bronze Explorer')
  assert.equal(progressionLevelFor(50)?.level_name, 'Silver Explorer')
  assert.equal(progressionLevelFor(100)?.level_name, 'Gold Explorer')
  assert.equal(progressionLevelFor(250)?.level_name, 'Diamond Explorer')
  assert.equal(progressionLevelFor(500)?.level_name, 'Legacy Explorer')
  assert.equal(progressionLevelFor(10_000)?.level_name, 'Legacy Explorer')
})

test('progression: user above several milestones gets the highest, not all', () => {
  const level = progressionLevelFor(120)
  assert.equal(level?.level_name, 'Gold Explorer')
})

test('nextMilestone: points at the milestone ahead; null at the top', () => {
  assert.equal(nextMilestoneFor(0)?.milestone_key, 'first_completion')
  assert.equal(nextMilestoneFor(13)?.milestone_key, 'completions_50')
  assert.equal(nextMilestoneFor(500), null)
})

test('thresholds are configuration, not hardcode: custom config is honored', () => {
  const custom = DEFAULT_MILESTONES.map((m) =>
    m.milestone_key === 'completions_10' ? { ...m, required_completions: 5 } : m,
  )
  assert.equal(progressionLevelFor(6, custom)?.level_name, 'Bronze Explorer')
})

test('unlockHintFor: locked tier shows remaining count; unlocked shows nothing', () => {
  assert.equal(
    unlockHintFor('silver', 13),
    'Complete 37 more verified experiences to unlock Silver.',
  )
  assert.equal(
    unlockHintFor('trail', 0),
    'Complete 1 more verified experience to unlock Trail.',
  )
  assert.equal(unlockHintFor('trail', 1), null)
  assert.equal(unlockHintFor('gold', 100), null)
})

// ─── Inventory ledger math ───────────────────────────────────────────────────

test('inventory: awards minus active placements', () => {
  const inv = computeInventory(
    [{ tier: 'trail', quantity: 3 }, { tier: 'bronze', quantity: 2 }],
    [
      { tier: 'trail', status: 'active', consumed: true },
      { tier: 'trail', status: 'active', consumed: true },
    ],
  )
  const byTier = Object.fromEntries(inv.map((r) => [r.tier, r]))
  assert.equal(byTier.trail.awarded, 3)
  assert.equal(byTier.trail.available, 1)
  assert.equal(byTier.bronze.available, 2)
  assert.equal(byTier.legacy.awarded, 0)
  assert.equal(byTier.legacy.available, 0)
})

test('inventory: grace-window cancellation (consumed=false) returns to inventory', () => {
  const inv = computeInventory(
    [{ tier: 'gold', quantity: 2 }],
    [{ tier: 'gold', status: 'retired', consumed: false }],
  )
  assert.equal(inv.find((r) => r.tier === 'gold')?.available, 2)
})

test('inventory: moderation removal and permanent retirement stay consumed', () => {
  const inv = computeInventory(
    [{ tier: 'gold', quantity: 2 }],
    [
      { tier: 'gold', status: 'removed_by_moderation', consumed: true },
      { tier: 'gold', status: 'retired', consumed: true },
    ],
  )
  assert.equal(inv.find((r) => r.tier === 'gold')?.available, 0)
})

test('inventory: never negative even with inconsistent data', () => {
  const inv = computeInventory(
    [{ tier: 'trail', quantity: 1 }],
    [
      { tier: 'trail', status: 'active', consumed: true },
      { tier: 'trail', status: 'active', consumed: true },
    ],
  )
  assert.equal(inv.find((r) => r.tier === 'trail')?.available, 0)
})

test('inventory: user with zero awards has zero availability everywhere', () => {
  const inv = computeInventory([], [])
  for (const row of inv) {
    assert.equal(row.awarded, 0)
    assert.equal(row.available, 0)
  }
})

// ─── Note validation ─────────────────────────────────────────────────────────

test('note: empty is allowed (optional)', () => {
  assert.equal(validateMarkerNote(''), null)
  assert.equal(validateMarkerNote('   '), null)
})

test('note: at limit passes, over limit fails', () => {
  assert.equal(validateMarkerNote('x'.repeat(MARKER_NOTE_MAX_CHARS)), null)
  assert.ok(validateMarkerNote('x'.repeat(MARKER_NOTE_MAX_CHARS + 1)))
})

test('note: URLs rejected', () => {
  assert.ok(validateMarkerNote('check https://example.com'))
  assert.ok(validateMarkerNote('HTTP://SHOUTY.COM'))
  assert.ok(validateMarkerNote('visit www.example.com now'))
  assert.equal(validateMarkerNote('The sunrise from the east rim is unreal'), null)
})

// ─── Display helpers ─────────────────────────────────────────────────────────

test('summary: sorted Legacy→Trail and zero tiers omitted', () => {
  const summary = summarizeMarkerTiers([
    { tier: 'bronze' }, { tier: 'gold' }, { tier: 'bronze' }, { tier: 'legacy' },
  ])
  assert.deepEqual(
    summary.map((s) => `${s.count} ${s.tier}`),
    ['1 legacy', '1 gold', '2 bronze'],
  )
})

test('sort: tier order first, then most recent placement within a tier', () => {
  const sorted = sortMarkersForDisplay([
    { tier: 'silver', placed_at: '2026-07-01T00:00:00Z' },
    { tier: 'legacy', placed_at: '2026-01-01T00:00:00Z' },
    { tier: 'silver', placed_at: '2026-07-10T00:00:00Z' },
  ])
  assert.equal(sorted[0].tier, 'legacy')
  assert.equal(sorted[1].placed_at, '2026-07-10T00:00:00Z')
})

test('tier order matches the product spec', () => {
  assert.deepEqual(MARKER_TIER_ORDER, [
    'legacy', 'diamond', 'gold', 'silver', 'bronze', 'trail',
  ])
})

// ─── Grace window ────────────────────────────────────────────────────────────

test('grace window: cancellable before locked_at, permanent after', () => {
  const now = Date.parse('2026-07-12T12:00:00Z')
  assert.equal(isWithinGraceWindow('2026-07-12T13:00:00Z', now), true)
  assert.equal(isWithinGraceWindow('2026-07-12T11:00:00Z', now), false)
  assert.equal(isWithinGraceWindow('not-a-date', now), false)
})
