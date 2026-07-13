/**
 * People → Markers — earned inventory, placed markers, and the keepsake
 * collection (discoveries). Locked tiers show the next milestone from the
 * shared progression config — thresholds are never hardcoded here.
 */
import { useEffect } from 'react'
import {
  useExplorerProgression,
  useMarkerInventory,
  useMyPlacedMarkers,
  useMyMarkerDiscoveries,
} from '../../hooks/useExplorerMarkers'
import {
  MARKER_TIER_ORDER,
  MARKER_TIER_LABEL,
  MARKER_TIER_MEANING,
  unlockHintFor,
  isWithinGraceWindow,
} from '../../lib/explorerMarkers'
import { MarkerTierIcon } from '../markers/MarkerTierIcon'
import { markerService } from '../../services/markerService'
import { track } from '../../lib/analytics'

export function MarkersSection() {
  const progression = useExplorerProgression()
  const { inventory, loading, refresh } = useMarkerInventory()
  const { placed, refresh: refreshPlaced } = useMyPlacedMarkers()
  const { keepsakes } = useMyMarkerDiscoveries()

  useEffect(() => {
    track('marker_inventory_viewed', {})
  }, [])

  if (loading || progression.loading) {
    return (
      <div className="space-y-3 p-4" aria-label="Loading markers">
        <div className="h-48 animate-pulse rounded-2xl bg-white/5 motion-reduce:animate-none" />
      </div>
    )
  }

  const byTier = new Map(inventory.map((r) => [r.tier, r]))
  const hasAny = inventory.some((r) => r.awarded > 0)
  const activePlaced = placed.filter((m) => m.status === 'active')

  const cancelPlacement = async (markerId: string) => {
    const res = await markerService.cancelMarker(markerId)
    if (!res.error) {
      track('marker_placement_cancelled', {})
      refresh()
      refreshPlaced()
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* ── Inventory ── */}
      <section aria-label="Your markers">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
          Your Markers
        </h4>
        {!hasAny && (
          <div className="mb-2 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
            Your first Trail Markers unlock after your first verified
            experience.
          </div>
        )}
        <div className="space-y-2">
          {[...MARKER_TIER_ORDER].reverse().map((tier) => {
            const row = byTier.get(tier)
            const awarded = row?.awarded ?? 0
            const available = row?.available ?? 0
            const locked = awarded === 0
            const hint = locked
              ? unlockHintFor(tier, progression.verifiedCompletions, progression.milestones.length ? progression.milestones : undefined)
              : null
            return (
              <div
                key={tier}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  locked
                    ? 'border-white/5 bg-white/[0.02]'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <MarkerTierIcon tier={tier} locked={locked} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${locked ? 'text-white/40' : 'text-white'}`}>
                    {MARKER_TIER_LABEL[tier]}
                  </p>
                  <p className="truncate text-[11px] text-white/40">
                    {locked ? hint ?? 'Locked' : MARKER_TIER_MEANING[tier]}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                    locked
                      ? 'bg-white/5 text-white/30'
                      : 'bg-[#f97316]/15 text-[#fdba74]'
                  }`}
                >
                  {locked ? 'Locked' : `${available} available`}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Placed markers ── */}
      {activePlaced.length > 0 && (
        <section aria-label="Markers you placed">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
            On the trail
          </h4>
          <div className="space-y-2">
            {activePlaced.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <MarkerTierIcon tier={m.tier} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/80">
                    {MARKER_TIER_LABEL[m.tier]} Marker
                    <span className="text-white/40">
                      {' '}· {new Date(m.placed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </p>
                  {m.note && (
                    <p className="truncate text-[11px] text-white/45">“{m.note}”</p>
                  )}
                </div>
                {isWithinGraceWindow(m.locked_at) ? (
                  <button
                    type="button"
                    onClick={() => cancelPlacement(m.id)}
                    className="min-h-[44px] rounded-lg border border-white/15 px-2.5 text-[11px] text-white/50 hover:text-white"
                  >
                    Cancel
                  </button>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider text-white/30">
                    Permanent
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Keepsake collection ── */}
      <section aria-label="Discovered markers">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
          Keepsakes — markers you discovered
        </h4>
        {keepsakes.length > 0 ? (
          <div className="space-y-2">
            {keepsakes.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <MarkerTierIcon tier={k.tier} size={20} />
                <div className="min-w-0 flex-1 text-sm text-white/70">
                  {MARKER_TIER_LABEL[k.tier]} Marker at{' '}
                  <strong className="text-white">{k.quest_title}</strong>
                  <span className="block text-[11px] text-white/40">
                    Added to your Journey{' '}
                    {new Date(k.discovered_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
            Reach experiences in the real world to discover markers left by
            other explorers.
          </div>
        )}
      </section>
    </div>
  )
}
