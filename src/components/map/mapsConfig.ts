import type { LatLng } from './types'

export const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined

export const MAPS_MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ??
  'DEMO_MAP_ID'

export const FALLBACK_CENTER: LatLng = { lat: 40.4168, lng: -3.7038 }

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
