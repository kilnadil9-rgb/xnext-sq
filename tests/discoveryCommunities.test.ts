/**
 * The Chase — unit tests for the pure community/marker domain lib:
 * Community Intelligence (behavior → belonging), quest classification,
 * rarity mapping, reputation ordering, teaser distances.
 * Plain node:test, zero new deps — matches the RC5 harness.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DISCOVERY_COMMUNITIES,
  MARKER_CONTRIBUTION_TYPES,
  adjacentSuggestion,
  chaseDistanceLabel,
  classifyQuest,
  computeCommunityAffinity,
  markerCommunity,
  markerReputationScore,
  markerTypeConfig,
  rarityForTier,
  strongestCommunity,
} from '../src/lib/discoveryCommunities'

// ── Catalog sanity ───────────────────────────────────────────────────────────

test('catalog: 12 communities, adjacents all resolve, ids unique', () => {
  assert.equal(DISCOVERY_COMMUNITIES.length, 12)
  const ids = new Set(DISCOVERY_COMMUNITIES.map((c) => c.id))
  assert.equal(ids.size, 12)
  for (const c of DISCOVERY_COMMUNITIES) {
    for (const adj of c.adjacent) {
      assert.ok(ids.has(adj), `${c.id} → unknown adjacent ${adj}`)
      assert.notEqual(adj, c.id, `${c.id} adjacent to itself`)
    }
  }
})

test('catalog: 9 contribution types with unique keys', () => {
  assert.equal(MARKER_CONTRIBUTION_TYPES.length, 9)
  assert.equal(new Set(MARKER_CONTRIBUTION_TYPES.map((t) => t.type)).size, 9)
})

// ── Quest classification ─────────────────────────────────────────────────────

test('classifyQuest matches tags and title keywords', () => {
  assert.deepEqual(
    classifyQuest({ title: 'Badger Mountain Trailhead', tags: ['hiking'] }),
    ['hiking'],
  )
  const multi = classifyQuest({
    title: 'Palouse Falls sunset viewpoint hike',
    tags: [],
  })
  assert.ok(multi.includes('waterfalls'))
  assert.ok(multi.includes('sunsets'))
  assert.ok(multi.includes('hiking'))
  assert.ok(multi.includes('photography')) // "viewpoint"
})

test('classifyQuest returns [] for unclassifiable experiences', () => {
  assert.deepEqual(classifyQuest({ title: 'Mystery location' }), [])
})

// ── Community Intelligence Engine ────────────────────────────────────────────

test('behavior determines community: 15 photo + 2 hikes + 1 coffee → Photography', () => {
  const completions = [
    ...Array.from({ length: 15 }, (_, i) => ({ title: `Overlook viewpoint ${i}` })),
    { title: 'Candy Mountain trail' },
    { title: 'Badger summit hike' },
    { title: 'Roasters coffee stop' },
  ]
  const affinities = computeCommunityAffinity(completions)
  const home = strongestCommunity(affinities)
  assert.equal(home?.id, 'photography')
  assert.equal(affinities[0].completions, 15)
  assert.ok(affinities[0].share > 0.8)
})

test('no completions → no home community (never invented)', () => {
  assert.equal(strongestCommunity(computeCommunityAffinity([])), null)
})

test('adjacentSuggestion surfaces an uninhabited neighbor world, deterministically per day', () => {
  const affinities = computeCommunityAffinity([
    { title: 'Photogenic mural walk' },
    { title: 'Panorama overlook' },
  ])
  const now = Date.parse('2026-07-20T12:00:00Z')
  const s1 = adjacentSuggestion(affinities, now)
  const s2 = adjacentSuggestion(affinities, now)
  assert.ok(s1 && ['sunsets', 'waterfalls'].includes(s1.id))
  assert.equal(s1?.id, s2?.id) // stable within a day
  assert.equal(adjacentSuggestion([], now), null)
})

// ── Markers 2.0 helpers ──────────────────────────────────────────────────────

test('markerCommunity: quest signal wins, then type lean, else universal', () => {
  assert.equal(markerCommunity({ title: 'Hidden waterfall gorge' }, 'secret_tip'), 'waterfalls')
  assert.equal(markerCommunity({ title: 'Somewhere' }, 'hidden_photo'), 'photography')
  assert.equal(markerCommunity({ title: 'Somewhere' }, 'secret_tip'), null)
})

test('markerTypeConfig falls back to favorite_spot for unknown types', () => {
  assert.equal(markerTypeConfig('not_a_type').type, 'favorite_spot')
  assert.equal(markerTypeConfig('warning').icon, '⚠️')
})

test('rarity derives from the earned tier ledger', () => {
  assert.equal(rarityForTier('trail'), 'common')
  assert.equal(rarityForTier('bronze'), 'rare')
  assert.equal(rarityForTier('silver'), 'rare')
  assert.equal(rarityForTier('gold'), 'epic')
  assert.equal(rarityForTier('diamond'), 'legendary')
  assert.equal(rarityForTier('legacy'), 'legacy')
})

test('reputation: signals outweigh raw unlocks; freshness breaks ties', () => {
  const now = Date.parse('2026-07-20T12:00:00Z')
  const old = new Date(now - 60 * 86_400_000).toISOString()
  const fresh = new Date(now - 1 * 86_400_000).toISOString()
  // 5 signals beats 10 unlocks with none.
  assert.ok(
    markerReputationScore(0, 5, old, now) > markerReputationScore(10, 0, old, now),
  )
  // Same stats → the fresher marker ranks higher (living world).
  assert.ok(
    markerReputationScore(3, 2, fresh, now) > markerReputationScore(3, 2, old, now),
  )
})

test('chaseDistanceLabel: coarse, mile-based teasing', () => {
  assert.equal(chaseDistanceLabel(0.96), '0.6 miles away')
  assert.equal(chaseDistanceLabel(0.05), 'right here')
  assert.equal(chaseDistanceLabel(40), '25 miles away')
})
