/**
 * Adventure Navigation route engine — unit tests for the pure geometry core
 * (progress tracking, deviation distance, travel-mode hysteresis, parsing
 * helpers). Plain node:test, zero new deps — matches the RC5 harness.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  angleDeltaDegrees,
  bearingDegrees,
  computeProgress,
  extractStreetName,
  fastDistanceMeters,
  offsetPoint,
  parseRoute,
  stripHtml,
  travelModeForSpeed,
  zoomForMode,
} from '../src/components/navigation/routeEngine'

// ── Geometry primitives ───────────────────────────────────────────────────────

test('fastDistanceMeters ≈ 111 km per degree of latitude', () => {
  const d = fastDistanceMeters({ lat: 46, lng: -119 }, { lat: 47, lng: -119 })
  assert.ok(Math.abs(d - 111_195) < 500, `got ${d}`)
})

test('bearingDegrees: due north = 0, due east = 90', () => {
  const north = bearingDegrees({ lat: 46, lng: -119 }, { lat: 47, lng: -119 })
  const east = bearingDegrees({ lat: 46, lng: -119 }, { lat: 46, lng: -118 })
  assert.ok(Math.abs(north) < 1)
  assert.ok(Math.abs(east - 90) < 1)
})

test('offsetPoint moves the requested distance along the bearing', () => {
  const origin = { lat: 46.2, lng: -119.1 }
  const moved = offsetPoint(origin, 90, 500)
  assert.ok(Math.abs(fastDistanceMeters(origin, moved) - 500) < 5)
  assert.ok(moved.lng > origin.lng)
})

test('angleDeltaDegrees takes the shortest arc', () => {
  assert.equal(angleDeltaDegrees(350, 10), 20)
  assert.equal(angleDeltaDegrees(10, 350), -20)
  assert.equal(angleDeltaDegrees(0, 180), 180)
})

// ── Instruction parsing ───────────────────────────────────────────────────────

test('stripHtml removes markup from Google instructions', () => {
  assert.equal(stripHtml('Turn <b>left</b> onto <b>Road&nbsp;68</b>'), 'Turn left onto Road 68')
})

test('extractStreetName pulls the road from onto/on phrases', () => {
  assert.equal(extractStreetName('Turn left onto Road 68'), 'Road 68')
  assert.equal(extractStreetName('Continue on W Court St'), 'W Court St')
})

// ── Route parsing + progress ──────────────────────────────────────────────────

/** Fake Google latlng. */
const gp = (lat: number, lng: number) => ({ lat: () => lat, lng: () => lng })

/**
 * Synthetic 2-step route: 1 km due north, then 1 km due east.
 * (46.2000,-119.1000) → (46.2090,-119.1000) → (46.2090,-119.0870)
 */
function makeRoute() {
  const turn = { lat: 46.209, lng: -119.1 }
  return parseRoute({
    legs: [
      {
        duration: { value: 240 },
        steps: [
          {
            instructions: 'Head <b>north</b> on <b>Road 68</b>',
            maneuver: '',
            distance: { value: 1000 },
            start_location: gp(46.2, -119.1),
            end_location: gp(turn.lat, turn.lng),
            path: [gp(46.2, -119.1), gp(46.2045, -119.1), gp(turn.lat, turn.lng)],
          },
          {
            instructions: 'Turn <b>right</b> onto <b>Court St</b>',
            maneuver: 'turn-right',
            distance: { value: 1000 },
            start_location: gp(turn.lat, turn.lng),
            end_location: gp(46.209, -119.087),
            path: [gp(turn.lat, turn.lng), gp(46.209, -119.0935), gp(46.209, -119.087)],
          },
        ],
      },
    ],
  })
}

test('parseRoute flattens steps into one continuous path', () => {
  const route = makeRoute()
  assert.ok(route, 'route parsed')
  assert.equal(route.steps.length, 2)
  assert.equal(route.path.length, 5) // shared turn point deduplicated
  assert.ok(route.totalMeters > 1800 && route.totalMeters < 2200, `${route.totalMeters}`)
  assert.equal(route.steps[1].maneuver, 'turn-right')
  assert.equal(route.steps[1].streetName, 'Court St')
})

test('computeProgress tracks along-route position and next maneuver', () => {
  const route = makeRoute()!
  // Halfway up the first leg, 30 m east of the line (GPS drift).
  const user = { lat: 46.2045, lng: -119.0996 }
  const p = computeProgress(route, user)
  assert.equal(p.stepIndex, 0)
  assert.ok(p.offRouteMeters > 15 && p.offRouteMeters < 45, `${p.offRouteMeters}`)
  assert.ok(p.travelledMeters > 350 && p.travelledMeters < 650, `${p.travelledMeters}`)
  assert.ok(p.metersToNextManeuver > 350 && p.metersToNextManeuver < 650)
  assert.ok(p.remainingMeters > 1300 && p.remainingMeters < 1700)
  assert.ok(p.remainingSeconds > 100 && p.remainingSeconds < 240)
  // Route bearing on the northbound leg ≈ 0°.
  assert.ok(p.routeBearing < 15 || p.routeBearing > 345)
})

test('computeProgress flags major deviation (missed turn)', () => {
  const route = makeRoute()!
  // User sailed 400 m past the turn heading north.
  const p = computeProgress(route, { lat: 46.2126, lng: -119.1 })
  assert.ok(p.offRouteMeters > 250, `${p.offRouteMeters}`)
})

test('computeProgress recovers from a bad hint (full-scan fallback)', () => {
  const route = makeRoute()!
  // User on the SECOND leg but hint says the beginning.
  const p = computeProgress(route, { lat: 46.209, lng: -119.09 }, 0, 1)
  assert.equal(p.stepIndex, 1)
  assert.ok(p.offRouteMeters < 30)
})

// ── Travel-mode hysteresis + zoom bands ──────────────────────────────────────

test('travelModeForSpeed uses hysteresis (no flapping at boundaries)', () => {
  assert.equal(travelModeForSpeed(1, 'walking'), 'walking')
  assert.equal(travelModeForSpeed(3, 'walking'), 'walking') // sticky below 4
  assert.equal(travelModeForSpeed(5, 'walking'), 'city')
  assert.equal(travelModeForSpeed(3, 'city'), 'city') // sticky above 2
  assert.equal(travelModeForSpeed(25, 'city'), 'highway')
  assert.equal(travelModeForSpeed(19, 'highway'), 'highway') // sticky above 17
  assert.equal(travelModeForSpeed(10, 'highway'), 'city')
  assert.equal(travelModeForSpeed(null, 'highway'), 'highway') // no fix → keep
})

test('zoom bands match the Goal-2 spec', () => {
  assert.ok(zoomForMode('walking') >= 18 && zoomForMode('walking') <= 19)
  assert.ok(zoomForMode('city') >= 16 && zoomForMode('city') <= 17)
  assert.ok(zoomForMode('highway') >= 14 && zoomForMode('highway') <= 15)
})
