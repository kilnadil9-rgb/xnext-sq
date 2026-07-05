/**
 * Unit tests for existing pure libs (RC5): Adventure Radar ranking, social
 * proof copy, Explorer Note word counting. Plain node:test — no new deps.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankQuests, proximityFactor } from '../src/lib/adventureRadar'
import { explorerProofLabel, explorerNoteWordCount } from '../src/lib/trust'
import type { NearbyQuest } from '../src/lib/supabase/types'

const NOW = Date.parse('2026-07-05T12:00:00Z')

function quest(overrides: Partial<NearbyQuest>): NearbyQuest {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't',
    slug: 't',
    description: null,
    experience_class: 'wonder',
    status: 'published',
    location_name: null,
    city: null,
    country_code: null,
    sq_score: null,
    published_at: null,
    distance_km: 1,
    lat: 46.2,
    lng: -119.1,
    ...overrides,
  } as NearbyQuest
}

test('proximityFactor: 1 at zero distance, decays with distance, never negative', () => {
  assert.equal(proximityFactor(0, 5), 1)
  assert.ok(proximityFactor(2, 5) > proximityFactor(4, 5))
  assert.ok(proximityFactor(100, 5) >= 0)
})

test('relevance: verified location breaks the tie between otherwise equal quests', () => {
  const a = quest({ id: 'plain', distance_km: 2 })
  const b = quest({ id: 'verified', distance_km: 2, verified_location: true })
  const ranked = rankQuests([a, b], { radiusKm: 5, sortMode: 'relevance', now: NOW })
  assert.equal(ranked[0].id, 'verified')
})

test('distance sort stays factual — verified must NOT jump the queue', () => {
  const near = quest({ id: 'near', distance_km: 1 })
  const farVerified = quest({ id: 'far', distance_km: 3, verified_location: true })
  const ranked = rankQuests([farVerified, near], {
    radiusKm: 5,
    sortMode: 'distance',
    now: NOW,
  })
  assert.equal(ranked[0].id, 'near')
})

test('explorerProofLabel: zero → null, singular, plural, verified wording', () => {
  assert.equal(explorerProofLabel({ completed_count: 0 }), null)
  assert.equal(explorerProofLabel({}), null)
  assert.equal(explorerProofLabel({ completed_count: 1 }), '1 explorer completed this')
  assert.equal(explorerProofLabel({ completed_count: 4 }), '4 explorers completed this')
  assert.equal(
    explorerProofLabel({ completed_count: 12, verified_location: true }),
    '12 explorers verified this location',
  )
})

test('explorerNoteWordCount: trims, collapses whitespace, handles empty', () => {
  assert.equal(explorerNoteWordCount(''), 0)
  assert.equal(explorerNoteWordCount('   '), 0)
  assert.equal(explorerNoteWordCount('Bring bug spray.'), 3)
  assert.equal(explorerNoteWordCount('  Parking   fills  after   noon  '), 4)
  assert.equal(
    explorerNoteWordCount('one two three four five six seven eight nine'),
    9,
  )
})
