/**
 * ExperienceMarkerSummary — compact marker evidence on the experience detail
 * sheet, plus discovery ("Explorer Marker Nearby") and placement entry point.
 *
 * Markers are a NEW signal alongside verified completions, Explorer Notes,
 * and photos — this block never replaces those.
 *
 * Discovery: markers can be revealed when the explorer has completed the
 * experience OR is physically within the experience radius (same rule the
 * server enforces in discover_explorer_marker — no second proximity system,
 * default radius mirrors the server's 500 m fallback).
 */
import { useMemo, useState } from 'react'
import {
  useExperienceMarkers,
  useMyMarkerDiscoveries,
} from '../../hooks/useExplorerMarkers'
import { markerService } from '../../services/markerService'
import {
  MARKER_TIER_LABEL,
  summarizeMarkerTiers,
} from '../../lib/explorerMarkers'
import { MarkerTierIcon } from './MarkerTierIcon'
import { MarkerPlacementFlow } from './MarkerPlacementFlow'
import { haversineMeters } from '../../lib/distance'
import { track } from '../../lib/analytics'
import type { LatLng } from '../map/types'
import type { ExperienceMarkerView } from '../../lib/supabase/types'

/** Mirrors the server-side default in discover_explorer_marker (027). */
const DEFAULT_DISCOVERY_RADIUS_M = 500

interface Props {
  questId: string
  questTitle: string
  questLocation: LatLng | null
  experiencePhotos: string[]
  userLocation: LatLng | null
  /** The current user completed this experience (existing completion state). */
  isCompleted: boolean
}

export function ExperienceMarkerSummary({
  questId,
  questTitle,
  questLocation,
  experiencePhotos,
  userLocation,
  isCompleted,
}: Props) {
  const { markers, loading, refresh } = useExperienceMarkers(questId)
  const { refresh: refreshKeepsakes } = useMyMarkerDiscoveries(false)
  const [expanded, setExpanded] = useState(false)
  const [placementOpen, setPlacementOpen] = useState(false)
  const [busyMarkerId, setBusyMarkerId] = useState<string | null>(null)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)

  const summary = useMemo(() => summarizeMarkerTiers(markers), [markers])

  // Same eligibility shape the server enforces: completion OR within radius.
  const withinRadius =
    userLocation !== null &&
    questLocation !== null &&
    haversineMeters(userLocation, questLocation) <= DEFAULT_DISCOVERY_RADIUS_M
  const canDiscover = isCompleted || withinRadius

  const othersMarkers = markers.filter((m) => !m.is_mine)
  const undiscovered = othersMarkers.filter((m) => !m.discovered_by_me)

  const reveal = () => {
    setRevealed(true)
    setExpanded(true)
    track('marker_discovered', { count: undiscovered.length })
  }

  const addToJourney = async (marker: ExperienceMarkerView) => {
    setBusyMarkerId(marker.id)
    setDiscoverError(null)
    const res = await markerService.discoverMarker(marker.id, userLocation)
    setBusyMarkerId(null)
    if (res.error) {
      setDiscoverError(res.error)
      return
    }
    track('marker_added_to_journey', { tier: marker.tier })
    refresh()
    refreshKeepsakes()
  }

  const report = async (marker: ExperienceMarkerView) => {
    const reason = window.prompt(
      'Why are you reporting this marker? (A moderator will review it.)',
    )
    if (!reason?.trim()) return
    const res = await markerService.reportMarker(marker.id, reason)
    if (!res.error) track('marker_reported', { tier: marker.tier })
  }

  if (loading) {
    return (
      <div className="my-2 h-10 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none" />
    )
  }

  return (
    <div className="my-2">
      {/* ── Compact summary ── */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
            Explorer Markers
          </p>
          {markers.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="min-h-[44px] px-2 text-xs text-[#fdba74]"
            >
              {expanded ? 'Hide' : 'View'}
            </button>
          )}
        </div>

        {markers.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {summary.map((s) => (
              <span key={s.tier} className="flex items-center gap-1 text-sm text-white/75">
                <MarkerTierIcon tier={s.tier} size={16} />
                {s.count} {MARKER_TIER_LABEL[s.tier]}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-white/55">
            No explorer has left a marker here yet. Complete this experience
            and begin its trail.
          </p>
        )}

        {/* Explorer Marker Nearby — subtle, tap-to-reveal (never auto-pops) */}
        {undiscovered.length > 0 && canDiscover && !revealed && (
          <button
            type="button"
            onClick={reveal}
            className="mt-2 flex min-h-[44px] w-full items-center justify-between rounded-lg border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2 text-sm text-[#fdba74]"
          >
            <span>🧭 Explorer Marker Nearby — tap to reveal</span>
            <span aria-hidden="true">→</span>
          </button>
        )}

        {/* Leave a Marker — only offered once the experience is completed */}
        {isCompleted && (
          <button
            type="button"
            onClick={() => setPlacementOpen(true)}
            className="mt-2 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 hover:border-[#f97316]/40 hover:text-white"
          >
            ⛳ Leave a Marker
          </button>
        )}
      </div>

      {/* ── Expanded marker list ── */}
      {expanded && markers.length > 0 && (
        <div className="mt-2 space-y-2">
          {discoverError && (
            <p className="text-xs text-red-400" role="alert">
              {discoverError}
            </p>
          )}
          {markers.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-center gap-2">
                <MarkerTierIcon tier={m.tier} size={18} />
                <p className="min-w-0 flex-1 truncate text-sm text-white/80">
                  <strong className="text-white">{MARKER_TIER_LABEL[m.tier]}</strong>
                  {' · '}
                  {m.is_mine ? 'You' : m.explorer_name}
                  {m.level_name_at_placement && (
                    <span className="text-white/40"> · {m.level_name_at_placement}</span>
                  )}
                </p>
                <span className="text-[11px] text-white/35">
                  {new Date(m.placed_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {m.note && (
                <p className="mt-1.5 text-sm italic leading-snug text-white/60">
                  “{m.note}”
                </p>
              )}
              {m.photo_url && (
                <img
                  src={m.photo_url}
                  alt=""
                  loading="lazy"
                  className="mt-2 h-24 w-full rounded-lg object-cover"
                />
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-white/35">
                  {m.discovery_count > 0
                    ? `In ${m.discovery_count} explorer ${m.discovery_count === 1 ? 'journey' : 'journeys'}`
                    : ''}
                </span>
                <div className="flex items-center gap-1">
                  {!m.is_mine && (
                    <button
                      type="button"
                      onClick={() => report(m)}
                      className="min-h-[44px] px-2 text-[11px] text-white/35 hover:text-white/70"
                    >
                      Report
                    </button>
                  )}
                  {!m.is_mine && !m.discovered_by_me && canDiscover && (
                    <button
                      type="button"
                      disabled={busyMarkerId === m.id}
                      onClick={() => addToJourney(m)}
                      className="min-h-[44px] rounded-lg bg-[#f97316]/15 px-3 text-xs font-semibold text-[#fdba74] disabled:opacity-60"
                    >
                      {busyMarkerId === m.id ? 'Adding…' : 'Add to My Journey'}
                    </button>
                  )}
                  {m.discovered_by_me && (
                    <span className="text-xs text-[#fdba74]">✓ In your Journey</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!canDiscover && othersMarkers.length > 0 && (
            <p className="text-center text-[11px] text-white/40">
              Reach this experience in the real world to add its markers to
              your Journey.
            </p>
          )}
        </div>
      )}

      {/* ── Placement flow ── */}
      {placementOpen && (
        <MarkerPlacementFlow
          questId={questId}
          questTitle={questTitle}
          experiencePhotos={experiencePhotos}
          onCancel={() => setPlacementOpen(false)}
          onPlaced={() => {
            setPlacementOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}
