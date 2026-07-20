import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { formatDistance } from '../../lib/distance'
import type { RankedQuest } from '../../lib/adventureRadar'
import type { NavProgress, NavRoute, RouteDiscovery } from './navTypes'
import { fastDistanceMeters } from './routeEngine'

/**
 * Explore Along Route (Goal 7) — XNEXT's differentiator.
 *
 * Surfaces nearby discoveries while navigating, ONE small card at a time,
 * built entirely from the radar quests already in memory (zero extra network).
 *
 * Discipline:
 *  - only quests within CORRIDOR_M of the REMAINING route (never behind)
 *  - ranked by verified > featured > seasonal > SQ score > proximity
 *  - one card, ~8 s on screen, then a quiet gap; each discovery shown once
 *  - card fades/slides via CSS; tapping it selects the quest (parent handles)
 */

const CORRIDOR_M = 1_800
/** How long one discovery card stays up. */
const SHOW_MS = 8_000
/** Quiet time between cards. */
const GAP_MS = 14_000
/** Re-scan the corridor at most this often. */
const SCAN_INTERVAL_MS = 20_000

function scoreDiscovery(q: RankedQuest, distFromRoute: number): number {
  let s = 0
  if (q.verified_location) s += 4
  if (q.is_featured) s += 3
  if (q.seasonal_active) s += 2
  s += (q.sq_score ?? 0) / 50 // 0–2 for SQ 0–100
  s += Math.max(0, 1 - distFromRoute / CORRIDOR_M) // nearer = better
  return s
}

const CLASS_ICONS: Record<string, string> = {
  opportunity: '🏷️',
  connection: '🤝',
  discovery: '🧭',
  challenge: '⛰️',
  moment: '📸',
}

interface ExploreAlongRouteProps {
  quests: RankedQuest[]
  route: NavRoute | null
  progress: NavProgress | null
  destinationId: string | null
  onSelect: (questId: string) => void
}

export const ExploreAlongRoute = memo(function ExploreAlongRoute({
  quests,
  route,
  progress,
  destinationId,
  onSelect,
}: ExploreAlongRouteProps) {
  const [current, setCurrent] = useState<RouteDiscovery | null>(null)
  const [leaving, setLeaving] = useState(false)
  const shownIdsRef = useRef<Set<string>>(new Set())
  const lastScanRef = useRef(0)
  const progressRef = useRef(progress)
  progressRef.current = progress

  // Candidate list along the REMAINING corridor — recomputed sparsely.
  const candidates = useMemo(() => {
    if (!route || !progress) return []
    const now = Date.now()
    if (now - lastScanRef.current < SCAN_INTERVAL_MS && current) return []
    lastScanRef.current = now

    // Sample the remaining path (every ~4th point keeps this O(n/4 × quests)
    // but bounded: radar caps at ~100 quests, paths at ~1k points).
    const remaining = route.path.slice(progress.segmentIndex)
    const sampled: typeof remaining = []
    for (let i = 0; i < remaining.length; i += 4) sampled.push(remaining[i])

    const found: RouteDiscovery[] = []
    for (const q of quests) {
      if (q.id === destinationId || shownIdsRef.current.has(q.id)) continue
      let best = Infinity
      for (const pt of sampled) {
        const d = fastDistanceMeters({ lat: q.lat, lng: q.lng }, pt)
        if (d < best) best = d
        if (best < 200) break // close enough — stop early
      }
      if (best <= CORRIDOR_M) {
        found.push({
          id: q.id,
          title: q.title,
          experienceClass: q.experience_class,
          distanceFromRouteMeters: best,
          lat: q.lat,
          lng: q.lng,
          verified: q.verified_location ?? false,
          featured: q.is_featured ?? false,
          score: scoreDiscovery(q, best),
        })
      }
    }
    found.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return found.slice(0, 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, progress?.stepIndex, quests, destinationId])

  // Card lifecycle: show top candidate → 8 s → fade out → quiet gap.
  useEffect(() => {
    if (current || candidates.length === 0) return
    const next = candidates[0]
    shownIdsRef.current.add(next.id)
    setCurrent(next)
    setLeaving(false)
    const hideTimer = window.setTimeout(() => setLeaving(true), SHOW_MS)
    const clearTimer = window.setTimeout(() => setCurrent(null), SHOW_MS + 400 + GAP_MS)
    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(clearTimer)
    }
  }, [candidates, current])

  if (!current) return null

  return (
    <button
      type="button"
      className={`nav2-discovery${leaving ? ' nav2-discovery--leaving' : ''}`}
      onClick={() => onSelect(current.id)}
      aria-label={`Discovery near your route: ${current.title}`}
    >
      <span className="nav2-discovery__icon" aria-hidden>
        {CLASS_ICONS[current.experienceClass] ?? '🧭'}
      </span>
      <span className="nav2-discovery__body">
        <span className="nav2-discovery__eyebrow">
          {current.verified ? '✓ Verified · ' : ''}Along your route
        </span>
        <span className="nav2-discovery__title">{current.title}</span>
        <span className="nav2-discovery__meta">
          {formatDistance(current.distanceFromRouteMeters)} off route
        </span>
      </span>
    </button>
  )
})
