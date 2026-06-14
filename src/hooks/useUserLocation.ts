import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocationStatus, UserLocationState } from '../components/map/types'

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 30_000,
}

/**
 * Geolocation hook. Call `request()` from a user gesture (required by
 * iOS Safari for the permission prompt). Watches position afterwards.
 */
export function useUserLocation(watch = true) {
  const [state, setState] = useState<UserLocationState>({
    position: null,
    accuracy: null,
    status: 'idle',
    error: null,
  })
  const watchId = useRef<number | null>(null)

  const onPosition = useCallback((pos: GeolocationPosition) => {
    if (import.meta.env.DEV) {
      console.log('[useUserLocation] position acquired', { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
    }
    setState({
      position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      accuracy: pos.coords.accuracy,
      status: 'active',
      error: null,
    })
  }, [])

  const onFail = useCallback((err: GeolocationPositionError) => {
    if (import.meta.env.DEV) {
      console.warn('[useUserLocation] geolocation error', err)
    }
    const status: LocationStatus =
      err.code === err.PERMISSION_DENIED
        ? 'denied'
        : err.code === err.POSITION_UNAVAILABLE
          ? 'unavailable'
          : 'error'
    setState((s) => ({ ...s, status, error: err.message }))
  }, [])

  const request = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[useUserLocation] request() called — triggering geolocation (must be user gesture on iOS Safari)')
    }
    if (!('geolocation' in navigator)) {
      setState((s) => ({
        ...s,
        status: 'unavailable',
        error: 'Geolocation is not supported on this device',
      }))
      return
    }
    setState((s) => ({ ...s, status: 'locating', error: null }))
    navigator.geolocation.getCurrentPosition(onPosition, onFail, GEO_OPTIONS)
    if (watch && watchId.current === null) {
      watchId.current = navigator.geolocation.watchPosition(
        onPosition,
        onFail,
        GEO_OPTIONS,
      )
    }
  }, [watch, onPosition, onFail])

  useEffect(
    () => () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
    },
    [],
  )

  return { ...state, request }
}
