import { useEffect, useRef } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { LatLng } from './types'

/**
 * Phase 2 — in-app single-destination route preview.
 *
 * XNEXT stays "one world / one screen": tapping LET'S GO draws the route line
 * on the Home map and shows distance + ETA, instead of ejecting to Google Maps.
 * Google Maps is now only a SECONDARY "full navigation" fallback
 * (googleMapsDirectionsUrl below).
 *
 * This is preview only — a polyline + ETA + fit-to-bounds. No turn-by-turn.
 * Rendering directions requires the Google **Directions API** to be enabled and
 * billed on the maps key's project; if it isn't, the service returns
 * REQUEST_DENIED and we surface a clear message (status='denied') without
 * breaking the app.
 */

/** Deep link to Google Maps turn-by-turn (secondary "full navigation" action). */
export function googleMapsDirectionsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`
}

/**
 * Multi-stop Google Maps deep link (Yard Sale Route fallback): all stops in
 * order, last stop as the destination.
 */
export function googleMapsMultiStopUrl(origin: LatLng, stops: LatLng[]): string {
  if (stops.length === 0) return googleMapsDirectionsUrl(origin)
  const dest = stops[stops.length - 1]
  const waypoints = stops
    .slice(0, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|')
  const wp = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}${wp}&travelmode=driving`
}

export type RouteStatus = 'idle' | 'loading' | 'ok' | 'denied' | 'error'

/** One turn point of a route, for voice guidance (RC4). */
export interface RouteStep {
  lat: number
  lng: number
  maneuver?: string
}

export interface RouteResult {
  /** e.g. "12 min" */
  durationText: string
  /** e.g. "5.4 km" */
  distanceText: string
  durationSeconds: number
  distanceMeters: number
}

interface RouteLayerProps {
  /** Origin = the user's current location. */
  origin: LatLng
  /** Destination = parking coordinate when present, else the quest/POI point. */
  destination: LatLng
  onStatus?: (status: RouteStatus) => void
  onResult?: (result: RouteResult | null) => void
  /** Parsed turn points (start of each step + maneuver) for voice guidance. */
  onSteps?: (steps: RouteStep[]) => void
}

/**
 * Renders a driving route polyline from origin to destination on the parent
 * <Map>. Mount it only while a preview is active; unmounting clears the line.
 */
export function RouteLayer({
  origin,
  destination,
  onStatus,
  onResult,
  onSteps,
}: RouteLayerProps) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  // Latest origin + callbacks via refs so frequent GPS ticks don't re-run the
  // route effect (one request per destination, using the freshest origin).
  const originRef = useRef(origin)
  originRef.current = origin
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const onStepsRef = useRef(onSteps)
  onStepsRef.current = onSteps

  useEffect(() => {
    if (!map || !routesLib) return
    let cancelled = false

    const service = new routesLib.DirectionsService()
    const renderer = new routesLib.DirectionsRenderer({
      map,
      // The user dot + quest pin already mark the endpoints; keep it clean.
      suppressMarkers: true,
      preserveViewport: false, // auto-fit the map to the route bounds
      polylineOptions: {
        strokeColor: '#f97316',
        strokeOpacity: 0.9,
        strokeWeight: 5,
      },
    })
    rendererRef.current = renderer

    onStatusRef.current?.('loading')
    onResultRef.current?.(null)

    service.route(
      {
        origin: originRef.current,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return
        if (status === 'OK' && result) {
          renderer.setDirections(result)
          const leg = result.routes[0]?.legs[0]
          if (leg?.distance && leg?.duration) {
            onResultRef.current?.({
              durationText: leg.duration.text,
              distanceText: leg.distance.text,
              durationSeconds: leg.duration.value,
              distanceMeters: leg.distance.value,
            })
          } else {
            onResultRef.current?.(null)
          }
          // Voice guidance (RC4): expose each step's start point + maneuver.
          onStepsRef.current?.(
            (leg?.steps ?? []).map((st) => ({
              lat: st.start_location.lat(),
              lng: st.start_location.lng(),
              maneuver: (st as { maneuver?: string }).maneuver,
            })),
          )
          onStatusRef.current?.('ok')
        } else if (status === 'REQUEST_DENIED') {
          // Directions API not enabled/billed on the key's project.
          onStatusRef.current?.('denied')
          onResultRef.current?.(null)
        } else {
          // ZERO_RESULTS, OVER_QUERY_LIMIT, NOT_FOUND, network, etc.
          onStatusRef.current?.('error')
          onResultRef.current?.(null)
        }
      },
    )

    return () => {
      cancelled = true
      if (rendererRef.current) {
        rendererRef.current.setMap(null) // remove the line from the map
        rendererRef.current = null
      }
    }
    // Re-run only when the destination (or map/library) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routesLib, destination.lat, destination.lng])

  return null
}

// ── Yard Sale Route (multi-stop) ──────────────────────────────────────────────

interface MultiStopRouteLayerProps {
  /** Origin = the user's current location. */
  origin: LatLng
  /** Ordered stops (pre-ordered nearest-neighbor; Google refines the middle). */
  stops: LatLng[]
  onStatus?: (status: RouteStatus) => void
  /** Totals summed across all legs. */
  onResult?: (result: RouteResult | null) => void
  /**
   * Google's optimized visiting order for stops[0..n-2] (indices into `stops`
   * minus the final destination). Lets the caller reorder its stop LIST
   * without changing the props (which would re-request the route).
   */
  onOptimizedOrder?: (order: number[]) => void
}

/**
 * Multi-stop driving route for Yard Sale Route Mode: origin → every stop,
 * with Google optimizing the middle waypoints (last stop stays the finale).
 * Same rendering + failure semantics as RouteLayer; unmount clears the line.
 */
export function MultiStopRouteLayer({
  origin,
  stops,
  onStatus,
  onResult,
  onOptimizedOrder,
}: MultiStopRouteLayerProps) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  const originRef = useRef(origin)
  originRef.current = origin
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const onOrderRef = useRef(onOptimizedOrder)
  onOrderRef.current = onOptimizedOrder

  // One request per stop-set: key on the coordinates so GPS ticks (origin
  // updates) and unrelated re-renders don't refetch.
  const stopsKey = stops.map((s) => `${s.lat},${s.lng}`).join(';')

  useEffect(() => {
    if (!map || !routesLib || stops.length === 0) return
    let cancelled = false

    const service = new routesLib.DirectionsService()
    const renderer = new routesLib.DirectionsRenderer({
      map,
      suppressMarkers: true, // quest pins already mark the stops
      preserveViewport: false,
      polylineOptions: {
        strokeColor: '#f97316',
        strokeOpacity: 0.9,
        strokeWeight: 5,
      },
    })
    rendererRef.current = renderer

    onStatusRef.current?.('loading')
    onResultRef.current?.(null)

    const destination = stops[stops.length - 1]
    const waypoints = stops.slice(0, -1).map((s) => ({
      location: new google.maps.LatLng(s.lat, s.lng),
      stopover: true,
    }))

    service.route(
      {
        origin: originRef.current,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return
        if (status === 'OK' && result) {
          renderer.setDirections(result)
          const route = result.routes[0]
          const legs = route?.legs ?? []
          const distanceMeters = legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0)
          const durationSeconds = legs.reduce((sum, l) => sum + (l.duration?.value ?? 0), 0)
          const minutes = Math.round(durationSeconds / 60)
          onResultRef.current?.({
            durationText:
              minutes >= 60
                ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
                : `${minutes} min`,
            distanceText: `${(distanceMeters / 1609.34).toFixed(1)} mi`,
            durationSeconds,
            distanceMeters,
          })
          if (route?.waypoint_order) onOrderRef.current?.(route.waypoint_order)
          onStatusRef.current?.('ok')
        } else if (status === 'REQUEST_DENIED') {
          onStatusRef.current?.('denied')
          onResultRef.current?.(null)
        } else {
          onStatusRef.current?.('error')
          onResultRef.current?.(null)
        }
      },
    )

    return () => {
      cancelled = true
      if (rendererRef.current) {
        rendererRef.current.setMap(null)
        rendererRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routesLib, stopsKey])

  return null
}
