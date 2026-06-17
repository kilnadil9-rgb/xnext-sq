import { useEffect, useState } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { LatLng, RouteSummary } from './types'

interface Props {
  origin: LatLng | null
  destination: LatLng | null
  travelMode?: google.maps.TravelMode
  onRoute?: (summary: RouteSummary) => void
  onError?: (message: string) => void
}

/** Draws an in-app route when both origin and destination are set. */
export function DirectionsLayer({
  origin,
  destination,
  travelMode = 'DRIVING' as google.maps.TravelMode,
  onRoute,
  onError,
}: Props) {
  const map = useMap()
  const routes = useMapsLibrary('routes')
  const [renderer, setRenderer] =
    useState<google.maps.DirectionsRenderer | null>(null)

  useEffect(() => {
    if (!routes || !map) return
    const r = new routes.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: false,
    })
    setRenderer(r)
    return () => {
      r.setMap(null)
      setRenderer(null)
    }
  }, [routes, map])

  useEffect(() => {
    if (!routes || !renderer) return
    if (!origin || !destination) {
      renderer.set('directions', null)
      return
    }

    let cancelled = false
    new routes.DirectionsService()
      .route({ origin, destination, travelMode })
      .then((res) => {
        if (cancelled) return
        renderer.setDirections(res)
        const leg = res.routes[0]?.legs[0]
        if (leg?.distance && leg.duration) {
          onRoute?.({
            distanceText: leg.distance.text,
            durationText: leg.duration.text,
          })
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        onError?.(e instanceof Error ? e.message : 'Directions request failed')
      })

    return () => {
      cancelled = true
    }
  }, [routes, renderer, origin, destination, travelMode, onRoute, onError])

  return null
}

/** External fallback (secondary): opens the native Google Maps app / web. */
export function googleMapsDirectionsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`
}
