/**
 * People → My Journey — the explorer's personal journey summary.
 *
 * Reuses existing sources of truth: quest_completions, dream_list, profile
 * (trust score + member-since), and the marker system (level, earned,
 * placed, discovered). No duplicate stores.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  questCompletionService,
  type QuestCompletionWithQuest,
} from '../../services/questCompletionService'
import { dreamListService } from '../../services/dreamListService'
import {
  useExplorerProgression,
  useMarkerInventory,
  useMyPlacedMarkers,
  useMyMarkerDiscoveries,
} from '../../hooks/useExplorerMarkers'

interface Props {
  onClose: () => void
}

export function MyJourneySection({ onClose }: Props) {
  const { profile } = useAuth()
  const progression = useExplorerProgression()
  const { inventory } = useMarkerInventory()
  const { placed } = useMyPlacedMarkers()
  const { keepsakes } = useMyMarkerDiscoveries()

  const [recent, setRecent] = useState<QuestCompletionWithQuest[]>([])
  const [dreamCount, setDreamCount] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      questCompletionService.getMyCompletions({ limit: 5 }),
      dreamListService.getMyDreamList({ status: 'saved', limit: 100 }),
    ]).then(([completions, dream]) => {
      if (cancelled) return
      if (completions.data) setRecent(completions.data)
      if (dream.data) setDreamCount(dream.data.length)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded || progression.loading) {
    return (
      <div className="space-y-3 p-4" aria-label="Loading your journey">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5 motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/5 motion-reduce:animate-none" />
      </div>
    )
  }

  const markersEarned = inventory.reduce((sum, r) => sum + r.awarded, 0)
  const activePlacements = placed.filter((m) => m.status === 'active').length
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : null

  const stats: { label: string; value: string | number }[] = [
    { label: 'Experiences completed', value: progression.verifiedCompletions },
    ...(dreamCount !== null ? [{ label: 'On your Dream List', value: dreamCount }] : []),
    ...(typeof profile?.trust_score === 'number'
      ? [{ label: 'Explorer Score', value: profile.trust_score }]
      : []),
    { label: 'Markers earned', value: markersEarned },
    { label: 'Markers placed', value: activePlacements },
    { label: 'Markers discovered', value: keepsakes.length },
  ]

  return (
    <div className="space-y-4 p-4">
      {/* ── Level card ── */}
      <section
        aria-label="Explorer level"
        className="rounded-2xl border border-[#f97316]/25 bg-gradient-to-br from-[#f97316]/10 to-transparent p-4"
      >
        {progression.level ? (
          <>
            <p className="text-lg font-black text-white">{progression.level.level_name}</p>
            <p className="mt-0.5 text-xs text-white/50">
              {progression.verifiedCompletions} verified{' '}
              {progression.verifiedCompletions === 1 ? 'completion' : 'completions'}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-black text-white">Your journey starts here</p>
            <p className="mt-0.5 text-xs text-white/50">
              Complete your first experience to become a Trail Explorer.
            </p>
          </>
        )}
        {progression.nextMilestone && (
          <p className="mt-2 text-[11px] text-[#fdba74]">
            {progression.nextMilestone.required_completions - progression.verifiedCompletions}{' '}
            more to {progression.nextMilestone.level_name}
          </p>
        )}
        {memberSince && (
          <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/35">
            Exploring since {memberSince}
          </p>
        )}
      </section>

      {/* ── Stats grid ── */}
      <section aria-label="Journey stats" className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="text-lg font-black tabular-nums text-white">{s.value}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/50">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ── Recent completions (existing activity data, preserved) ── */}
      <section aria-label="Recent adventures">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/40">
          Recent adventures
        </h4>
        {recent.length > 0 ? (
          <div className="space-y-2">
            {recent.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f97316]/15 text-sm">
                  🏆
                </div>
                <div className="min-w-0 text-sm text-white/70">
                  You completed{' '}
                  <strong className="text-white">{c.quests?.title ?? 'an adventure'}</strong>
                  <span className="block text-[11px] text-white/40">
                    {new Date(c.completed_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {c.story ? ' · memory saved' : ''}
                    {Array.isArray(c.media_urls) && c.media_urls.length > 0
                      ? ` · ${c.media_urls.length} photo${c.media_urls.length > 1 ? 's' : ''}`
                      : ''}
                  </span>
                </div>
              </div>
            ))}
            <Link
              to="/dashboard/completed"
              onClick={onClose}
              className="flex min-h-[44px] items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10"
            >
              <span>View all Memories</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
            Share or complete an experience to start building your activity.
          </div>
        )}
      </section>
    </div>
  )
}
