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
  status: LocationStatus
  error: string | null
}

export interface RouteSummary {
  distanceText: string
  durationText: string
}
