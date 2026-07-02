import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map,
  useApiLoadingStatus,
  useMap,
  type MapCameraChangedEvent,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { useRef } from 'react'
import { useUserLocation } from '../../hooks/useUserLocation'
import { useNearbyQuests } from '../../hooks/useNearbyQuests'
import { usePulseQuestIds } from '../../hooks/usePulseQuestIds'
import { useQuestPreferences } from '../../hooks/useQuestPreferences'
import { formatDistance, haversineMeters } from '../../lib/distance'
import { questService } from '../../services/questService'
import type { NearbyQuest } from '../../lib/supabase/types'
import {
  rankQuests,
  type RadarSortMode,
  type RankedQuest,
} from '../../lib/adventureRadar'
import type { LatLng } from './types'
import { MAPS_API_KEY, MAPS_MAP_ID, FALLBACK_CENTER, XNEXT_MAP_STYLES } from './mapsConfig'
import { MapErrorBoundary } from './MapErrorBoundary'
import { QuestClusterer } from './QuestClusterer'
import { QuestList } from './QuestList'
import { QuestPreviewCard } from './QuestPreviewCard'
import { GooglePoiSheet, type GooglePoiSelection } from './GooglePoiSheet'
import {
  RouteLayer,
  MultiStopRouteLayer,
  googleMapsMultiStopUrl,
  type RouteStatus,
  type RouteResult,
} from './DirectionsLayer'
import { PlaceSearch } from './PlaceSearch'
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

// Single source of truth for the blocked-permission guidance copy.
const blockedMessage =
  'Location is blocked. Open browser settings and allow location for xnext.app.'

// ── Yard Sale Route Mode (press-hold the center NEXT button) ─────────────────
/** 30 miles, per the feature spec. */
const YS_RADIUS_KM = 30 * 1.60934
/** Practical cap: keeps the Directions request + the drive sane. */
const YS_MAX_STOPS = 10

/**
 * Pick and order yard-sale stops. Priority (featured/paid placement first,
 * then community-verified) decides WHICH sales make the cut when there are
 * more than `maxStops`; geography (greedy nearest-neighbor from the user)
 * decides the visiting order. Google then refines the middle legs.
 */
function orderYardSaleStops(
  userPos: LatLng,
  sales: NearbyQuest[],
  maxStops: number,
): NearbyQuest[] {
  const shortlisted = [...sales]
    .sort((a, b) => {
      const pa = (a.is_featured ? 2 : 0) + (a.verified_location ? 1 : 0)
      const pb = (b.is_featured ? 2 : 0) + (b.verified_location ? 1 : 0)
      return pb - pa || a.distance_km - b.distance_km
    })
    .slice(0, maxStops)

  const remaining = [...shortlisted]
  const ordered: NearbyQuest[] = []
  let cursor = userPos
  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    remaining.forEach((q, i) => {
      const d = haversineMeters(cursor, { lat: q.lat, lng: q.lng })
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    })
    const next = remaining.splice(bestIdx, 1)[0]
    ordered.push(next)
    cursor = { lat: next.lat, lng: next.lng }
  }
  return ordered
}

/** Snap an arbitrary preferred distance onto the nearest radius option. */
function nearestRadiusOption(km: number): number {
  return RADIUS_OPTIONS_KM.reduce((best, r) =>
    Math.abs(r - km) < Math.abs(best - km) ? r : best,
  )
}
const DEFAULT_RADIUS_KM = Number(import.meta.env.VITE_DEFAULT_RADIUS_KM ?? 5)

// ── Timeline filter (Phase 3) ─────────────────────────────────────────────────
// Filters the visible experiences by *when* the user wants to go. Time-sensitive
// experiences (events/listings with a date) are matched against the window;
// evergreen/undated experiences are "available anytime" and always pass, so the
// map never goes empty. Pure, no I/O.
export type Timeframe = 'all' | 'today' | 'tonight' | 'weekend' | 'week' | 'month'

const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  all: 'All',
  today: 'Today',
  tonight: 'Tonight',
  weekend: 'This Weekend',
  week: 'This Week',
  month: 'This Month',
}

function matchesTimeframe(
  q: { starts_at?: string | null; start_date?: string | null },
  tf: Timeframe,
): boolean {
  if (tf === 'all') return true
  const raw = q.starts_at ?? q.start_date
  if (!raw) return true // evergreen / undated → available anytime
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return true // never hide on bad data

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (t < startOfToday.getTime()) return false // event already passed

  switch (tf) {
    case 'today':
      return t <= endOfToday.getTime()
    case 'tonight': {
      const eve = new Date(now)
      eve.setHours(17, 0, 0, 0)
      return t >= eve.getTime() && t <= endOfToday.getTime()
    }
    case 'weekend': {
      const day = now.getDay() // 0 Sun … 6 Sat
      const sat = new Date(startOfToday)
      sat.setDate(startOfToday.getDate() + ((6 - day + 7) % 7))
      const sun = new Date(sat)
      sun.setDate(sat.getDate() + 1)
      sun.setHours(23, 59, 59, 999)
      const start = day === 0 ? startOfToday.getTime() : sat.getTime()
      return t >= start && t <= sun.getTime()
    }
    case 'week': {
      const end = new Date(startOfToday)
      end.setDate(startOfToday.getDate() + 7)
      end.setHours(23, 59, 59, 999)
      return t <= end.getTime()
    }
    case 'month': {
      const end = new Date(startOfToday)
      end.setDate(startOfToday.getDate() + 31)
      end.setHours(23, 59, 59, 999)
      return t <= end.getTime()
    }
    default:
      return true
  }
}

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
      <APIProvider apiKey={MAPS_API_KEY} libraries={['marker', 'places', 'routes']}>
        <RadarScreen cinematic={cinematic} />
      </APIProvider>
    </MapErrorBoundary>
  )
}

function RadarScreen({ cinematic = false }: { cinematic?: boolean }) {
  const apiStatus = useApiLoadingStatus()
  const navigate = useNavigate()

  const {
    position: userPosition,
    accuracy,
    status: locationStatus,
    error: locationError,
    permission: locationPermission,
    blocked: locationBlocked,
    request: requestLocation,
  } = useUserLocation()

  const [cameraCenter, setCameraCenter] = useState<LatLng>(FALLBACK_CENTER)
  // Cinematic Home has no radius control — surface adventures passively with a
  // generous default that covers the whole Tri-Cities metro.
  const [radiusKm, setRadiusKm] = useState(cinematic ? 50 : DEFAULT_RADIUS_KM)
  const [radiusTouched, setRadiusTouched] = useState(false)
  const [sortMode, setSortMode] = useState<RadarSortMode>('relevance')
  // Phase 3: Timeline filter — which time window of experiences to show.
  const [timeframe, setTimeframe] = useState<Timeframe>('all')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedQuest, setSelectedQuest] = useState<RankedQuest | null>(null)
  // Phase 1.8 Part 3: a tapped Google POI (separate from XNEXT experiences).
  const [selectedPoi, setSelectedPoi] = useState<GooglePoiSelection | null>(null)
  // Follow-me: keep the camera on the user until they manually drag the map.
  const [followMe, setFollowMe] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)

  // Phase 2: in-app route preview (single destination). When routeDest is set
  // and we have a GPS fix, RouteLayer draws the line + reports distance/ETA.
  const [routeDest, setRouteDest] = useState<LatLng | null>(null)
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle')
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)

  // Live Mode state (Phase 1 MVP)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [liveRadiusMiles, setLiveRadiusMiles] = useState(5)

  // Yard Sale Route Mode (press-hold the center NEXT button).
  const [ysPromptOpen, setYsPromptOpen] = useState(false)
  const [ysLoading, setYsLoading] = useState(false)
  const [ysError, setYsError] = useState<string | null>(null)
  /** Stops as sent to the route layer (stable — never reordered in place). */
  const [ysStops, setYsStops] = useState<NearbyQuest[] | null>(null)
  /** Stops in Google's optimized visiting order, for the list UI. */
  const [ysDisplayStops, setYsDisplayStops] = useState<NearbyQuest[] | null>(null)
  const [ysStatus, setYsStatus] = useState<RouteStatus>('idle')
  const [ysResult, setYsResult] = useState<RouteResult | null>(null)

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



  // Auto-request location on first load — but ONLY when permission is already
  // granted (or the Permissions API is unavailable). When permission is
  // 'prompt', we must NOT auto-fire: Android Chrome and the Facebook in-app
  // browser only show the native prompt from a user gesture, and an auto call
  // that fails silently left the Enable tap in a broken state. The Enable
  // button / locate button call requestLocation() directly from the tap.
  // When 'denied' (blocked), no call can prompt — the UI shows settings guidance.
  useEffect(() => {
    if (
      locationStatus === 'idle' &&
      mapsReady &&
      (locationPermission === 'granted' || locationPermission === 'unknown')
    ) {
      if (import.meta.env.DEV) {
        console.log('[MapScreen] First load — permission granted/unknown, requesting user location')
      }
      requestLocation()
    }
  }, [locationStatus, mapsReady, locationPermission, requestLocation])

  // Follow-me map mode: while following, keep the camera (and the radar query
  // center) locked to the user's live position. Manual drag turns this off;
  // the Locate Me button turns it back on. Matches modern map-app behavior.
  useEffect(() => {
    if (followMe && userPosition) {
      setCameraCenter(userPosition)
    }
  }, [followMe, userPosition])

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
    // On cinematic Home we intentionally keep the wide default (no control).
    if (preferences && !radiusTouched && !cinematic) {
      setRadiusKm(nearestRadiusOption(Number(preferences.max_distance_km)))
    }
  }, [preferences, radiusTouched, cinematic])

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

  // Phase 3: apply the Timeline filter to what the map + list actually show.
  const displayedQuests = useMemo(
    () =>
      timeframe === 'all'
        ? rankedQuests
        : rankedQuests.filter((q) => matchesTimeframe(q, timeframe)),
    [rankedQuests, timeframe],
  )

  // Phase 3: broadcast the current nearby set so the Pulse/People sheets in
  // DashboardLayout can build real cards from data already loaded here (no
  // extra fetch, no backend). Small payload only.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('xnext-nearby-updated', {
        detail: {
          quests: displayedQuests.map((q) => ({
            id: q.id,
            title: q.title,
            experience_class: q.experience_class,
            distance_km: q.distance_km,
          })),
        },
      }),
    )
  }, [displayedQuests])

  // Phase 3: Timeline sheet (bottom nav) dispatches the chosen window here.
  useEffect(() => {
    const handler = (e: Event) => {
      const range = (e as CustomEvent).detail?.range as Timeframe | undefined
      if (range) setTimeframe(range)
    }
    window.addEventListener('xnext-timeline-filter', handler)
    return () => window.removeEventListener('xnext-timeline-filter', handler)
  }, [])

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCameraCenter(ev.detail.center)
  }, [])

  // Tap on a Google POI → open the lightweight POI sheet. Taps on empty map
  // are ignored (no placeId), so they never disrupt a selected experience.
  const handleMapClick = useCallback((ev: MapMouseEvent) => {
    const placeId = ev.detail.placeId
    if (!placeId) return
    // Suppress Google's default POI info window; XNEXT owns this interaction.
    ev.stop?.()
    const latLng = ev.detail.latLng
    setSelectedQuest(null)
    setSelectedPoi({
      placeId,
      location: latLng
        ? { lat: latLng.lat, lng: latLng.lng }
        : ev.map.getCenter()?.toJSON() ?? FALLBACK_CENTER,
    })
  }, [])

  // Clear the in-app route preview (line + ETA) and return to discovery.
  const clearRoute = useCallback(() => {
    setRouteDest(null)
    setRouteStatus('idle')
    setRouteResult(null)
  }, [])

  // Activate the route preview to a destination (parking or quest point).
  const handleRequestRoute = useCallback(
    (dest: LatLng) => {
      // Stop the camera following the user so the route can fit its bounds.
      setFollowMe(false)
      setRouteResult(null)
      setRouteDest(dest)
      // If we have no fix yet, RouteLayer can't mount — the card prompts the
      // user to enable location; status flips to loading once it does.
      setRouteStatus(userPosition ? 'loading' : 'idle')
    },
    [userPosition],
  )

  const handleSelectQuest = useCallback(
    (quest: RankedQuest) => {
      setSelectedPoi(null)
      setSelectedQuest(quest)
      clearRoute() // selecting a new experience clears any active route
    },
    [clearRoute],
  )

  // Marker clicks deliver a NearbyQuest; resolve it to its ranked twin.
  const handleSelectFromMap = useCallback(
    (quest: { id: string }) => {
      const ranked = displayedQuests.find((q) => q.id === quest.id)
      if (ranked) handleSelectQuest(ranked)
    },
    [displayedQuests, handleSelectQuest],
  )

  const handleNext = useCallback(() => {
    if (displayedQuests.length === 0) return
    const nextIndex = (currentIndex + 1) % displayedQuests.length
    setCurrentIndex(nextIndex)
    const nextQ = displayedQuests[nextIndex]
    handleSelectQuest(nextQ)
    setCameraCenter({ lat: nextQ.lat, lng: nextQ.lng })
    if (import.meta.env.DEV) {
      console.log('[NEXT] cycled to:', nextQ.title)
    }
  }, [currentIndex, displayedQuests, handleSelectQuest])

  // Auto-select first on load for immediate NEXT loop experience with real data
  useEffect(() => {
    if (displayedQuests.length > 0 && !selectedQuest) {
      setCurrentIndex(0)
      handleSelectQuest(displayedQuests[0])
    }
  }, [displayedQuests, selectedQuest, handleSelectQuest])

  // Listen for unified NEXT from bottom nav (or other sources)
  useEffect(() => {
    const handler = () => handleNext()
    window.addEventListener('xnext-next', handler)
    return () => window.removeEventListener('xnext-next', handler)
  }, [handleNext])

  // Phase 3: let the Pulse sheet open a specific experience by id (closes the
  // loop — a "saved experience is nearby" card becomes tappable).
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined
      if (!id) return
      const ranked = displayedQuests.find((q) => q.id === id)
      if (ranked) {
        handleSelectQuest(ranked)
        setCameraCenter({ lat: ranked.lat, lng: ranked.lng })
      }
    }
    window.addEventListener('xnext-select-quest', handler)
    return () => window.removeEventListener('xnext-select-quest', handler)
  }, [displayedQuests, handleSelectQuest])

  // Immediate visibility: when a discovery is created, refetch the radar so the
  // new experience appears on the map right away.
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener('xnext-quest-created', handler)
    return () => window.removeEventListener('xnext-quest-created', handler)
  }, [])

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

  const handleRetry = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Press-hold on the center NEXT button → glass quick-action popup.
  useEffect(() => {
    const handler = () => {
      setYsError(null)
      setYsPromptOpen(true)
    }
    window.addEventListener('xnext-longpress', handler)
    return () => window.removeEventListener('xnext-longpress', handler)
  }, [])

  const endYardSaleRoute = useCallback(() => {
    setYsStops(null)
    setYsDisplayStops(null)
    setYsStatus('idle')
    setYsResult(null)
    setYsError(null)
  }, [])

  const startYardSaleRoute = useCallback(async () => {
    if (!userPosition) {
      setYsError(
        locationBlocked
          ? blockedMessage
          : 'XNEXT needs your location for the starting point — tap Enable location below, then Start Route.',
      )
      return
    }
    setYsLoading(true)
    setYsError(null)
    const result = await questService.getNearbyQuests(
      userPosition.lat,
      userPosition.lng,
      YS_RADIUS_KM,
      { limit: 100 },
    )
    setYsLoading(false)
    if (result.error) {
      setYsError(result.error)
      return
    }
    // Real listings only — the RPC already filters to published + active
    // window + paid-settled, so every match here is live right now.
    const sales = (result.data ?? []).filter((q) => q.listing_type === 'yard_sale')
    if (sales.length === 0) {
      setYsError('No active yard sales within 30 miles right now.')
      return
    }
    const ordered = orderYardSaleStops(userPosition, sales, YS_MAX_STOPS)
    // Discovery mode takes the stage: clear the single-quest card + route.
    setSelectedQuest(null)
    setSelectedPoi(null)
    clearRoute()
    setFollowMe(false)
    setYsStops(ordered)
    setYsDisplayStops(ordered)
    setYsStatus('loading')
    setYsResult(null)
    setYsPromptOpen(false)
  }, [userPosition, locationBlocked, clearRoute])

  // Google's optimized waypoint order → reorder the LIST only (the layer's
  // props stay stable, so this never triggers a second Directions request).
  const handleYsOptimizedOrder = useCallback(
    (order: number[]) => {
      setYsDisplayStops(() => {
        if (!ysStops || ysStops.length === 0) return ysStops
        const middle = ysStops.slice(0, -1)
        const last = ysStops[ysStops.length - 1]
        const reordered = order
          .map((i) => middle[i])
          .filter((q): q is NearbyQuest => Boolean(q))
        return [...reordered, last]
      })
    },
    [ysStops],
  )

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

  // Radar capsule status: when we deliberately skipped the auto-request
  // (permission === 'prompt' needs a user gesture), show the "Enable" state
  // instead of an endless "Locating you…".
  const capsuleStatus =
    locationStatus === 'idle' && locationPermission === 'prompt'
      ? ('denied' as const)
      : locationStatus


  return (
    <div className={`radar-screen${cinematic ? ' radar-screen--cinematic' : ''}`}>
      <div className="radar-screen__map">
        <Map
          mapId={MAPS_MAP_ID}
          center={cameraCenter}
          zoom={14}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons
          reuseMaps
          onDragstart={() => setFollowMe(false)}
          onClick={handleMapClick}
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
            quests={displayedQuests}
            selectedId={selectedQuest?.id ?? null}
            onSelect={handleSelectFromMap}
            isLive={isLiveMode}
          />

          {/* In-app route preview line (Phase 2). Mounts only while a preview
              is active AND we have a GPS fix; unmounting clears the line. */}
          {routeDest && userPosition && !ysStops && (
            <RouteLayer
              key={`${routeDest.lat},${routeDest.lng}`}
              origin={userPosition}
              destination={routeDest}
              onStatus={setRouteStatus}
              onResult={setRouteResult}
            />
          )}

          {/* Yard Sale Route (multi-stop). Unmounting clears the line. */}
          {ysStops && ysStops.length > 0 && userPosition && (
            <MultiStopRouteLayer
              origin={userPosition}
              stops={ysStops.map((q) => ({ lat: q.lat, lng: q.lng }))}
              onStatus={setYsStatus}
              onResult={setYsResult}
              onOptimizedOrder={handleYsOptimizedOrder}
            />
          )}
        </Map>

        {/* Search-first UX removed: XNEXT surfaces adventures, users don't hunt.
            Classic /map keeps the search + radius bar; cinematic Home is calm
            (HUD + bottom nav only). */}
        {!cinematic && (
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

            <button
              onClick={handleNext}
              disabled={!displayedQuests.length}
              className="ml-2 px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              aria-label="Cycle to next experience"
            >
              NEXT
            </button>
          </div>
        )}

        {/* Cinematic Adventure Radar HUD — identity + live status, Home only.
            Sits above the map, below the corner chrome; the docked list below
            remains the full nearby panel. */}
        {cinematic && (
          <div className="radar-hud">
            <AdventureRadarCapsule
              questCount={rankedQuests.length}
              isLive={isLive}
              locationStatus={capsuleStatus}
              blocked={locationBlocked}
              accuracy={accuracy}
              onRequestLocation={requestLocation}
            />
            {/* Progress system — now tappable doorways back into the loop
                (Phase 3). Nearby focuses the docked list; Completed + Dream List
                open their existing views. */}
            <div className="radar-progress">
              <button
                type="button"
                className="radar-progress__stat"
                onClick={() =>
                  document
                    .querySelector('.radar-list')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                aria-label={`${displayedQuests.length} experiences nearby — view list`}
              >
                <strong>{displayedQuests.length}</strong> Nearby
              </button>
              <button
                type="button"
                className="radar-progress__stat"
                onClick={() => navigate('/dashboard/completed')}
                aria-label={`${completedCount ?? 0} completed — open Memories`}
              >
                <strong>{completedCount ?? '—'}</strong> Completed
              </button>
              <button
                type="button"
                className="radar-progress__stat"
                onClick={() => navigate('/dashboard/dream-list')}
                aria-label={`${dreamCount ?? 0} saved — open Dream List`}
              >
                <strong>{dreamCount ?? '—'}</strong> Dream List
              </button>
            </div>

            {/* Active Timeline filter chip — clearly shows the map is filtered
                and offers a one-tap clear. */}
            {timeframe !== 'all' && (
              <div className="radar-filter-chip" role="status">
                <span>Showing: {TIMEFRAME_LABEL[timeframe]}</span>
                <button
                  type="button"
                  onClick={() => setTimeframe('all')}
                  aria-label="Clear time filter"
                >
                  ✕
                </button>
              </div>
            )}
            {/* Banner dedupe: the Adventure Radar capsule above is the single
                location banner on cinematic Home (message + Enable button, or
                blocked-settings guidance). The old "Using approximate location
                — tap to enable GPS" pill duplicated it and stacked on top once
                the app already knew GPS was unavailable, so it's gone. */}
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
          className={`locate-button${followMe ? ' locate-button--active' : ''}`}
          aria-label="Locate me"
          aria-pressed={followMe}
          disabled={locationStatus === 'locating'}
          onClick={() => {
            setFollowMe(true)
            if (userPosition) setCameraCenter(userPosition)
            requestLocation()
          }}
        >
          {locationStatus === 'locating' ? '…' : '◎'}
        </button>

        {/* Location toasts: classic /map only — on cinematic Home the radar
            capsule is the single location banner (no stacked duplicates). */}
        {!cinematic && locationStatus === 'denied' && (
          <div className="map-toast map-toast--error">
            {locationBlocked
              ? blockedMessage
              : 'Location off. Enable it to see real experiences around you. XNEXT never sells your location.'}
          </div>
        )}
        {!cinematic && locationError && locationStatus === 'error' && (
          <div className="map-toast map-toast--error">{locationError}</div>
        )}
        {/* ── Yard Sale Route: glass quick-action popup (press-hold NEXT) ── */}
        {ysPromptOpen && (
          <div
            className="ys-backdrop"
            onClick={() => setYsPromptOpen(false)}
            role="presentation"
          >
            <div
              className="ys-modal"
              role="dialog"
              aria-label="Yard Sale Route"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ys-modal__icon" aria-hidden="true">🏷️</div>
              <h2 className="ys-modal__title">Yard Sale Route</h2>
              <p className="ys-modal__copy">
                Find every active yard sale within 30 miles and build a route
                from your current location.
              </p>

              {ysError && (
                <p className="ys-modal__error" role="alert">{ysError}</p>
              )}

              {/* Location gate: the route needs a real starting point. The
                  Enable tap calls getCurrentPosition directly (gesture-safe). */}
              {!userPosition && !locationBlocked && (
                <button
                  type="button"
                  className="ys-modal__secondary"
                  onClick={requestLocation}
                >
                  📍 Enable location
                </button>
              )}

              <div className="ys-modal__actions">
                <button
                  type="button"
                  className="ys-modal__cancel"
                  onClick={() => setYsPromptOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ys-modal__start"
                  disabled={ysLoading}
                  onClick={startYardSaleRoute}
                >
                  {ysLoading ? 'Finding yard sales…' : 'Start Route'}
                </button>
              </div>

              {/* Live Mode used to own this long-press — keep it reachable. */}
              <button
                type="button"
                className="ys-modal__live"
                onClick={() => {
                  setYsPromptOpen(false)
                  window.dispatchEvent(new CustomEvent('xnext-live-enter'))
                }}
              >
                ⭐ Live Mode instead
              </button>
            </div>
          </div>
        )}

        {/* ── Yard Sale Route: active route panel (replaces the quest card) ── */}
        {ysStops && ysDisplayStops && (
          <div className="ys-panel" role="dialog" aria-label="Yard Sale Route preview">
            <div className="ys-panel__head">
              <span className="ys-panel__title">
                🏷️ Yard Sale Route · {ysDisplayStops.length} stop{ysDisplayStops.length !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                className="ys-panel__close"
                aria-label="End route"
                onClick={endYardSaleRoute}
              >
                ✕
              </button>
            </div>

            <p className="ys-panel__status">
              {ysStatus === 'loading'
                ? 'Building your route…'
                : ysStatus === 'ok' && ysResult
                  ? `🚗 ${ysResult.durationText} · ${ysResult.distanceText} total`
                  : ysStatus === 'denied'
                    ? 'Route line needs Google Directions enabled — stop order below still works.'
                    : ysStatus === 'error'
                      ? 'Couldn’t draw the route line — stop order below still works.'
                      : null}
            </p>

            <ol className="ys-panel__stops">
              {ysDisplayStops.map((q) => (
                <li key={q.id}>
                  <span className="ys-panel__stop-title">{q.title}</span>
                  {q.location_name && (
                    <span className="ys-panel__stop-sub"> — {q.location_name}</span>
                  )}
                </li>
              ))}
            </ol>

            <div className="ys-panel__actions">
              {userPosition && (
                <a
                  className="ys-panel__maps"
                  href={googleMapsMultiStopUrl(
                    userPosition,
                    ysDisplayStops.map((q) => ({ lat: q.lat, lng: q.lng })),
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open full navigation in Google Maps ↗
                </a>
              )}
              <button type="button" className="ys-panel__end" onClick={endYardSaleRoute}>
                End Route
              </button>
            </div>
          </div>
        )}

        {selectedQuest && !ysStops && (
          <QuestPreviewCard
            quest={selectedQuest}
            userLocation={locationStatus === 'active' ? userPosition : null}
            onClose={() => {
              clearRoute()
              setSelectedQuest(null)
            }}
            onNext={handleNext}
            onRequestRoute={handleRequestRoute}
            onClearRoute={clearRoute}
            onRequestLocation={requestLocation}
            routeStatus={routeStatus}
            routeResult={routeResult}
          />
        )}
        {selectedPoi && !selectedQuest && !ysStops && (
          <GooglePoiSheet
            poi={selectedPoi}
            onClose={() => {
              clearRoute()
              setSelectedPoi(null)
            }}
            userLocation={locationStatus === 'active' ? userPosition : null}
            onRequestRoute={handleRequestRoute}
            onRequestLocation={requestLocation}
            routeActive={routeDest !== null}
            routeStatus={routeStatus}
            routeResult={routeResult}
          />
        )}
      </div>

      <QuestList
        quests={displayedQuests}
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
        userLocation={locationStatus === 'active' ? userPosition : null}
      />
    </div>
  )
}
