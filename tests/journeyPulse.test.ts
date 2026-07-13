/**
 * Journey Pulse — unit tests for the pure calculation (weights, decay,
 * caps, normalization, states, trends). Plain node:test, no new deps.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPulseCaps,
  calculateJourneyPulse,
  decayMultiplierFor,
  pulseAriaLabel,
  pulseStateFor,
  JOURNEY_PULSE_CAPS,
  JOURNEY_PULSE_STATES,
  type JourneyPulseActivity,
  type JourneyPulseActivityType,
} from '../src/lib/journeyPulse'
import { progressionLevelFor, computeInventory } from '../src/lib/explorerMarkers'

const NOW = Date.parse('2026-07-12T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

let seq = 0
function act(
  type: JourneyPulseActivityType,
  daysAgo: number,
  extra: Partial<JourneyPulseActivity> = {},
): JourneyPulseActivity {
  return {
    id: extra.id ?? `a${seq++}`,
    type,
    occurredAt: new Date(NOW - daysAgo * DAY).toISOString(),
    ...extra,
  }
}

// ─── Zero + first activity ───────────────────────────────────────────────────

test('zero qualifying activity → 0, quiet, steady', () => {
  const r = calculateJourneyPulse([], NOW)
  assert.equal(r.value, 0)
  assert.equal(r.state, 'quiet')
  assert.equal(r.trend, 'steady')
  assert.equal(r.contributingActivityCount, 0)
})

test('first verified completion registers momentum', () => {
  const r = calculateJourneyPulse([act('verified_completion', 1)], NOW)
  assert.equal(r.value, 20) // weight 20, full decay, /100 raw → 20
  assert.equal(r.state, 'awakening')
  assert.equal(r.trend, 'rising')
  assert.equal(r.contributingActivityCount, 1)
})

test('multiple qualifying activities accumulate', () => {
  const r = calculateJourneyPulse(
    [
      act('verified_completion', 1),
      act('verified_completion', 3),
      act('marker_placed', 2, { markerId: 'm1' }),
      act('explorer_note', 1, { experienceId: 'q1' }),
    ],
    NOW,
  )
  assert.equal(r.value, 49) // 20+20+6+3 = 49 raw
  assert.equal(r.state, 'steady')
})

// ─── Decay boundaries ────────────────────────────────────────────────────────

test('decay multiplier boundaries', () => {
  assert.equal(decayMultiplierFor(0), 1)
  assert.equal(decayMultiplierFor(14), 1)
  assert.equal(decayMultiplierFor(15), 0.65)
  assert.equal(decayMultiplierFor(30), 0.65)
  assert.equal(decayMultiplierFor(31), 0.3)
  assert.equal(decayMultiplierFor(60), 0.3)
  assert.equal(decayMultiplierFor(61), 0.1)
  assert.equal(decayMultiplierFor(90), 0.1)
  assert.equal(decayMultiplierFor(91), 0)
  assert.equal(decayMultiplierFor(-1), 0)
})

test('older activity contributes less; >90 days contributes nothing', () => {
  const fresh = calculateJourneyPulse([act('verified_completion', 5)], NOW)
  const older = calculateJourneyPulse([act('verified_completion', 45)], NOW)
  const ancient = calculateJourneyPulse([act('verified_completion', 120)], NOW)
  assert.ok(fresh.value > older.value)
  assert.ok(older.value > 0)
  assert.equal(ancient.value, 0)
  assert.equal(ancient.contributingActivityCount, 0)
})

test('future-dated activity is ignored (server timestamps authoritative)', () => {
  const r = calculateJourneyPulse([act('verified_completion', -2)], NOW)
  assert.equal(r.value, 0)
})

// ─── Exclusions + caps ───────────────────────────────────────────────────────

test('invalidated completions are excluded upstream: identical ids never double-count', () => {
  const dupe = act('verified_completion', 1, { id: 'same' })
  const r = calculateJourneyPulse([dupe, { ...dupe }], NOW)
  assert.equal(r.contributingActivityCount, 1)
  assert.equal(r.value, 20)
})

test('duplicate marker discovery counts once', () => {
  const r = calculateJourneyPulse(
    [
      act('marker_discovered', 1, { markerId: 'm1' }),
      act('marker_discovered', 2, { markerId: 'm1' }),
    ],
    NOW,
  )
  assert.equal(r.contributingActivityCount, 1)
})

test('photo + note contributions capped per experience', () => {
  const capped = applyPulseCaps([
    act('photo_contribution', 1, { experienceId: 'q1' }),
    act('photo_contribution', 1, { experienceId: 'q1' }),
    act('explorer_note', 1, { experienceId: 'q1' }),
    act('explorer_note', 1, { experienceId: 'q1' }),
    act('photo_contribution', 1, { experienceId: 'q2' }),
  ])
  assert.equal(capped.filter((a) => a.type === 'photo_contribution').length, 2) // q1 once + q2 once
  assert.equal(capped.filter((a) => a.type === 'explorer_note').length, 1)
  assert.equal(JOURNEY_PULSE_CAPS.photosPerExperience, 1)
})

test('marker discoveries capped per day', () => {
  const sameDay = Array.from({ length: 9 }, (_, i) =>
    act('marker_discovered', 1, { markerId: `m${i}` }),
  )
  const capped = applyPulseCaps(sameDay)
  assert.equal(capped.length, JOURNEY_PULSE_CAPS.markerDiscoveriesPerDay)
})

// ─── Normalization + states ──────────────────────────────────────────────────

test('value clamped to 0–100 even with heavy activity', () => {
  const lots = Array.from({ length: 40 }, (_, i) =>
    act('verified_completion', (i % 14) + 0.5, { experienceId: `q${i}` }),
  )
  const r = calculateJourneyPulse(lots, NOW)
  assert.equal(r.value, 100)
  assert.equal(r.state, 'thriving')
})

test('state threshold boundaries are inclusive', () => {
  assert.equal(pulseStateFor(0), 'quiet')
  assert.equal(pulseStateFor(19), 'quiet')
  assert.equal(pulseStateFor(20), 'awakening')
  assert.equal(pulseStateFor(39), 'awakening')
  assert.equal(pulseStateFor(40), 'steady')
  assert.equal(pulseStateFor(59), 'steady')
  assert.equal(pulseStateFor(60), 'rising')
  assert.equal(pulseStateFor(79), 'rising')
  assert.equal(pulseStateFor(80), 'thriving')
  assert.equal(pulseStateFor(100), 'thriving')
  // config sanity: bands tile 0..100 with no gaps
  const bands = Object.values(JOURNEY_PULSE_STATES).sort((a, b) => a[0] - b[0])
  assert.equal(bands[0][0], 0)
  assert.equal(bands[bands.length - 1][1], 100)
  for (let i = 1; i < bands.length; i++) {
    assert.equal(bands[i][0], bands[i - 1][1] + 1)
  }
})

// ─── Trend ───────────────────────────────────────────────────────────────────

test('trend rising: current 30 days meaningfully above previous 30', () => {
  const r = calculateJourneyPulse(
    [act('verified_completion', 2), act('verified_completion', 5)],
    NOW,
  )
  assert.equal(r.trend, 'rising')
})

test('trend cooling: previous period meaningfully higher — gentle wording, no loss language', () => {
  const r = calculateJourneyPulse(
    [act('verified_completion', 40), act('verified_completion', 45)],
    NOW,
  )
  assert.equal(r.trend, 'cooling')
  assert.equal(r.explanation, 'Your journey has been quieter recently.')
  assert.ok(!/dropped|behind|failed|streak/i.test(r.explanation))
})

test('trend steady: comparable periods', () => {
  const r = calculateJourneyPulse(
    [act('verified_completion', 5), act('verified_completion', 45)],
    NOW,
  )
  assert.equal(r.trend, 'steady')
  assert.equal(typeof r.previousPeriodValue, 'number')
})

// ─── Separation of systems ───────────────────────────────────────────────────

test('a quiet pulse never touches long-term progression (separate systems)', () => {
  // Explorer Level derives ONLY from verified completion counts — a cooling
  // pulse has no code path into progression or marker inventory.
  const quiet = calculateJourneyPulse([], NOW)
  assert.equal(quiet.value, 0)
  // 120 lifetime completions still yield Gold regardless of pulse.
  assert.equal(progressionLevelFor(120)?.level_name, 'Gold Explorer')
  // Earned markers remain in the ledger regardless of pulse.
  const inv = computeInventory([{ tier: 'gold', quantity: 2 }], [])
  assert.equal(inv.find((r) => r.tier === 'gold')?.awarded, 2)
})

// ─── Accessibility copy ──────────────────────────────────────────────────────

test('aria label describes value, state, trend, and privacy', () => {
  const r = calculateJourneyPulse([act('verified_completion', 1)], NOW)
  const label = pulseAriaLabel(r)
  assert.match(label, /Journey Pulse 20 out of 100/)
  assert.match(label, /Private to you/)
})
