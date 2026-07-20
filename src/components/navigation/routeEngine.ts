import type { LatLng } from '../map/types'
import type { NavProgress, NavRoute, NavStep, TravelMode } from './navTypes'

/**
 * Route progress engine — pure geometry, no Google/DOM dependencies, so the
 * whole navigation core is unit-testable and framework-free.
 *
 * All math uses a local equirectangular approximation (meters), which is
 * accurate to well under 0.1% at route scale — plenty for navigation UX.
 */

const EARTH_RADIUS_M = 6_371_000
const DEG = Math.PI / 180

/** Meters per degree of longitude at latitude `lat`. */
function metersPerDegLng(lat: number): number {
  return Math.cos(lat * DEG) * EARTH_RADIUS_M * DEG
}
const METERS_PER_DEG_LAT = EARTH_RADIUS_M * DEG

/** Fast approximate distance in meters (equirectangular). */
export function fastDistanceMeters(a: LatLng, b: LatLng): number {
  const dx = (b.lng - a.lng) * metersPerDegLng((a.lat + b.lat) / 2)
  const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

/** Initial bearing (degrees, 0–360) from `a` to `b`. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const dx = (b.lng - a.lng) * metersPerDegLng((a.lat + b.lat) / 2)
  const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Point `meters` ahead of `origin` along `bearing` (degrees). */
export function offsetPoint(origin: LatLng, bearing: number, meters: number): LatLng {
  const rad = bearing * DEG
  const dLat = (Math.cos(rad) * meters) / METERS_PER_DEG_LAT
  const dLng = (Math.sin(rad) * meters) / metersPerDegLng(origin.lat)
  return { lat: origin.lat + dLat, lng: origin.lng + dLng }
}

/** Shortest signed angular difference `to - from` in (-180, 180]. */
export function angleDeltaDegrees(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/** Strip HTML tags Google embeds in step instructions. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pull a street name out of an instruction like
 * "Turn left onto Road 68" / "Continue on W Court St toward …".
 * Falls back to the whole instruction when no onto/on pattern matches.
 */
export function extractStreetName(instruction: string): string {
  const m = instruction.match(/\b(?:onto|on|toward|towards)\s+(.+?)(?:\s+toward.*|\s+for\s+.*|$)/i)
  return (m?.[1] ?? instruction).trim()
}

interface GoogleStepLike {
  instructions?: string
  maneuver?: string
  distance?: { value: number }
  start_location: { lat(): number; lng(): number }
  end_location: { lat(): number; lng(): number }
  path?: Array<{ lat(): number; lng(): number }>
}

interface GoogleRouteLike {
  legs?: Array<{
    steps?: GoogleStepLike[]
    distance?: { value: number }
    duration?: { value: number }
  }>
}

/**
 * Flatten a Google DirectionsResult route into a NavRoute the progress engine
 * understands: one high-resolution path + cumulative distances + step spans.
 */
export function parseRoute(route: GoogleRouteLike): NavRoute | null {
  const legs = route.legs ?? []
  if (legs.length === 0) return null

  const path: LatLng[] = []
  const steps: NavStep[] = []
  let totalMeters = 0
  let totalSeconds = 0

  for (const leg of legs) {
    totalSeconds += leg.duration?.value ?? 0
    for (const st of leg.steps ?? []) {
      const stepPath: LatLng[] = (st.path ?? []).map((p) => ({ lat: p.lat(), lng: p.lng() }))
      if (stepPath.length === 0) {
        stepPath.push(
          { lat: st.start_location.lat(), lng: st.start_location.lng() },
          { lat: st.end_location.lat(), lng: st.end_location.lng() },
        )
      }
      const pathStartIndex = path.length === 0 ? 0 : path.length - 1
      // Append, skipping the shared point between consecutive steps.
      for (const pt of stepPath) {
        const last = path[path.length - 1]
        if (last && Math.abs(last.lat - pt.lat) < 1e-9 && Math.abs(last.lng - pt.lng) < 1e-9) {
          continue
        }
        path.push(pt)
      }

      const distanceMeters = st.distance?.value ?? 0
      totalMeters += distanceMeters
      const instruction = stripHtml(st.instructions ?? '')
      steps.push({
        instruction,
        streetName: extractStreetName(instruction),
        maneuver: st.maneuver ?? '',
        start: { lat: st.start_location.lat(), lng: st.start_location.lng() },
        end: { lat: st.end_location.lat(), lng: st.end_location.lng() },
        distanceMeters,
        cumulativeEndMeters: totalMeters,
        pathStartIndex,
      })
    }
  }
  if (path.length < 2 || steps.length === 0) return null

  const cumulative: number[] = new Array(path.length)
  cumulative[0] = 0
  for (let i = 1; i < path.length; i++) {
    cumulative[i] = cumulative[i - 1] + fastDistanceMeters(path[i - 1], path[i])
  }
  // Normalize step cumulative ends onto the real path length (they can differ
  // slightly from Google's rounded step distances).
  const scale = totalMeters > 0 ? cumulative[path.length - 1] / totalMeters : 1
  for (const s of steps) s.cumulativeEndMeters *= scale

  return {
    path,
    cumulative,
    steps,
    totalMeters: cumulative[path.length - 1],
    totalSeconds,
    destination: path[path.length - 1],
  }
}

/** Closest point to `p` on segment a→b, plus the fraction along the segment. */
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number } {
  const mLng = metersPerDegLng(p.lat)
  const ax = (a.lng - p.lng) * mLng
  const ay = (a.lat - p.lat) * METERS_PER_DEG_LAT
  const bx = (b.lng - p.lng) * mLng
  const by = (b.lat - p.lat) * METERS_PER_DEG_LAT
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lenSq))
  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    t,
  }
}

/**
 * Compute live progress. `hintIndex` (the previous segmentIndex) keeps the
 * search local — O(window) per GPS tick instead of O(path) — while a full
 * scan fallback handles big jumps (tunnel exits, GPS recovery).
 */
export function computeProgress(
  route: NavRoute,
  user: LatLng,
  hintIndex = 0,
  windowSize = 40,
): NavProgress {
  const { path, cumulative, steps } = route

  const scan = (from: number, to: number) => {
    let best = Infinity
    let bestIdx = from
    let bestPoint = path[from]
    let bestT = 0
    for (let i = from; i < to; i++) {
      const { point, t } = projectOnSegment(user, path[i], path[i + 1])
      const d = fastDistanceMeters(user, point)
      if (d < best) {
        best = d
        bestIdx = i
        bestPoint = point
        bestT = t
      }
    }
    return { best, bestIdx, bestPoint, bestT }
  }

  const lo = Math.max(0, hintIndex - 5)
  const hi = Math.min(path.length - 1, hintIndex + windowSize)
  let r = scan(lo, hi)
  // Local window missed (>150 m away) → full scan recovers gross jumps.
  if (r.best > 150) r = scan(0, path.length - 1)

  const segLen = fastDistanceMeters(path[r.bestIdx], path[r.bestIdx + 1])
  const travelledMeters = cumulative[r.bestIdx] + segLen * r.bestT
  const remainingMeters = Math.max(0, route.totalMeters - travelledMeters)
  const pace = route.totalMeters > 0 ? route.totalSeconds / route.totalMeters : 0

  // Current step = first step whose cumulative end lies ahead of the user.
  let stepIndex = steps.length - 1
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].cumulativeEndMeters > travelledMeters + 1) {
      stepIndex = i
      break
    }
  }

  const lookahead = Math.min(r.bestIdx + 1, path.length - 1)
  return {
    snapped: r.bestPoint,
    segmentIndex: r.bestIdx,
    travelledMeters,
    remainingMeters,
    remainingSeconds: remainingMeters * pace,
    offRouteMeters: r.best,
    stepIndex,
    metersToNextManeuver: Math.max(0, steps[stepIndex].cumulativeEndMeters - travelledMeters),
    routeBearing: bearingDegrees(path[r.bestIdx], path[lookahead]),
  }
}

/** GPS speed (m/s) → travel context for dynamic zoom. Hysteresis-friendly. */
export function travelModeForSpeed(speedMps: number | null, previous: TravelMode): TravelMode {
  if (speedMps === null || Number.isNaN(speedMps)) return previous
  // Bands overlap so noise at a boundary doesn't flip modes every tick.
  switch (previous) {
    case 'walking':
      if (speedMps > 4) return speedMps > 21 ? 'highway' : 'city'
      return 'walking'
    case 'city':
      if (speedMps < 2) return 'walking'
      if (speedMps > 23) return 'highway'
      return 'city'
    case 'highway':
      if (speedMps < 17) return speedMps < 2 ? 'walking' : 'city'
      return 'highway'
  }
}

/** Base zoom per travel mode (Goal 2). */
export function zoomForMode(mode: TravelMode): number {
  switch (mode) {
    case 'walking':
      return 18.5
    case 'city':
      return 16.5
    case 'highway':
      return 14.5
  }
}
