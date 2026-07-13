/**
 * People → Community — the shared trail of evidence, not a social feed.
 *
 * World in Motion: real aggregate counts (metrics that aren't supported are
 * simply omitted — no fake community statistics, ever).
 * Journey Activity: short evidence-based items; names appear ONLY for
 * profiles with public journey visibility (enforced server-side).
 * Explorer Spotlight: structure only — empty-state capable, no invented users.
 */
import { useState } from 'react'
import { useCommunityMetrics } from '../../hooks/useExplorerMarkers'
import { MARKER_TIER_LABEL } from '../../lib/explorerMarkers'
import type { CommunityActivityItem } from '../../lib/supabase/types'
import { shareQuest } from '../../utils/shareQuest'

export function CommunitySection() {
  const { metrics, activity, loading } = useCommunityMetrics()

  // "Share XNEXT" — preserved from the previous People panel: invites friends
  // to the app itself, native share with clipboard fallback.
  const [shareToast, setShareToast] = useState<string | null>(null)
  const handleShareApp = async () => {
    const result = await shareQuest({ title: 'XNEXT — Discover local adventures' })
    if (result === 'shared') setShareToast('Share ready')
    else if (result === 'copied') setShareToast('Copied to clipboard')
    else return
    setTimeout(() => setShareToast(null), 2200)
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-label="Loading community">
        <div className="h-28 animate-pulse rounded-2xl bg-white/5 motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/5 motion-reduce:animate-none" />
      </div>
    )
  }

  const stats: { label: string; value: number }[] = metrics
    ? [
        { label: 'Experiences completed today', value: metrics.completions_today },
        { label: 'Explorer notes added today', value: metrics.explorer_notes_today },
        { label: 'Markers on the trail', value: metrics.markers_placed_total },
        { label: 'Markers discovered today', value: metrics.markers_discovered_today },
        { label: 'Dream List experiences completed today', value: metrics.dream_completed_today },
      ].filter((s) => Number.isFinite(s.value))
    : []
  const hasMotion = stats.some((s) => s.value > 0)

  return (
    <div className="space-y-4 p-4">
      {/* ── World in Motion ── */}
      <section aria-label="World in Motion">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
          World in Motion
        </h4>
        {hasMotion ? (
          <div className="grid grid-cols-2 gap-2">
            {stats
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <p className="text-xl font-black tabular-nums text-white">{s.value}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/50">{s.label}</p>
                </div>
              ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
            The explorer network is beginning to grow. Complete an experience
            and help leave a trail for the next person.
          </div>
        )}
      </section>

      {/* ── Journey Activity ── */}
      <section aria-label="Journey Activity">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
          Journey Activity
        </h4>
        {activity.length > 0 ? (
          <ul className="space-y-2">
            {activity.map((item, i) => (
              <li
                key={`${item.kind}-${i}`}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70"
              >
                <span aria-hidden="true" className="mt-0.5 text-base">
                  {activityIcon(item.kind)}
                </span>
                <span>
                  {activityText(item)}
                  <span className="block text-[11px] text-white/35">
                    {new Date(item.happened_on).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
            The explorer network is beginning to grow. Complete an experience
            and help leave a trail for the next person.
          </div>
        )}
      </section>

      {/* ── Explorer Spotlight (structure only — no invented users) ── */}
      <section aria-label="Explorer Spotlight">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
          Explorer Spotlight
        </h4>
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center text-sm text-white/50">
          Complete experiences and contribute evidence to build your explorer
          journey.
        </div>
      </section>

      {/* ── Share XNEXT (preserved feature) ── */}
      <section aria-label="Share XNEXT" className="rounded-xl border border-[#f97316]/40 bg-[#f97316]/10 p-3">
        <p className="mb-2 text-xs text-[#fdba74]">
          Share an experience to help grow the community.
        </p>
        <button
          type="button"
          onClick={handleShareApp}
          className="min-h-[44px] w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground"
        >
          📤 Share XNEXT
        </button>
        {shareToast && (
          <p className="mt-2 text-center text-[11px] text-[#fdba74]" role="status">
            {shareToast}
          </p>
        )}
      </section>
    </div>
  )
}

function activityIcon(kind: CommunityActivityItem['kind']): string {
  switch (kind) {
    case 'marker_placed':
      return '⛳'
    case 'marker_discovered':
      return '🧭'
    case 'explorer_note':
      return '📝'
    default:
      return '🏆'
  }
}

function activityText(item: CommunityActivityItem): React.ReactNode {
  const who = item.explorer_name ?? 'An explorer'
  const tierLabel = item.tier ? MARKER_TIER_LABEL[item.tier] : null
  switch (item.kind) {
    case 'marker_placed':
      return (
        <>
          {who} left a {tierLabel} Marker at{' '}
          <strong className="text-white">{item.quest_title}</strong>.
        </>
      )
    case 'marker_discovered':
      return (
        <>
          A {tierLabel} Marker was discovered at{' '}
          <strong className="text-white">{item.quest_title}</strong>.
        </>
      )
    case 'explorer_note':
      return (
        <>
          A new Explorer Note was added at{' '}
          <strong className="text-white">{item.quest_title}</strong>.
        </>
      )
    default:
      return (
        <>
          {who} completed <strong className="text-white">{item.quest_title}</strong>.
        </>
      )
  }
}
