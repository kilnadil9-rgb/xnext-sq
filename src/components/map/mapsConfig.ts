import type { LatLng } from './types'

export const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined

export const MAPS_MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ??
  'DEMO_MAP_ID'

export const FALLBACK_CENTER: LatLng = { lat: 40.4168, lng: -3.7038 }
