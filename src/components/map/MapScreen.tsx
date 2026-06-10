import { useCallback, useMemo, useState } from 'react'
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
import { usePulseQuestIds } from '../../hooks/usePulseQuestIds'
import { formatDistance } from '../../lib/distance'
import {
  rankQuests,
  type RadarSortMode,
  type RankedQuest,
} from '../../lib/adventureRadar'
import type { LatLng, RouteSummary } from './types'
import { MapErrorBoundary } from './MapErrorBoundary'
import { QuestClusterer } from './QuestClusterer'
import { QuestList } from './QuestList'
import { QuestPreviewCard } from './QuestPreviewCard'
import { PlaceSearch } from './PlaceSearch'
import { DirectionsLayer } from './DirectionsLayer'
import './maps.css'

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined
const MAPS_MAP_ID =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ??
  'DEMO_MAP_ID'

const FALLBACK_CENTER: LatLng = { lat: 40.4168, lng: -3.7038 }
const RADIUS_OPTIONS_KM = [1, 2.5, 5, 10, 25]
const DEFAULT_RADIUS_KM = Number(import.meta.env.VITE_DEFAULT_RADIUS_KM ?? 5)

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
        <RadarScreen />
      </APIProvider>
    </MapErrorBoundary>
  )
}

function RadarScreen() {
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
  const [sortMode, setSortMode] = useState<RadarSortMode>('relevance')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedQuest, setSelectedQuest] = useState<RankedQuest | null>(null)
  const [routeTo, setRouteTo] = useState<LatLng | null>(null)
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const mapsReady = apiStatus === APILoadingStatus.LOADED

  // Quests follow the visible map area, not just the user.
  const { quests, loading, error: questsError } = useNearbyQuests(
    cameraCenter,
    { radiusKm, enabled: mapsReady, refreshKey },
  )

  // Pulse boost is optional sugar; empty set when unavailable.
  const pulseQuestIds = usePulseQuestIds(mapsReady)

  const rankedQuests = useMemo(
    () => rankQuests(quests, { radiusKm, sortMode, pulseQuestIds }),
    [quests, radiusKm, sortMode, pulseQuestIds],
  )

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCameraCenter(ev.detail.center)
  }, [])

  const clearRoute = useCallback(() => {
    setRouteTo(null)
    setRouteSummary(null)
    setRouteError(null)
  }, [])

  const handleSelectQuest = useCallback(
    (quest: RankedQuest) => {
      setSelectedQuest(quest)
      clearRoute()
    },
    [clearRoute],
  )

  // Marker clicks deliver a NearbyQuest; resolve it to its ranked twin.
  const handleSelectFromMap = useCallback(
    (quest: { id: string }) => {
      const ranked = rankedQuests.find((q) => q.id === quest.id)
      if (ranked) handleSelectQuest(ranked)
    },
    [rankedQuests, handleSelectQuest],
  )

  const handleRoute = useCallback((s: RouteSummary) => setRouteSummary(s), [])
  const handleRouteError = useCallback((m: string) => setRouteError(m), [])
  const handleRetry = useCallback(() => setRefreshKey((k) => k + 1), [])

  if (apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="map-fallback" role="alert">
        <p>Google Maps failed to load. Check your connection and API key.</p>
      </div>
    )
  }

  return (
    <div className="radar-screen">
      <div className="radar-screen__map">
        <Map
          mapId={MAPS_MAP_ID}
          defaultCenter={FALLBACK_CENTER}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          reuseMaps
          onCameraChanged={handleCameraChanged}
          className="radar-screen__canvas"
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
            quests={rankedQuests}
            selectedId={selectedQuest?.id ?? null}
            onSelect={handleSelectFromMap}
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
          <QuestPreviewCard
            quest={selectedQuest}
            routeSummary={routeSummary}
            routeDisabled={!userPosition}
            onShowRoute={() =>
              setRouteTo({ lat: selectedQuest.lat, lng: selectedQuest.lng })
            }
            onClose={() => {
              setSelectedQuest(null)
              clearRoute()
            }}
          />
        )}
      </div>

      <QuestList
        quests={rankedQuests}
        selectedId={selectedQuest?.id ?? null}
        loading={loading || !mapsReady}
        error={questsError}
        radiusKm={radiusKm}
        sortMode={sortMode}
        onSortChange={setSortMode}
        onSelect={handleSelectQuest}
        onRetry={handleRetry}
      />
    </div>
  )
}
