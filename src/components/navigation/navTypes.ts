import type { LatLng } from '../map/types'

/**
 * Adventure Navigation Mode (Nav 2.0) — shared types.
 *
 * The navigation session is a small state machine:
 *
 *   idle → preview → navigating → arrived
 *                ↘ (skip)  ↗          ↓
 *                              (Complete Journey) → idle
 *
 * `preview`    — cinematic 3–5 s route fly-over (skippable).
 * `navigating` — chase camera + turn-by-turn + voice + reroute.
 * `arrived`    — celebration panel (after the user stops moving).
 */
export type NavPhase = 'idle' | 'preview' | 'navigating' | 'arrived'

/** One navigable step, parsed from the Google DirectionsResult. */
export interface NavStep {
  /** Plain-text instruction (HTML stripped), e.g. "Turn left onto Road 68". */
  instruction: string
  /** Street/road extracted from the instruction, e.g. "Road 68". */
  streetName: string
  /** Google maneuver id, e.g. "turn-left" (empty for straight segments). */
  maneuver: string
  start: LatLng
  end: LatLng
  /** Step length in meters. */
  distanceMeters: number
  /** Cumulative route distance (meters) at the END of this step. */
  cumulativeEndMeters: number
  /** Index of the step's first point in the flattened route path. */
  pathStartIndex: number
}

/** Fully parsed route, ready for the progress engine. */
export interface NavRoute {
  /** Flattened, high-resolution path (all step polyline points). */
  path: LatLng[]
  /** Cumulative distance (meters) from the origin to path[i]. */
  cumulative: number[]
  steps: NavStep[]
  totalMeters: number
  totalSeconds: number
  destination: LatLng
}

/** Live progress of the user along a NavRoute. */
export interface NavProgress {
  /** Nearest point ON the route to the user (snapped position). */
  snapped: LatLng
  /** Index into route.path of the segment the user is on. */
  segmentIndex: number
  /** Meters travelled from the origin (along the route). */
  travelledMeters: number
  /** Meters remaining to the destination (along the route). */
  remainingMeters: number
  /** Estimated seconds remaining (route pace × remaining distance). */
  remainingSeconds: number
  /** Perpendicular distance (meters) from the user to the route. */
  offRouteMeters: number
  /** Index of the CURRENT step (the one being travelled). */
  stepIndex: number
  /** Meters until the next maneuver point. */
  metersToNextManeuver: number
  /** Bearing (deg) of the route at the user's position — camera fallback. */
  routeBearing: number
}

/** Rough travel context derived from GPS speed — drives dynamic zoom. */
export type TravelMode = 'walking' | 'city' | 'highway'

export interface CameraTarget {
  center: LatLng
  zoom: number
  heading: number
  tilt: number
}

/** A nearby discovery surfaced while navigating (Explore Along Route). */
export interface RouteDiscovery {
  id: string
  title: string
  experienceClass: string
  distanceFromRouteMeters: number
  lat: number
  lng: number
  verified: boolean
  featured: boolean
  score: number | null
}
