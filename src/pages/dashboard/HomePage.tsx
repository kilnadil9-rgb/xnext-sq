import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

import { pulseService } from '../../services/pulseService'
import { dreamListService } from '../../services/dreamListService'
import { questService } from '../../services/questService'
import type { PulseAlert, DreamListItemWithQuest, Quest } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

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
import { MAPS_API_KEY, FALLBACK_CENTER } from '../../components/map/mapsConfig'

/**
 * Dashboard home — map-background Today experience (world as homepage).
 * Real data previews for Active Pulse (top 3), Saved Dream List (top 3 saved),
 * and Discover Quests (top 3 published). Partial section failures are tolerated.
 * Re-applied / restored for live deployment.
 */
export function HomePage() {
  // Preview data (top 3 from each source)
  const [pulseAlerts, setPulseAlerts] = useState<PulseAlert[]>([])
  const [dreamItems, setDreamItems] = useState<DreamListItemWithQuest[]>([])
  const [discoverQuests, setDiscoverQuests] = useState<Quest[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sectionErrors, setSectionErrors] = useState<{
    pulse?: string
    dream?: string
    quests?: string
  }>({})

  // Map hero + Adventure Radar status (real data only)
  const {
    position: userPosition,
    status: locationStatus,
    error: locationError,
    request: requestLocation,
  } = useUserLocation()

  const [heroCenter, setHeroCenter] = useState<LatLng>(FALLBACK_CENTER)
  const HERO_RADIUS_KM = 25

  // Real nearby quests for radar count + subtle bg markers (via existing RPC)
  const { quests: radarQuests } = useNearbyQuests(
    heroCenter,
    { radiusKm: HERO_RADIUS_KM, limit: 30, enabled: !!MAPS_API_KEY }
  )

  // Keep hero map centered on user when available (prefer real location)
  useEffect(() => {
    if (userPosition) {
      setHeroCenter(userPosition)
    }
  }, [userPosition])

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

  const loadPreviews = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSectionErrors({})

    const [pulseRes, dreamRes, questsRes] = await Promise.all([
      pulseService.getActivePulseAlerts({ limit: 3 }),
      dreamListService.getMyDreamList({ limit: 3, status: 'saved' }),
      questService.listPublishedQuests({ limit: 3 }),
    ])

    let failCount = 0

    if (pulseRes.error) {
      setSectionErrors((prev) => ({ ...prev, pulse: pulseRes.error ?? undefined }))
      failCount++
    } else {
      setPulseAlerts(pulseRes.data ?? [])
    }

    if (dreamRes.error) {
      setSectionErrors((prev) => ({ ...prev, dream: dreamRes.error ?? undefined }))
      failCount++
    } else {
      setDreamItems(dreamRes.data ?? [])
    }

    if (questsRes.error) {
      setSectionErrors((prev) => ({ ...prev, quests: questsRes.error ?? undefined }))
      failCount++
    } else {
      setDiscoverQuests(questsRes.data ?? [])
    }

    if (failCount === 3) {
      setError('Failed to load dashboard previews.')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadPreviews()
  }, [loadPreviews])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Map hero background (world layer) + floating Today overlay */}
      <div className="relative h-[52vh] min-h-[300px] w-full overflow-hidden border-b border-border bg-muted">
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

        {/* Floating glass overlay — Today experience + core loop actions */}
        <div className="absolute inset-x-3 bottom-3 z-10 md:inset-x-6 md:bottom-6 lg:left-6 lg:right-auto lg:w-[400px]">
          <div className="rounded-2xl border border-white/15 bg-black/75 backdrop-blur-2xl p-5 text-white shadow-2xl">
            <div>
              <div className="text-3xl font-bold tracking-tighter">Today</div>
              <div className="text-sm -mt-1 opacity-80">What might happen next?</div>
            </div>

            {/* Compact real Adventure Radar status card */}
            <div className="mt-3 rounded-xl bg-white/10 p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium tracking-wide">Adventure Radar</span>
                <span className="font-mono text-xs opacity-75">{HERO_RADIUS_KM} km</span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {radarQuests.length} real quests found
              </div>
              <div className="mt-0.5 text-[11px] opacity-75">
                {locationLabel}
                {locationError ? ` • ${locationError}` : ''}
              </div>

              {(locationStatus !== 'active' && locationStatus !== 'locating') && (
                <button
                  onClick={requestLocation}
                  className="mt-2 inline-block rounded-md border border-white/30 px-2.5 py-0.5 text-[11px] hover:bg-white/10 active:bg-white/20"
                >
                  Enable location for personalized view
                </button>
              )}
            </div>

            {/* Quick actions — Discover → Save → Pulse → ... loop */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Link
                to="/dashboard/map"
                className="rounded-lg bg-white px-3 py-2 text-center font-semibold text-black shadow hover:bg-white/95 active:scale-[0.985]"
              >
                Explore Map
              </Link>
              <Link
                to="/dashboard/preferences"
                className="rounded-lg border border-white/30 px-3 py-2 text-center font-medium hover:bg-white/10"
              >
                Set Preferences
              </Link>
              <Link
                to="/dashboard/pulse"
                className="rounded-lg border border-white/30 px-3 py-2 text-center font-medium hover:bg-white/10"
              >
                View Pulse
              </Link>
              <Link
                to="/dashboard/dream-list"
                className="rounded-lg border border-white/30 px-3 py-2 text-center font-medium hover:bg-white/10"
              >
                Dream List
              </Link>
            </div>

            <div className="mt-2 text-[10px] opacity-60 text-center">
              Map = world • Pulse = alerts • Dream List = intent • Opportunities = discover
            </div>
          </div>
        </div>
      </div>

      {/* Below-hero content: real service previews (preserved exactly) + improved honest empty states */}
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {loading && <LoadingState message="Loading your previews…" />}

        {!loading && error && (
          <ErrorState
            message={error}
            onRetry={loadPreviews}
          />
        )}

        {!loading && !error && (
          <div className="space-y-8">
            {/* Active Pulse Preview — time-sensitive part of the loop */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Pulse Alerts</h2>
                <Link
                  to="/dashboard/pulse"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>

              {sectionErrors.pulse ? (
                <div className="rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="text-destructive">Failed to load pulse alerts.</span>{' '}
                  <button
                    onClick={loadPreviews}
                    className="text-primary underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              ) : pulseAlerts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm font-medium text-foreground">Your radar is quiet right now.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Time-sensitive opportunities matching your preferences will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pulseAlerts.map((alert) => (
                    <ActivePulsePreviewCard key={alert.id} alert={alert} />
                  ))}
                </div>
              )}
            </section>

            {/* Saved Dream List Preview — save/intent part of the loop */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Dream List Highlights</h2>
                <Link
                  to="/dashboard/dream-list"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>

              {sectionErrors.dream ? (
                <div className="rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="text-destructive">Failed to load dream list.</span>{' '}
                  <button
                    onClick={loadPreviews}
                    className="text-primary underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              ) : dreamItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm font-medium text-foreground">Save experiences to your Dream List and XNEXT will track what matters.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your saved intent powers future Pulse alerts and recommendations.
                  </p>
                  <Link
                    to="/dashboard/quests"
                    className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Explore opportunities
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {dreamItems.map((item) => (
                    <SavedDreamPreviewCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            {/* Discover / Opportunities Preview — discover/experience part of the loop */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Opportunities Today</h2>
                <Link
                  to="/dashboard/quests"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>

              {sectionErrors.quests ? (
                <div className="rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="text-destructive">Failed to load quests.</span>{' '}
                  <button
                    onClick={loadPreviews}
                    className="text-primary underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              ) : discoverQuests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm font-medium text-foreground">Turn on location or widen your radius to discover more.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Real experiences from the world around you will surface here when available.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {discoverQuests.map((quest) => (
                    <DiscoverQuestPreviewCard key={quest.id} quest={quest} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Preview Cards (display only; no actions) ─────────────────────────────────

function ActivePulsePreviewCard({ alert }: { alert: PulseAlert }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {alert.triggered_by.replace(/_/g, ' ')}
        </div>
        {alert.sq_score_at_trigger != null && (
          <div className="mt-1 text-lg font-semibold text-primary">
            SQ {alert.sq_score_at_trigger}
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {new Date(alert.created_at).toLocaleString()}
      </div>

      <div className="mt-auto pt-3">
        <Link to="/dashboard/pulse" className="text-sm text-primary hover:underline">
          View in Pulse →
        </Link>
      </div>
    </div>
  )
}

function SavedDreamPreviewCard({ item }: { item: DreamListItemWithQuest }) {
  const q = item.quests
  const questLabel = q ? q.title : (item.quest_id ? `Quest ${item.quest_id.slice(0, 8)}...` : 'Unknown quest')
  const linkId = q ? q.id : item.quest_id

  return (
    <Link to={`/dashboard/quests/${linkId}`} className="block no-underline">
      <div className="flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
        <div className="font-semibold text-foreground line-clamp-2">{questLabel}</div>

        <div className="mt-2 text-xs text-muted-foreground">Priority: {item.priority}</div>

        {item.target_date && (
          <div className="mt-1 text-xs text-muted-foreground">
            Target: {new Date(item.target_date).toLocaleDateString()}
          </div>
        )}
      </div>
    </Link>
  )
}

function DiscoverQuestPreviewCard({ quest }: { quest: Quest }) {
  return (
    <Link to={`/dashboard/quests/${quest.id}`} className="block no-underline">
      <div className="flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground capitalize">
            {quest.experience_class}
          </span>

          {quest.sq_score != null && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              SQ {quest.sq_score}
            </span>
          )}
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-semibold text-foreground">
          {quest.title}
        </h3>
      </div>
    </Link>
  )
}
