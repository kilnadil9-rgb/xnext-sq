import type { LatLng } from './types'

/**
 * XNEXT is not a navigation app. We deliberately do NOT render in-app Google
 * Directions (that required the Directions API to be enabled/billed and was the
 * source of the DIRECTIONS_ROUTE: REQUEST_DENIED error). Turn-by-turn is owned
 * by Google Maps via this deep link; XNEXT owns discovery + completion.
 */
export function googleMapsDirectionsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`
}
