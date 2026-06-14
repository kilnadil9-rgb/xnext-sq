/**
 * HomePage — Phase 1.6 Capsule Experience Foundation
 *
 * Layout hierarchy:
 *   MAP (full-screen, world layer)
 *     ↓ floating
 *   AdventureRadarCapsule
 *   FeaturedExperienceCapsule
 *   BottomNavigation (in DashboardLayout)
 *
 * Visual only. No location logic, quest ranking, or event bus changes.
 */
import { useState, useEffect } from 'react'
import {
  APIProvider,
  AdvancedMarker,
  Map,
} from '@vis.gl/react-google-maps'
import { useUserLocation } from '../../hooks/useUserLocation'
import { useNearbyQuests } from '../../hooks/useNearbyQuests'
import { MapErrorBoundary } from '../../components/map/MapErrorBoundary'
import type { LatLng } from '../../components/map/types'
import { MAPS_API_KEY, FALLBACK_CENTER, XNEXT_MAP_STYLES } from '../../components/map/mapsConfig'
import { AdventureRadarCapsule } from '../../components/ui/AdventureRadarCapsule'
import { FeaturedExperienceCapsule } from '../../components/ui/FeaturedExperienceCapsule'

const HERO_RADIUS_KM = 25

export function HomePage() {
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

  const handleNext = () => {
    window.dispatchEvent(new CustomEvent('xnext-next'))
  }

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
                center={heroCenter}
                zoom={12}
                className="h-full w-full"
                gestureHandling="cooperative"
                disableDefaultUI
                mapId={undefined}
                styles={XNEXT_MAP_STYLES}
              >
                {/* Real experience markers (capped at 5 for performance) */}
                {radarQuests.slice(0, 5).map((q) =>
                  q.lat != null && q.lng != null ? (
                    <AdvancedMarker
                      key={q.id}
                      position={{ lat: q.lat, lng: q.lng }}
                    />
                  ) : null
                )}

                {/* User position marker */}
                {userPosition && (
                  <AdvancedMarker position={userPosition} />
                )}
              </Map>
            </APIProvider>
          </MapErrorBoundary>
        ) : (
          /* Fallback world layer when API key not configured */
          <div className="h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
            <div className="text-center text-white/30 text-sm">
              <div className="text-4xl mb-2">🌍</div>
              <div className="font-mono tracking-wider text-xs">WORLD LAYER</div>
              <div className="mt-1 opacity-60">Configure VITE_GOOGLE_MAPS_API_KEY</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating capsule stack (above bottom nav) ────────────────────── */}
      {/*
        Positioned above the fixed BottomNav (h-16 = 4rem).
        Both capsules sit flush-left to flush-right with a small gutter.
        Max-width + auto margins keep it phone-width on large screens.
      */}
      <div className="absolute bottom-[calc(4rem+12px)] left-3 right-3 z-20 flex flex-col gap-2.5 max-w-sm mx-auto w-[calc(100%-1.5rem)]">
        <AdventureRadarCapsule
          questCount={radarQuests.length}
          isLive={isLive}
          onNext={handleNext}
        />

        <FeaturedExperienceCapsule
          quest={featuredQuest}
          onGo={handleGo}
        />
      </div>
    </div>
  )
}
