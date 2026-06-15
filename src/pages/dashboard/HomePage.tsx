/**
 * HomePage — Phase 1.7 polish
 *
 * Changes from 1.6:
 *  - World-view fallback (zoom 2, neutral center) until location is granted
 *  - gestureHandling="greedy" — map scrolls naturally on mobile without double-tap
 *  - Custom XNEXT orange markers replace default Google red pins
 *  - AdventureRadarCapsule receives locationStatus (no longer takes onNext)
 *  - Capsule stack bottom clearance increased to clear the elevated NEXT button
 *
 * Preserved untouched: useUserLocation, useNearbyQuests, event bus, quest cycling.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  APIProvider,
  AdvancedMarker,
  Map,
} from '@vis.gl/react-google-maps'
import { useUserLocation } from '../../hooks/useUserLocation'
import { useNearbyQuests } from '../../hooks/useNearbyQuests'
import { MapErrorBoundary } from '../../components/map/MapErrorBoundary'
import type { LatLng } from '../../components/map/types'
import {
  MAPS_API_KEY,
  FALLBACK_CENTER,
  WORLD_VIEW_CENTER,
  WORLD_VIEW_ZOOM,
  XNEXT_MAP_STYLES,
} from '../../components/map/mapsConfig'
import { AdventureRadarCapsule } from '../../components/ui/AdventureRadarCapsule'
import { FeaturedExperienceCapsule } from '../../components/ui/FeaturedExperienceCapsule'

const HERO_RADIUS_KM = 25

/**
 * RADAR_DEMO_PINS — code-only visual placeholders.
 * Rendered as dim blinking signals when location is active but no real
 * quests exist in range. These communicate "scanning" energy — they make
 * no product claims and carry no real data. Offsets are in degrees;
 * at zoom 12 and ~46°N, 0.01° lat ≈ 1.1 km, 0.01° lng ≈ 0.75 km.
 */
const RADAR_DEMO_PINS = [
  { id: 'radar-demo-0', latDelta:  0.019, lngDelta:  0.024 },
  { id: 'radar-demo-1', latDelta: -0.011, lngDelta:  0.031 },
  { id: 'radar-demo-2', latDelta: -0.022, lngDelta: -0.018 },
  { id: 'radar-demo-3', latDelta:  0.027, lngDelta: -0.011 },
] as const

export function HomePage() {
  const navigate = useNavigate()
  const {
    position: userPosition,
    status: locationStatus,
    request: requestLocation,
  } = useUserLocation()

  const [heroCenter, setHeroCenter] = useState<LatLng>(FALLBACK_CENTER)
  const [hasAutoCentered, setHasAutoCentered] = useState(false)
  const [currentRadarIndex, setCurrentRadarIndex] = useState(0)

  // Real nearby quests — same hook & params as before, untouched
  const { quests: radarQuests } = useNearbyQuests(heroCenter, {
    radiusKm: HERO_RADIUS_KM,
    limit: 30,
    enabled: !!MAPS_API_KEY,
  })

  // Auto-request location on first load (same logic as MapScreen)
  useEffect(() => {
    if (locationStatus === 'idle') {
      if (import.meta.env.DEV) {
        console.log('[HomePage] First load — requesting user location')
      }
      requestLocation()
    }
  }, [locationStatus, requestLocation])

  // Center on real user coords once (guard against repeated re-center on watch updates)
  useEffect(() => {
    if (userPosition && locationStatus === 'active' && !hasAutoCentered) {
      if (import.meta.env.DEV) {
        console.log('[HomePage] Real location acquired — centering', userPosition)
      }
      setHeroCenter(userPosition)
      setHasAutoCentered(true)
    }
  }, [userPosition, locationStatus, hasAutoCentered])

  // Clamp radar index when quest list shrinks
  useEffect(() => {
    if (currentRadarIndex >= radarQuests.length && radarQuests.length > 0) {
      setCurrentRadarIndex(0)
    }
  }, [radarQuests.length, currentRadarIndex])

  // Listen for unified NEXT from bottom nav (event bus unchanged)
  useEffect(() => {
    const handler = () => {
      if (radarQuests.length > 0) {
        const nextIndex = (currentRadarIndex + 1) % radarQuests.length
        setCurrentRadarIndex(nextIndex)
        const nextQ = radarQuests[nextIndex]
        setHeroCenter({ lat: nextQ.lat, lng: nextQ.lng })
        if (import.meta.env.DEV) {
          console.log('[HomePage NEXT] cycled to:', nextQ.title)
        }
      }
    }
    window.addEventListener('xnext-next', handler)
    return () => window.removeEventListener('xnext-next', handler)
  }, [currentRadarIndex, radarQuests])

  const featuredQuest = radarQuests[currentRadarIndex] ?? radarQuests[0] ?? null
  const isLive = locationStatus === 'active'

  // P1: Use world view until location is granted, then switch to user-centric view
  const useWorldView = !hasAutoCentered && locationStatus !== 'active'
  const mapCenter = useWorldView ? WORLD_VIEW_CENTER : heroCenter
  const mapZoom = useWorldView ? WORLD_VIEW_ZOOM : 12

  const handleGo = () => {
    if (featuredQuest) {
      setHeroCenter({ lat: featuredQuest.lat, lng: featuredQuest.lng })
    }
  }

  return (
    <div className="relative h-full overflow-hidden bg-black">

      {/* ── World layer: full-screen map ────────────────────────────────── */}
      <div className="absolute inset-0">
        {MAPS_API_KEY ? (
          <MapErrorBoundary>
            <APIProvider apiKey={MAPS_API_KEY} libraries={['marker']}>
              <Map
                center={mapCenter}
                zoom={mapZoom}
                className="h-full w-full"
                gestureHandling="greedy"
                disableDefaultUI
                mapId={undefined}
                styles={XNEXT_MAP_STYLES}
              >
                {/* ── Real quest signal pins (capped at 5 for perf) ─────────
                    0×0 anchor wrapper so transform: translate(-50%,-50%)
                    centers the dot precisely on the lat/lng coordinate.    */}
                {!useWorldView && radarQuests.slice(0, 5).map((q) =>
                  q.lat != null && q.lng != null ? (
                    <AdvancedMarker
                      key={q.id}
                      position={{ lat: q.lat, lng: q.lng }}
                    >
                      <div style={{ position: 'relative', width: 0, height: 0 }}>
                        <div className="xnext-home-pin" />
                      </div>
                    </AdvancedMarker>
                  ) : null
                )}

                {/* ── Demo radar signals ─────────────────────────────────────
                    Shown ONLY when location is active but no real quests
                    are in range. Pure visual scanning energy — no product
                    copy, no fake quest data. Hidden once real quests load.  */}
                {isLive && !useWorldView && radarQuests.length === 0 && userPosition &&
                  RADAR_DEMO_PINS.map((pin, i) => (
                    <AdvancedMarker
                      key={pin.id}
                      position={{
                        lat: userPosition.lat + pin.latDelta,
                        lng: userPosition.lng + pin.lngDelta,
                      }}
                    >
                      <div style={{ position: 'relative', width: 0, height: 0 }}>
                        <div
                          className="xnext-demo-pin"
                          style={{ animationDelay: `${i * 0.65}s` }}
                        />
                      </div>
                    </AdvancedMarker>
                  ))
                }

                {/* ── User radar dot + sweep + ring ──────────────────────────
                    When active: full radar layer (sweep → ring → dot).
                    When locating/denied: just the dot (no sweep/ring).
                    0×0 anchor + absolute children = precise centering.     */}
                {userPosition && (
                  <AdvancedMarker position={userPosition}>
                    <div style={{ position: 'relative', width: 0, height: 0 }}>
                      {isLive && <div className="xnext-radar-sweep" />}
                      {isLive && <div className="xnext-radar-ring" />}
                      <div className="xnext-user-dot" />
                    </div>
                  </AdvancedMarker>
                )}
              </Map>
            </APIProvider>
          </MapErrorBoundary>
        ) : (
          /* Fallback world layer when API key not configured */
          <div className="h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
            <div className="text-center text-white/30 text-sm">
              <div className="text-4xl mb-2">🌍</div>
              <div className="font-mono tracking-wider text-xs">Configure VITE_GOOGLE_MAPS_API_KEY</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating capsule stack (above bottom nav + NEXT button) ─────── */}
      {/*
        bottom-24 (96px) clears the BottomNav capsule (72px) + elevated NEXT button (88px top).
        Max-width + auto margins keeps it phone-width on large screens.
      */}
      <div className="absolute bottom-24 left-3 right-3 z-20 flex flex-col gap-2.5 max-w-sm mx-auto w-[calc(100%-1.5rem)]">
        <AdventureRadarCapsule
          questCount={radarQuests.length}
          isLive={isLive}
          locationStatus={locationStatus}
          onRequestLocation={requestLocation}
        />

        <FeaturedExperienceCapsule
          quest={featuredQuest}
          locationStatus={locationStatus}
          onGo={handleGo}
          onDiscover={() => navigate('/dashboard/quests/new')}
        />
      </div>
    </div>
  )
}
