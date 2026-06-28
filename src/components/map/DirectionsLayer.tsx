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

export type RouteStatus = 'idle' | 'loading' | 'ok' | 'denied' | 'error'

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
