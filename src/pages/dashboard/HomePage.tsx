import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

// Map background (reused patterns from MapScreen / hooks; only for visual world layer + real radar count)
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
import { AdventureFrame } from '../../components/ui/AdventureFrame'

/**
 * Dashboard home — real data previews for Active Pulse (top 3), Saved Dream List (top 3 saved),
 * and Discover Quests (top 3 published). Partial section failures are tolerated.
 */
export function HomePage() {


  // Map hero + Adventure Radar status (real data only)
  const {
    position: userPosition,
    status: locationStatus,
    request: requestLocation,
  } = useUserLocation()

  const [heroCenter, setHeroCenter] = useState<LatLng>(FALLBACK_CENTER)
  const HERO_RADIUS_KM = 25

  // Real nearby quests for radar count + subtle bg markers (via existing RPC)
  const { quests: radarQuests } = useNearbyQuests(
    heroCenter,
    { radiusKm: HERO_RADIUS_KM, limit: 30, enabled: !!MAPS_API_KEY }
  )

  const [hasAutoCentered, setHasAutoCentered] = useState(false)
  const [currentRadarIndex, setCurrentRadarIndex] = useState(0)

  // Auto-request location on first load (same logic as MapScreen) for real coords.
  useEffect(() => {
    if (locationStatus === 'idle') {
      if (import.meta.env.DEV) {
        console.log('[HomePage] First load — requesting user location for centering and Radar query')
      }
      requestLocation()
    }
  }, [locationStatus, requestLocation])

  // Keep hero map centered on user when available (prefer real location). Guard to auto-center only once on grant.
  useEffect(() => {
    if (userPosition && locationStatus === 'active' && !hasAutoCentered) {
      if (import.meta.env.DEV) {
        console.log('[HomePage] Real user location acquired — centering map and Radar on user coords', userPosition)
      }
      setHeroCenter(userPosition)
      setHasAutoCentered(true)
    }
  }, [userPosition, locationStatus, hasAutoCentered])

  // Clamp index if list changes (e.g. after location grant)
  useEffect(() => {
    if (currentRadarIndex >= radarQuests.length && radarQuests.length > 0) {
      setCurrentRadarIndex(0)
    }
  }, [radarQuests.length, currentRadarIndex])

  // Listen for unified NEXT from bottom nav (same as MapScreen) so bottom NEXT works on Home too.
  // Cycles the radar experience, pans map to it, updates the visible card.
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

  const locationLabel =
    locationStatus === 'active'
      ? 'Using your location'
      : locationStatus === 'locating'
      ? 'Locating…'
      : locationStatus === 'denied'
      ? 'Location permission denied'
      : locationStatus === 'unavailable'
      ? 'Geolocation unavailable'
      : 'Safe fallback (map view)'



  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground">
      {/* Full map background (world layer) — always visible, no partial hero */}
      <div className="absolute inset-0 overflow-hidden bg-muted">
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
                {/* Subtle real markers (capped) to make the world feel alive — no fakes */}
                {radarQuests.slice(0, 5).map((q) =>
                  q.lat != null && q.lng != null ? (
                    <AdvancedMarker
                      key={q.id}
                      position={{ lat: q.lat, lng: q.lng }}
                    />
                  ) : null
                )}
                {/* User position marker when available (real) */}
                {userPosition && (
                  <AdvancedMarker position={userPosition} />
                )}
              </Map>
            </APIProvider>
          </MapErrorBoundary>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-center p-6 text-white/80">
            <div className="text-lg font-semibold tracking-tight">World layer</div>
            <p className="mt-1 max-w-xs text-sm opacity-70">
              Configure Google Maps key to see the living map background.
              Location still powers your personal discovery.
            </p>
          </div>
        )}

        {/* Floating glass overlay — reduced opacity so map shows through (clean Phase 1) */}
        <div className="absolute inset-x-3 bottom-3 z-10 md:inset-x-4 md:bottom-4 lg:left-4 lg:right-auto lg:w-[360px]">
          <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl p-4 text-white shadow-xl text-sm">
            <div>
              <div className="text-3xl font-bold tracking-tighter">Today</div>
              <div className="text-sm -mt-1 opacity-80">What might happen next?</div>
            </div>

            {/* Adventure Radar - replaced with framed HUD style per concept */}
            <AdventureFrame variant="radar" className="mt-2.5 !p-0 overflow-hidden">
              {/* Radar header bar - orange/yellow tech */}
              <div className="flex items-center justify-between bg-black/60 px-3 py-1.5 border-b border-[#f97316]/50">
                <div className="flex items-center gap-2">
                  <span className="text-[#f97316] text-sm tracking-[2px] font-bold">ADVENTURE RADAR</span>
                </div>
                <div className="text-[10px] text-[#fde047] font-mono px-2 py-0.5 bg-black/40 rounded border border-[#fde047]/30">
                  {HERO_RADIUS_KM} KM
                </div>
              </div>

              <div className="p-3 space-y-2">
                {/* Animated pulse ring + location status */}
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 flex-shrink-0">
                    <div className="absolute inset-0 rounded-full border-2 border-[#f97316] animate-ping opacity-60" />
                    <div className="absolute inset-1 rounded-full border border-[#fde047] flex items-center justify-center">
                      <span className="text-[#f97316] text-[10px]">●</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[#fde047] font-mono tracking-wider">LIVE • {locationLabel.toUpperCase()}</div>
                    <div className="text-xs text-white/60 truncate">Real-time scan active</div>
                  </div>
                </div>

                {/* Experience count + first card preview */}
                {radarQuests.length > 0 ? (
                  <div>
                    <div className="text-lg font-bold text-[#f97316] tabular-nums">{radarQuests.length} EXPERIENCES</div>
                    <div className="text-sm text-white mt-0.5 line-clamp-1 font-medium">
                      {radarQuests[currentRadarIndex]?.title || radarQuests[0]?.title}
                    </div>
                    <div className="text-[10px] text-white/60 line-clamp-1 mt-0.5">
                      {(radarQuests[currentRadarIndex] || radarQuests[0])?.description?.slice(0, 80) || 'Nearby discovery'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-lg font-bold text-[#f97316] tabular-nums">0 EXPERIENCES</div>
                    <div className="text-xs text-white/60 mt-1">No quests within range. Widen radius or enable location.</div>
                  </div>
                )}

                {(locationStatus !== 'active' && locationStatus !== 'locating') && (
                  <button
                    onClick={requestLocation}
                    className="text-[10px] text-[#fde047] underline hover:no-underline mt-1 block"
                  >
                    ENABLE LOCATION FOR LIVE SCAN
                  </button>
                )}
              </div>
            </AdventureFrame>

            {/* Quick actions as overlays (Discover → Save → Pulse loop) — compact */}
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
              <Link to="/dashboard/map" className="rounded-md bg-white/90 py-1.5 text-center font-semibold text-black active:bg-white">Explore Map</Link>
              <Link to="/dashboard/preferences" className="rounded-md border border-white/25 py-1.5 text-center hover:bg-white/10">Preferences</Link>
              <Link to="/dashboard/pulse" className="rounded-md border border-white/25 py-1.5 text-center hover:bg-white/10">Pulse</Link>
              <Link to="/dashboard/dream-list" className="rounded-md border border-white/25 py-1.5 text-center hover:bg-white/10">Dream List</Link>
            </div>
          </div>
        </div>

        {/* Bottom floating experience preview cards - upgraded with frame, "large image" placeholder (icon), category, distance, primary CTA. Map remains visible. */}
        <div className="absolute bottom-3 left-3 right-3 z-10 md:bottom-4 md:left-auto md:right-4 md:w-80 lg:w-72 pointer-events-auto">
          <AdventureFrame variant="card" className="!p-1 bg-black/70 text-[10px]">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {/* Example preview cards using real data where available - large "image" as icon header */}
              {radarQuests.length > 0 && (
                <div className="min-w-[110px] bg-black/60 rounded border border-white/10 p-1 flex-shrink-0">
                  <div className="h-6 bg-gradient-to-r from-orange-900/60 to-yellow-900/40 rounded mb-1 flex items-center justify-center text-[10px]">🏕️</div>
                  <div className="font-medium text-orange-300 truncate text-[9px]">{radarQuests[0].title}</div>
                  <div className="text-[8px] text-white/60">Nearby • {radarQuests[0].experience_class}</div>
                  <button onClick={() => window.dispatchEvent(new CustomEvent('xnext-next'))} className="mt-0.5 text-[8px] bg-primary text-black px-1 rounded w-full">NEXT</button>
                </div>
              )}
              {/* Fallback preview if no data */}
              {radarQuests.length === 0 && (
                <div className="min-w-[110px] bg-black/60 rounded border border-white/10 p-1 flex-shrink-0">
                  <div className="h-6 bg-gradient-to-r from-orange-900/60 to-yellow-900/40 rounded mb-1 flex items-center justify-center text-[10px]">🗺️</div>
                  <div className="font-medium text-orange-300 truncate text-[9px]">Discover more</div>
                  <div className="text-[8px] text-white/60">Widen radius or enable location</div>
                </div>
              )}
            </div>
          </AdventureFrame>
        </div>
      </div>
    </div>
  )
}


