export interface LatLng {
  lat: number
  lng: number
}

export type LocationStatus =
  | 'idle'
  | 'locating'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'error'

export interface UserLocationState {
  position: LatLng | null
  accuracy: number | null
  /** GPS course over ground in degrees (null when stationary/unsupported). */
  heading: number | null
  /** GPS ground speed in m/s (null when stationary/unsupported). */
  speed: number | null
  status: LocationStatus
  error: string | null
}

export interface RouteSummary {
  distanceText: string
  durationText: string
}
