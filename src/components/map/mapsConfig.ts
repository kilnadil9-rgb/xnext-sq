import type { LatLng } from './types'

export const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined

export const MAPS_MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ??
  'DEMO_MAP_ID'

/**
 * Regional fallback ONLY — used before GPS resolves or if it fails.
 * Tri-Cities, WA (launch market) so an un-located user still sees the right
 * region instead of a random world city. Never treat this as the real user
 * position: distances computed from here are approximate and must be labelled.
 */
export const FALLBACK_CENTER: LatLng = { lat: 46.2396, lng: -119.1006 }

/** Used by HomePage before location is granted — shows planet-scale context, not a random city */
export const WORLD_VIEW_CENTER: LatLng = { lat: 25, lng: 0 }
export const WORLD_VIEW_ZOOM = 2

// XNEXT Map Theme: Dark explorer aesthetic
// Reduces Google default colors, adds orange highlights, desaturated terrain for premium dark feel
export const XNEXT_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] }, // very dark blue-gray terrain
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#f97316" }] }, // orange country labels
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1e2937" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1e2937" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#0f172a" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1e2937" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#475569" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#f97316" }] }, // orange highway edges
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#475569" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c4a6e" }] }, // dark blue water
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  // Reduce saturation on most, keep some contrast
  { featureType: "all", stylers: [{ saturation: -80 }, { lightness: -10 }] },
];
