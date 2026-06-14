import { useCallback } from 'react'
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map,
  useApiLoadingStatus,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { useUserLocation } from '../../hooks/useUserLocation'
import { MAPS_API_KEY, MAPS_MAP_ID, FALLBACK_CENTER } from './mapsConfig'
import { PlaceSearch } from './PlaceSearch'
import type { LatLng } from './types'
import './maps.css'

interface Props {
  value: LatLng | null
  onChange: (location: LatLng, placeName?: string) => void
}

/**
 * Compact map for picking a quest location: tap to drop the pin,
 * search a place, or jump to the user's position.
 */
export function LocationPickerMap({ value, onChange }: Props) {
  if (!MAPS_API_KEY) {
    return (
      <div className="map-fallback location-picker" role="alert">
        <p className="map-fallback__detail">
          Map unavailable — set VITE_GOOGLE_MAPS_API_KEY to pick a location
          visually.
        </p>
      </div>
    )
  }

  return (
    <APIProvider apiKey={MAPS_API_KEY} libraries={['marker']}>
      <PickerInner value={value} onChange={onChange} />
    </APIProvider>
  )
}

function PickerInner({ value, onChange }: Props) {
  const apiStatus = useApiLoadingStatus()
  const { status: locationStatus, request } = useUserLocation(false)

  const handleClick = useCallback(
    (ev: MapMouseEvent) => {
      if (ev.detail.latLng) onChange(ev.detail.latLng)
    },
    [onChange],
  )

  const handleLocate = useCallback(() => {
    if (!('geolocation' in navigator)) return
    request()
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* surfaced via locationStatus */
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }, [onChange, request])

  if (apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="map-fallback location-picker" role="alert">
        <p className="map-fallback__detail">Google Maps failed to load.</p>
      </div>
    )
  }

  return (
    <div className="location-picker">
      <Map
        mapId={MAPS_MAP_ID}
        defaultCenter={value ?? FALLBACK_CENTER}
        defaultZoom={value ? 15 : 12}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        reuseMaps
        onClick={handleClick}
        className="location-picker__canvas"
      >
        {value && (
          <AdvancedMarker position={value} title="Quest location">
            <div className="quest-pin" />
          </AdvancedMarker>
        )}
      </Map>

      <div className="map-screen__top">
        <PlaceSearch
          onPlaceSelected={(loc, name) => onChange(loc, name)}
        />
      </div>

      {/* Permission transparency note for the locate button in picker */}
      <div className="absolute right-3 top-[72px] z-[60] max-w-[200px] rounded-md border border-border/70 bg-card/95 px-2 py-1 text-[10px] leading-snug shadow text-muted-foreground">
        Location helps set quest coordinates. Never sold.
      </div>

      <button
        type="button"
        className="locate-button"
        aria-label="Use my location"
        disabled={locationStatus === 'locating'}
        onClick={handleLocate}
      >
        {locationStatus === 'locating' ? '…' : '◎'}
      </button>

      {locationStatus === 'denied' && (
        <div className="map-toast map-toast--error">
          Location permission denied.
        </div>
      )}
    </div>
  )
}
