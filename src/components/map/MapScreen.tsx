import { useCallback, useState } from 'react'
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map,
  useApiLoadingStatus,
  type MapCameraChangedEvent,
} from '@vis.gl/react-google-maps'
import { useUserLocation } from '../../hooks/useUserLocation'
import { useNearbyQuests } from '../../hooks/useNearbyQuests'
import { formatDistance } from '../../lib/distance'
import type { NearbyQuest } from '../../lib/supabase/types'
import type { LatLng, RouteSummary } from './types'
import { MapErrorBoundary } from './MapErrorBoundary'
import { QuestClusterer } from './QuestClusterer'
import { PlaceSearch } from './PlaceSearch'
import { DirectionsLayer, googleMapsDirectionsUrl } from './DirectionsLayer'
import './maps.css'

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined
const MAPS_MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ??
  'DEMO_MAP_ID'

const FALLBACK_CENTER: LatLng = { lat: 40.4168, lng: -3.7038 }
const RADIUS_OPTIONS_KM = [1, 2.5, 5, 10, 25]
const DEFAULT_RADIUS_KM = Number(
  import.meta.env.VITE_DEFAULT_RADIUS_KM ?? 5,
)

export default function MapScreen() {
  if (!MAPS_API_KEY) {
    return (
      <div className="map-fallback" role="alert">
        <p>Map is not configured.</p>
        <p className="map-fallback__detail">
          Set VITE_GOOGLE_MAPS_API_KEY in .env.local and restart the dev
          server.
        </p>
      </div>
    )
  }

  return (
    <MapErrorBoundary>
      <APIProvider apiKey={MAPS_API_KEY} libraries={['marker']}>
        <MapContent />
      </APIProvider>
    </MapErrorBoundary>
  )
}

function MapContent() {
  const apiStatus = useApiLoadingStatus()

  const {
    position: userPosition,
    accuracy,
    status: locationStatus,
    error: locationError,
    request: requestLocation,
  } = useUserLocation()

  const [cameraCenter, setCameraCenter] = useState<LatLng>(FALLBACK_CENTER)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [selectedQuest, setSelectedQuest] = useState<NearbyQuest | null>(null)
  const [routeTo, setRouteTo] = useState<LatLng | null>(null)
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  // Quests follow the visible map area, not just the user.
  const { quests, loading, error: questsError } = useNearbyQuests(
    cameraCenter,
    {
      radiusKm,
      enabled: apiStatus === APILoadingStatus.LOADED,
    },
  )

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCameraCenter(ev.detail.center)
  }, [])

  const handleSelectQuest = useCallback((quest: NearbyQuest) => {
    setSelectedQuest(quest)
    setRouteTo(null)
    setRouteSummary(null)
    setRouteError(null)
  }, [])

  const handleRoute = useCallback((s: RouteSummary) => setRouteSummary(s), [])
  const handleRouteError = useCallback((m: string) => setRouteError(m), [])

  if (apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="map-fallback" role="alert">
        <p>Google Maps failed to load. Check your connection and API key.</p>
      </div>
    )
  }

  return (
    <div className="map-screen">
      <Map
        mapId={MAPS_MAP_ID}
        defaultCenter={FALLBACK_CENTER}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        reuseMaps
        onCameraChanged={handleCameraChanged}
        className="map-screen__map"
      >
        {userPosition && (
          <AdvancedMarker position={userPosition} title="You are here">
            <div
              className="user-dot"
              aria-label={`Your location, accuracy ${Math.round(accuracy ?? 0)} m`}
            />
          </AdvancedMarker>
        )}

        <QuestClusterer
          quests={quests}
          selectedId={selectedQuest?.id ?? null}
          onSelect={handleSelectQuest}
        />

        <DirectionsLayer
          origin={userPosition}
          destination={routeTo}
          onRoute={handleRoute}
          onError={handleRouteError}
        />
      </Map>

      <div className="map-screen__top">
        <PlaceSearch />
        <select
          className="radius-select"
          aria-label="Search radius"
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
        >
          {RADIUS_OPTIONS_KM.map((r) => (
            <option key={r} value={r}>
              {formatDistance(r * 1000)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="locate-button"
        aria-label="Use my location"
        disabled={locationStatus === 'locating'}
        onClick={requestLocation}
      >
        {locationStatus === 'locating' ? '…' : '◎'}
      </button>

      {loading && <div className="map-toast">Finding quests…</div>}
      {questsError && (
        <div className="map-toast map-toast--error">{questsError}</div>
      )}
      {locationStatus === 'denied' && (
        <div className="map-toast map-toast--error">
          Location permission denied. Enable it in your browser settings.
        </div>
      )}
      {locationError && locationStatus === 'error' && (
        <div className="map-toast map-toast--error">{locationError}</div>
      )}
      {routeError && (
        <div className="map-toast map-toast--error">{routeError}</div>
      )}

      {selectedQuest && (
        <div
          className="quest-sheet"
          role="dialog"
          aria-label={selectedQuest.title}
        >
          <button
            type="button"
            className="quest-sheet__close"
            aria-label="Close"
            onClick={() => {
              setSelectedQuest(null)
              setRouteTo(null)
              setRouteSummary(null)
            }}
          >
            ✕
          </button>
          <h2>{selectedQuest.title}</h2>
          <p className="quest-sheet__meta">
            {selectedQuest.experience_class} ·{' '}
            {formatDistance(selectedQuest.distance_km * 1000)} away
            {selectedQuest.location_name
              ? ` · ${selectedQuest.location_name}`
              : ''}
          </p>
          {selectedQuest.description && <p>{selectedQuest.description}</p>}
          {routeSummary && (
            <p className="quest-sheet__route">
              {routeSummary.distanceText} · {routeSummary.durationText} walk
            </p>
          )}
          <div className="quest-sheet__actions">
            <button
              type="button"
              disabled={!userPosition}
              onClick={() =>
                setRouteTo({ lat: selectedQuest.lat, lng: selectedQuest.lng })
              }
            >
              Show route
            </button>
            <a
              href={googleMapsDirectionsUrl({
                lat: selectedQuest.lat,
                lng: selectedQuest.lng,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
