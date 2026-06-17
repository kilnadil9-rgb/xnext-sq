import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map,
  useApiLoadingStatus,
  useMap,
  type MapCameraChangedEvent,
} from '@vis.gl/react-google-maps'
import { useRef } from 'react'
import { useUserLocation } from '../../hooks/useUserLocation'
import { useNearbyQuests } from '../../hooks/useNearbyQuests'
import { usePulseQuestIds } from '../../hooks/usePulseQuestIds'
import { useQuestPreferences } from '../../hooks/useQuestPreferences'
import { formatDistance } from '../../lib/distance'
import {
  rankQuests,
  type RadarSortMode,
  type RankedQuest,
} from '../../lib/adventureRadar'
import type { LatLng, RouteSummary } from './types'
import { MAPS_API_KEY, MAPS_MAP_ID, FALLBACK_CENTER, XNEXT_MAP_STYLES } from './mapsConfig'
import { MapErrorBoundary } from './MapErrorBoundary'
import { QuestClusterer } from './QuestClusterer'
import { QuestList } from './QuestList'
import { QuestPreviewCard } from './QuestPreviewCard'
import { PlaceSearch } from './PlaceSearch'
import { DirectionsLayer } from './DirectionsLayer'
import { AdventureRadarCapsule } from '../ui/AdventureRadarCapsule'
import { questCompletionService } from '../../services/questCompletionService'
import { dreamListService } from '../../services/dreamListService'
import './maps.css'

interface MapScreenProps {
  /**
   * Cinematic Home variant: adds the XNEXT radar sweep/ring on the user dot
   * and a floating Adventure Radar HUD, and trims redundant chrome (the
   * top-row NEXT lives in the bottom nav on Home). Default = classic /map.
   */
  cinematic?: boolean
}

const RADIUS_OPTIONS_KM = [1, 2.5, 5, 10, 25, 50]

/** Snap an arbitrary preferred distance onto the nearest radius option. */
function nearestRadiusOption(km: number): number {
  return RADIUS_OPTIONS_KM.reduce((best, r) =>
    Math.abs(r - km) < Math.abs(best - km) ? r : best,
  )
}
const DEFAULT_RADIUS_KM = Number(import.meta.env.VITE_DEFAULT_RADIUS_KM ?? 5)

function LiveRadiusRing({ center, radiusMiles }: { center: LatLng; radiusMiles: number }) {
  const map = useMap()
  const circleRef = useRef<google.maps.Circle | null>(null)

  useEffect(() => {
    if (!map) return
    const radiusMeters = radiusMiles * 1609.34
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        strokeColor: '#f97316',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#f97316',
        fillOpacity: 0.08,
        map,
        center,
        radius: radiusMeters,
      })
    } else {
      circleRef.current.setCenter(center)
      circleRef.current.setRadius(radiusMeters)
    }
    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null)
        circleRef.current = null
      }
    }
  }, [map, center, radiusMiles])

  return null
}

export default function MapScreen({ cinematic = false }: MapScreenProps = {}) {
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
        <RadarScreen cinematic={cinematic} />
      </APIProvider>
    </MapErrorBoundary>
  )
}

function RadarScreen({ cinematic = false }: { cinematic?: boolean }) {
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
  const [radiusTouched, setRadiusTouched] = useState(false)
  const [sortMode, setSortMode] = useState<RadarSortMode>('relevance')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedQuest, setSelectedQuest] = useState<RankedQuest | null>(null)
  const [routeTo, setRouteTo] = useState<LatLng | null>(null)
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [hasAutoCentered, setHasAutoCentered] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  // Live Mode state (Phase 1 MVP)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [liveRadiusMiles, setLiveRadiusMiles] = useState(5)

  // Progress system (cinematic Home only): Completed + Dream List counts.
  const [completedCount, setCompletedCount] = useState<number | null>(null)
  const [dreamCount, setDreamCount] = useState<number | null>(null)
  useEffect(() => {
    if (!cinematic) return
    let cancelled = false
    questCompletionService.getMyCompletions({ limit: 100 }).then((r) => {
      if (!cancelled && r.data) setCompletedCount(r.data.length)
    })
    dreamListService.getMyDreamList({ limit: 100 }).then((r) => {
      if (!cancelled && r.data) setDreamCount(r.data.length)
    })
    return () => {
      cancelled = true
    }
  }, [cinematic])

  const mapsReady = apiStatus === APILoadingStatus.LOADED



  // Auto-request location clearly on first load of the radar (triggers permission prompt where possible).
  // For strict mobile Safari, the locate button remains the reliable gesture-based fallback.
  // Adventure Radar will use real user coords once granted.
  useEffect(() => {
    if (locationStatus === 'idle' && mapsReady) {
      if (import.meta.env.DEV) {
        console.log('[MapScreen] First load — requesting user location for centering and Radar query')
      }
      requestLocation()
    }
  }, [locationStatus, mapsReady, requestLocation])

  // When real user location is granted, center the map and queries on it (do not stay on fallback).
  // Only auto-center once on initial grant (subsequent watch updates don't override user panning).
  useEffect(() => {
    if (userPosition && locationStatus === 'active' && !hasAutoCentered) {
      if (import.meta.env.DEV) {
        console.log('[MapScreen] Real user location acquired — centering map and Radar on user coords', userPosition)
      }
      setCameraCenter(userPosition)
      setHasAutoCentered(true)
    }
  }, [userPosition, locationStatus, hasAutoCentered])

  // Quests follow the visible map area (initially real user location once granted).
  // This ensures Adventure Radar starts with real user coordinates, not fallback.
  const effectiveRadiusKm = isLiveMode 
    ? liveRadiusMiles * 1.60934 
    : radiusKm

  const { quests, loading, error: questsError } = useNearbyQuests(
    cameraCenter,
    { radiusKm: effectiveRadiusKm, enabled: mapsReady, refreshKey },
  )

  if (import.meta.env.DEV && cameraCenter) {
    // Lightweight dev log only — helps verify real vs fallback without spamming prod
    console.log('[MapScreen] Radar query center (should be real user coords after grant):', cameraCenter)
  }

  // Pulse boost is optional sugar; empty set when unavailable.
  const pulseQuestIds = usePulseQuestIds(mapsReady)

  // User preferences: seed the default radius (until the user touches the
  // control) and boost preferred experience classes in relevance ranking.
  const { preferences } = useQuestPreferences(mapsReady)

  useEffect(() => {
    if (preferences && !radiusTouched) {
      setRadiusKm(nearestRadiusOption(Number(preferences.max_distance_km)))
    }
  }, [preferences, radiusTouched])

  const rankedQuests = useMemo(
    () =>
      rankQuests(quests, {
        radiusKm,
        sortMode,
        pulseQuestIds,
        preferredClasses: preferences?.preferred_classes,
      }),
    [quests, radiusKm, sortMode, pulseQuestIds, preferences],
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

  const handleNext = useCallback(() => {
    if (rankedQuests.length === 0) return
    const nextIndex = (currentIndex + 1) % rankedQuests.length
    setCurrentIndex(nextIndex)
    const nextQ = rankedQuests[nextIndex]
    handleSelectQuest(nextQ)
    setCameraCenter({ lat: nextQ.lat, lng: nextQ.lng })
    if (import.meta.env.DEV) {
      console.log('[NEXT] cycled to:', nextQ.title)
    }
  }, [currentIndex, rankedQuests, handleSelectQuest])

  // Auto-select first on load for immediate NEXT loop experience with real data
  useEffect(() => {
    if (rankedQuests.length > 0 && !selectedQuest) {
      setCurrentIndex(0)
      handleSelectQuest(rankedQuests[0])
    }
  }, [rankedQuests, selectedQuest, handleSelectQuest])

  // Listen for unified NEXT from bottom nav (or other sources)
  useEffect(() => {
    const handler = () => handleNext()
    window.addEventListener('xnext-next', handler)
    return () => window.removeEventListener('xnext-next', handler)
  }, [handleNext])

  // Live Mode listeners from bottom nav long press
  useEffect(() => {
    const enter = () => {
      if (import.meta.env.DEV) console.log('[Live] enter')
      setIsLiveMode(true)
      if (userPosition) {
        setCameraCenter(userPosition)
      }
      setLiveRadiusMiles(5) // default
    }
    const exit = () => {
      if (import.meta.env.DEV) console.log('[Live] exit')
      setIsLiveMode(false)
    }
    window.addEventListener('xnext-live-enter', enter)
    window.addEventListener('xnext-live-exit', exit)
    return () => {
      window.removeEventListener('xnext-live-enter', enter)
      window.removeEventListener('xnext-live-exit', exit)
    }
  }, [userPosition])

  const handleRoute = useCallback((s: RouteSummary) => setRouteSummary(s), [])
  const handleRouteError = useCallback((m: string) => setRouteError(m), [])
  const handleRetry = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Widen the search radius to the next larger preset (used by empty-state CTA).
  const canWiden = radiusKm < RADIUS_OPTIONS_KM[RADIUS_OPTIONS_KM.length - 1]
  const handleWiden = useCallback(() => {
    setRadiusTouched(true)
    setRadiusKm((current) => {
      const next = RADIUS_OPTIONS_KM.find((r) => r > current)
      return next ?? current
    })
  }, [])

  if (apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="map-fallback" role="alert">
        <p>Google Maps failed to load. Check your connection and API key.</p>
      </div>
    )
  }

  const isLive = locationStatus === 'active'

  return (
    <div className={`radar-screen${cinematic ? ' radar-screen--cinematic' : ''}`}>
      <div className="radar-screen__map">
        <Map
          mapId={MAPS_MAP_ID}
          center={cameraCenter}
          zoom={14}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          reuseMaps
          onCameraChanged={handleCameraChanged}
          className="radar-screen__canvas"
          styles={XNEXT_MAP_STYLES}
        >
          {userPosition && (
            <AdvancedMarker position={userPosition} title="You are here">
              {cinematic ? (
                /* Cinematic radar: rotating sweep + breathing ring + glowing dot */
                <div
                  style={{ position: 'relative', width: 0, height: 0 }}
                  aria-label={`Your location, accuracy ${Math.round(accuracy ?? 0)} m`}
                >
                  {isLive && <div className="xnext-radar-sweep" />}
                  {isLive && <div className="xnext-radar-ring" />}
                  <div className="xnext-user-dot" />
                </div>
              ) : (
                <div
                  className={`user-dot ${isLiveMode ? 'live' : ''}`}
                  aria-label={`Your location, accuracy ${Math.round(accuracy ?? 0)} m`}
                />
              )}
            </AdvancedMarker>
          )}

          {isLiveMode && userPosition && (
            <LiveRadiusRing center={userPosition} radiusMiles={liveRadiusMiles} />
          )}

          <QuestClusterer
            quests={rankedQuests}
            selectedId={selectedQuest?.id ?? null}
            onSelect={handleSelectFromMap}
            isLive={isLiveMode}
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
            onChange={(e) => {
              setRadiusTouched(true)
              setRadiusKm(Number(e.target.value))
            }}
          >
            {RADIUS_OPTIONS_KM.map((r) => (
              <option key={r} value={r}>
                {formatDistance(r * 1000)}
              </option>
            ))}
          </select>

          {/* Prominent NEXT button for cycling real experiences - tap to get the next nearby.
              Hidden on cinematic Home, where the bottom-nav NEXT is the sole hero action. */}
          {!cinematic && (
            <button
              onClick={handleNext}
              disabled={!rankedQuests.length}
              className="ml-2 px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              aria-label="Cycle to next experience"
            >
              NEXT
            </button>
          )}
        </div>

        {/* Cinematic Adventure Radar HUD — identity + live status, Home only.
            Sits above the map, below the corner chrome; the docked list below
            remains the full nearby panel. */}
        {cinematic && (
          <div className="radar-hud">
            <AdventureRadarCapsule
              questCount={rankedQuests.length}
              isLive={isLive}
              locationStatus={locationStatus}
              onRequestLocation={requestLocation}
            />
            {/* Progress system — sense of advancement, not endless scrolling */}
            <div className="radar-progress" role="status">
              <span><strong>{rankedQuests.length}</strong> Nearby</span>
              <span><strong>{completedCount ?? '—'}</strong> Completed</span>
              <span><strong>{dreamCount ?? '—'}</strong> Dream List</span>
            </div>
          </div>
        )}

        {/* Live Mode radius selector and exit (only when active) */}
        {isLiveMode && (
          <>
            <div className={`absolute ${cinematic ? 'top-32' : 'top-20'} left-1/2 -translate-x-1/2 z-[70] flex gap-1 bg-card/90 p-1 rounded-full shadow text-xs`}>
              {[0.5, 1, 5, 25].map((m) => (
                <button
                  key={m}
                  onClick={() => setLiveRadiusMiles(m)}
                  className={`px-2 py-0.5 rounded-full transition ${liveRadiusMiles === m ? 'bg-primary text-white' : 'hover:bg-muted'}`}
                >
                  {m} mi
                </button>
              ))}
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('xnext-live-exit'))}
              className="absolute top-4 right-4 z-[70] px-3 py-1 bg-card border text-sm rounded shadow hover:bg-muted"
            >
              Exit Live
            </button>
          </>
        )}

        {/* Clearer permission note — XNEXT language, less generic.
            On cinematic Home the radar HUD already conveys location state. */}
        {!cinematic && (
          <div className="absolute right-3 top-[88px] z-[60] max-w-[200px] rounded-md border border-border/70 bg-card/95 px-2 py-1 text-[10px] leading-snug shadow text-muted-foreground">
            See real experiences near you.<br />
            XNEXT uses your location only for discovery. Never sold.<br />
            Turn off anytime in settings.
          </div>
        )}

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
            Location off. Enable it to see real experiences around you. XNEXT never sells your location.
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
            onNext={handleNext}
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
        onWiden={handleWiden}
        canWiden={canWiden}
      />
    </div>
  )
}
