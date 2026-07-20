import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from '../map/types'
import type { NavPhase, NavProgress, NavRoute, TravelMode } from './navTypes'
import {
  computeProgress,
  parseRoute,
  travelModeForSpeed,
  fastDistanceMeters,
} from './routeEngine'
import {
  sayAdventureStart,
  sayArrival,
  sayDestination,
  sayLongStraight,
  sayRerouting,
  sayTurnNow,
  sayUpcomingTurn,
  spokenDistance,
  stopSpeaking,
} from './VoiceController'

/**
 * useNavigationSession — the NavigationState machine + guidance engine.
 *
 * Owns: route fetching + rerouting (Goal 3), live progress, travel-mode
 * detection (Goal 2 input), voice triggers (Goal 5) and arrival (Goal 6).
 * Camera and rendering live elsewhere (CameraController / RouteController) —
 * this hook is pure logic over GPS ticks.
 */

/** Reroute discipline (Goal 3): tolerance before we consider the user off. */
const OFF_ROUTE_BASE_TOLERANCE_M = 50
/** Consecutive off-route GPS ticks required before rerouting. */
const OFF_ROUTE_TICKS = 3
/** Minimum spacing between reroute requests. */
const REROUTE_COOLDOWN_MS = 12_000
/** Arrival radius (matches the existing preview behavior). */
const ARRIVAL_RADIUS_M = 40

/** Approach-warning distance per travel mode (meters before the turn). */
const APPROACH_M: Record<TravelMode, number> = { walking: 60, city: 250, highway: 550 }
/** "Turn now" distance. */
const TURN_NOW_M = 35
/** A step this long earns one "Enjoy the drive" (Goal 5). */
const LONG_STRAIGHT_M = 3_000

export interface NavigationSessionInput {
  /** google.maps routes library (null until loaded). */
  routesLib: { DirectionsService: new () => google.maps.DirectionsService } | null
  destination: LatLng
  destinationTitle: string | null
  userPosition: LatLng | null
  /** GPS heading (deg) & speed (m/s); null when the fix has none. */
  userSpeed: number | null
  accuracy: number | null
  /** Called when the session cannot start (route denied/error). */
  onRouteError: (kind: 'denied' | 'error') => void
}

export interface NavigationSession {
  phase: NavPhase
  route: NavRoute | null
  progress: NavProgress | null
  travelMode: TravelMode
  /** True while a reroute request is in flight ("Recalculating route…"). */
  rerouting: boolean
  /** Bumped on every route change — lets renderers re-draw the polyline. */
  routeVersion: number
  /** Preview finished or skipped → begin turn-by-turn. */
  beginNavigating: () => void
  /** Arrived → celebration acknowledged → session over. */
  endSession: () => void
  /** Manual "back on track" escape hatch: force an immediate reroute. */
  rerouteNow: () => void
}

export function useNavigationSession(input: NavigationSessionInput): NavigationSession {
  const {
    routesLib,
    destination,
    destinationTitle,
    userPosition,
    userSpeed,
    accuracy,
    onRouteError,
  } = input

  const [phase, setPhase] = useState<NavPhase>('preview')
  const [route, setRoute] = useState<NavRoute | null>(null)
  const [progress, setProgress] = useState<NavProgress | null>(null)
  const [travelMode, setTravelMode] = useState<TravelMode>('city')
  const [rerouting, setRerouting] = useState(false)
  const [routeVersion, setRouteVersion] = useState(0)

  // Guidance memory (refs — GPS ticks must not cause extra renders).
  const segmentHintRef = useRef(0)
  const approachSpokenRef = useRef(-1)
  const turnSpokenRef = useRef(-1)
  const longStraightSpokenRef = useRef(-1)
  const offRouteTicksRef = useRef(0)
  const lastRerouteAtRef = useRef(0)
  const arrivedRef = useRef(false)
  const destinationAnnouncedRef = useRef(false)
  const phaseRef = useRef<NavPhase>('preview')
  const travelModeRef = useRef<TravelMode>('city')
  const onRouteErrorRef = useRef(onRouteError)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    onRouteErrorRef.current = onRouteError
  }, [onRouteError])

  const fetchRoute = useCallback(
    (origin: LatLng): Promise<NavRoute | null> => {
      if (!routesLib) return Promise.resolve(null)
      const service = new routesLib.DirectionsService()
      return new Promise((resolve) => {
        service.route(
          {
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === 'OK' && result?.routes?.[0]) {
              resolve(parseRoute(result.routes[0]))
            } else if (status === 'REQUEST_DENIED') {
              onRouteErrorRef.current('denied')
              resolve(null)
            } else {
              onRouteErrorRef.current('error')
              resolve(null)
            }
          },
        )
      })
    },
    [routesLib, destination],
  )

  // ── Initial route: fetched once when the session mounts with a fix. ────────
  const initialFetchedRef = useRef(false)
  useEffect(() => {
    if (initialFetchedRef.current || !routesLib || !userPosition) return
    initialFetchedRef.current = true
    let cancelled = false
    fetchRoute(userPosition).then((r) => {
      if (cancelled) return
      if (r) {
        setRoute(r)
        setRouteVersion((v) => v + 1)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesLib, userPosition === null])

  const applyNewRoute = useCallback((r: NavRoute) => {
    segmentHintRef.current = 0
    approachSpokenRef.current = -1
    turnSpokenRef.current = -1
    longStraightSpokenRef.current = -1
    offRouteTicksRef.current = 0
    setRoute(r)
    setRouteVersion((v) => v + 1)
  }, [])

  const reroute = useCallback(
    async (announce = true) => {
      if (!userPosition) return
      lastRerouteAtRef.current = Date.now()
      setRerouting(true)
      if (announce) sayRerouting()
      const r = await fetchRoute(userPosition)
      setRerouting(false)
      if (r) applyNewRoute(r)
    },
    [userPosition, fetchRoute, applyNewRoute],
  )

  const rerouteNow = useCallback(() => {
    if (phaseRef.current === 'navigating' && !rerouting) void reroute(false)
  }, [reroute, rerouting])

  // ── Per-GPS-tick guidance loop (~1 Hz — cheap, windowed path search). ──────
  useEffect(() => {
    if (!route || !userPosition || phaseRef.current === 'arrived' || phaseRef.current === 'idle') {
      return
    }

    // Travel mode with hysteresis (drives dynamic zoom + approach distances).
    const mode = travelModeForSpeed(userSpeed, travelModeRef.current)
    if (mode !== travelModeRef.current) {
      travelModeRef.current = mode
      setTravelMode(mode)
    }

    const p = computeProgress(route, userPosition, segmentHintRef.current)
    segmentHintRef.current = p.segmentIndex
    setProgress(p)

    // Everything below is turn-by-turn behavior — preview just tracks progress.
    if (phaseRef.current !== 'navigating') return

    // ── Arrival (Goal 6) ─────────────────────────────────────────────────────
    const distToDest = fastDistanceMeters(userPosition, route.destination)
    if (!arrivedRef.current && (distToDest <= ARRIVAL_RADIUS_M || p.remainingMeters <= ARRIVAL_RADIUS_M)) {
      arrivedRef.current = true
      stopSpeaking()
      sayArrival(destinationTitle)
      setPhase('arrived')
      return
    }

    // ── Deviation detection + rerouting (Goal 3) ─────────────────────────────
    // Tolerance scales with GPS accuracy so drift/parking lots don't spam
    // reroutes; U-turns and real detours trip it within ~3 ticks.
    const tolerance = Math.max(OFF_ROUTE_BASE_TOLERANCE_M, (accuracy ?? 0) * 1.5)
    if (p.offRouteMeters > tolerance) {
      offRouteTicksRef.current += 1
      const cooledDown = Date.now() - lastRerouteAtRef.current > REROUTE_COOLDOWN_MS
      if (offRouteTicksRef.current >= OFF_ROUTE_TICKS && cooledDown && !rerouting) {
        offRouteTicksRef.current = 0
        void reroute()
      }
      return // off route → skip turn guidance until we're back on a route
    }
    offRouteTicksRef.current = 0

    // ── Voice guidance (Goal 5) ──────────────────────────────────────────────
    const step = route.steps[p.stepIndex]
    const isFinalStep = p.stepIndex >= route.steps.length - 1
    // The NEXT maneuver is described by the step AFTER the one being travelled.
    const nextStep = route.steps[p.stepIndex + 1]

    if (nextStep && p.metersToNextManeuver <= APPROACH_M[mode] && approachSpokenRef.current < p.stepIndex) {
      approachSpokenRef.current = p.stepIndex
      sayUpcomingTurn(nextStep.maneuver, nextStep.streetName, p.metersToNextManeuver)
    }
    if (nextStep && p.metersToNextManeuver <= TURN_NOW_M && turnSpokenRef.current < p.stepIndex) {
      turnSpokenRef.current = p.stepIndex
      sayTurnNow(nextStep.maneuver, nextStep.streetName)
    }
    if (
      !isFinalStep &&
      step.distanceMeters >= LONG_STRAIGHT_M &&
      longStraightSpokenRef.current < p.stepIndex &&
      p.metersToNextManeuver > APPROACH_M[mode] * 1.5
    ) {
      longStraightSpokenRef.current = p.stepIndex
      sayLongStraight(spokenDistance(p.metersToNextManeuver))
    }
     
  }, [userPosition, route, userSpeed, accuracy, destinationTitle, rerouting, reroute])

  const beginNavigating = useCallback(() => {
    if (phaseRef.current !== 'preview') return
    setPhase('navigating')
    sayAdventureStart()
    if (!destinationAnnouncedRef.current) {
      destinationAnnouncedRef.current = true
      // Spoken a beat after the start line (casual channel respects cooldown,
      // so this stays quiet when the start phrase just played).
      window.setTimeout(() => sayDestination(destinationTitle), 14_000)
    }
  }, [destinationTitle])

  const endSession = useCallback(() => {
    stopSpeaking()
    setPhase('idle')
  }, [])

  return {
    phase,
    route,
    progress,
    travelMode,
    rerouting,
    routeVersion,
    beginNavigating,
    endSession,
    rerouteNow,
  }
}
