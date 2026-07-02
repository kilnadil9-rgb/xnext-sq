import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocationStatus, UserLocationState } from '../components/map/types'

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  // Force a fresh fix rather than a stale/coarse cached one — the cached
  // value was a common cause of "my location is off".
  maximumAge: 0,
}

/**
 * Browser permission state for geolocation, via the Permissions API.
 * - 'granted'  → safe to auto-request without a gesture
 * - 'prompt'   → the native prompt CAN show, but only from a user gesture on
 *                Android Chrome / Facebook in-app browser — never auto-fire
 * - 'denied'   → permission is BLOCKED at the browser level; calling
 *                getCurrentPosition errors immediately with NO prompt, so the
 *                UI must show "open browser settings" guidance instead
 * - 'unknown'  → Permissions API unavailable (older Safari) — legacy behavior
 */
export type GeoPermission = 'granted' | 'prompt' | 'denied' | 'unknown'

/**
 * Geolocation hook. Call `request()` from a user gesture — it invokes
 * `navigator.geolocation.getCurrentPosition()` SYNCHRONOUSLY (no awaits
 * before it) so Android Chrome / iOS Safari / the Facebook in-app browser
 * recognize the tap and show the native permission prompt.
 * Watches position afterwards.
 */
export function useUserLocation(watch = true) {
  const [state, setState] = useState<UserLocationState>({
    position: null,
    accuracy: null,
    status: 'idle',
    error: null,
  })
  // When the Permissions API exists, start from 'prompt' (never auto-fire a
  // non-gesture request while the async query below is still resolving); only
  // browsers WITHOUT the API get 'unknown' → legacy auto-request behavior.
  const [permission, setPermission] = useState<GeoPermission>(() =>
    typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions
      ? 'prompt'
      : 'unknown',
  )
  const watchId = useRef<number | null>(null)
  // True once we have at least one real fix — used to avoid downgrading the
  // UI back to "approximate location" on transient watch errors (timeouts,
  // brief POSITION_UNAVAILABLE) while the app is in use.
  const hasFix = useRef(false)

  // Track browser-level permission (where supported). Also listen for changes
  // so granting/blocking in browser settings updates the UI live.
  useEffect(() => {
    let disposed = false
    let permStatus: PermissionStatus | null = null
    if (!('permissions' in navigator) || !navigator.permissions?.query) return
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        if (disposed) return
        permStatus = p
        const apply = () => {
          if (disposed) return
          setPermission(p.state as GeoPermission)
          // Surface a hard block immediately so the UI can show settings
          // guidance instead of a dead "Enable" button.
          if (p.state === 'denied') {
            hasFix.current = false
            setState((s) => ({
              ...s,
              status: 'denied',
              error: 'Location is blocked in browser settings',
            }))
          }
        }
        apply()
        p.onchange = apply
      })
      .catch(() => {
        /* Permissions API not queryable — stay 'unknown' (legacy behavior) */
      })
    return () => {
      disposed = true
      if (permStatus) permStatus.onchange = null
    }
  }, [])

  const onPosition = useCallback((pos: GeolocationPosition) => {
    if (import.meta.env.DEV) {
      console.log('[useUserLocation] position acquired', { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
    }
    hasFix.current = true
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
    if (err.code === err.PERMISSION_DENIED) {
      // Real revocation (or "allow this time" expiring) — reflect it.
      hasFix.current = false
      setState((s) => ({ ...s, status: 'denied', error: err.message }))
      return
    }
    // Transient failure (timeout / brief GPS dropout). If we already have a
    // fix, KEEP it — don't flip the whole app back to "approximate location"
    // banners mid-session. The watch keeps running and recovers on its own.
    if (hasFix.current) {
      if (import.meta.env.DEV) {
        console.log('[useUserLocation] transient error ignored — keeping last good fix')
      }
      return
    }
    const status: LocationStatus =
      err.code === err.POSITION_UNAVAILABLE ? 'unavailable' : 'error'
    setState((s) => ({ ...s, status, error: err.message }))
  }, [])

  const request = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[useUserLocation] request() called — triggering geolocation (call from a user gesture so the native prompt can show)')
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
    // IMPORTANT: getCurrentPosition must run synchronously inside the tap
    // handler (no await/then before it) or Android Chrome and the Facebook
    // in-app browser will not show the native permission prompt.
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

  /** Permission is hard-blocked: tapping Enable cannot show a prompt. */
  const blocked = permission === 'denied'

  return { ...state, permission, blocked, request }
}
