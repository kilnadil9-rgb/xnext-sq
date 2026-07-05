/**
 * Experience Graph unit tests (RC5). Runs on plain `node --test` against tsc
 * output — zero new dependencies. See package.json "test" script.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeConfidence,
  decayCategoryFor,
  freshnessFactor,
  trustWeight,
} from '../src/lib/experienceGraph/confidence'
import type { Evidence } from '../src/lib/experienceGraph/types'

const NOW = Date.parse('2026-07-05T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

const completion = (sourceId: string, agoDays: number, trust = 0): Evidence => ({
  kind: 'completion',
  observedAt: daysAgo(agoDays),
  sourceTrust: trust,
  sourceId,
})

test('freshness is 1 now, 0.5 at one half-life, ~0.25 at two', () => {
  assert.equal(freshnessFactor(daysAgo(0), 10, NOW), 1)
  assert.ok(Math.abs(freshnessFactor(daysAgo(10), 10, NOW) - 0.5) < 1e-9)
  assert.ok(Math.abs(freshnessFactor(daysAgo(20), 10, NOW) - 0.25) < 1e-9)
})

test('freshness handles garbage input safely', () => {
  assert.equal(freshnessFactor('not-a-date', 10, NOW), 0)
  assert.equal(freshnessFactor(daysAgo(1), 0, NOW), 0)
  // future timestamps clamp to age 0 → freshness 1, never > 1
  assert.equal(freshnessFactor(daysAgo(-5), 10, NOW), 1)
})

test('trust amplifies gently: 1x at 0, capped at 2x', () => {
  assert.equal(trustWeight(0), 1)
  assert.equal(trustWeight(25), 1.5)
  assert.equal(trustWeight(50), 2)
  assert.equal(trustWeight(9999), 2)
  assert.equal(trustWeight(-10), 1)
})

test('no evidence → zero confidence', () => {
  const r = computeConfidence([], 'stable', NOW)
  assert.equal(r.confidence, 0)
  assert.equal(r.distinctSources, 0)
  assert.equal(r.lastEvidenceAt, null)
})

test('confidence increases with more distinct evidence, stays below 1', () => {
  const one = computeConfidence([completion('a', 1)], 'stable', NOW)
  const three = computeConfidence(
    [completion('a', 1), completion('b', 2), completion('c', 3)],
    'stable',
    NOW,
  )
  const ten = computeConfidence(
    Array.from({ length: 10 }, (_, i) => completion(`u${i}`, i + 1)),
    'stable',
    NOW,
  )
  assert.ok(one.confidence > 0)
  assert.ok(three.confidence > one.confidence)
  assert.ok(ten.confidence > three.confidence)
  assert.ok(ten.confidence < 1)
})

test('Sybil resistance: one source repeating is worth less than distinct sources', () => {
  const oneSourceThrice = computeConfidence(
    [completion('a', 1), completion('a', 1), completion('a', 1)],
    'stable',
    NOW,
  )
  const threeSources = computeConfidence(
    [completion('a', 1), completion('b', 1), completion('c', 1)],
    'stable',
    NOW,
  )
  assert.ok(threeSources.confidence > oneSourceThrice.confidence)
  assert.equal(oneSourceThrice.distinctSources, 1)
  assert.equal(threeSources.distinctSources, 3)
})

test('ephemeral categories decay much faster than stable ones', () => {
  const aged = [completion('a', 3), completion('b', 3), completion('c', 3)]
  const yardSale = computeConfidence(aged, 'ephemeral', NOW)
  const trail = computeConfidence(aged, 'stable', NOW)
  assert.ok(trail.confidence > yardSale.confidence)
})

test('decayCategoryFor maps real row shapes', () => {
  assert.equal(decayCategoryFor({ listing_type: 'yard_sale' }), 'ephemeral')
  assert.equal(decayCategoryFor({ listing_type: 'local_event' }), 'short')
  assert.equal(decayCategoryFor({ season_tags: ['winter'] }), 'seasonal')
  assert.equal(decayCategoryFor({ active_months: [12] }), 'seasonal')
  assert.equal(decayCategoryFor({}), 'stable')
})

test('lastEvidenceAt reports the newest contribution', () => {
  const r = computeConfidence(
    [completion('a', 9), completion('b', 2), completion('c', 5)],
    'stable',
    NOW,
  )
  assert.equal(r.lastEvidenceAt, daysAgo(2))
})
