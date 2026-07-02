import type { NearbyQuest } from './supabase/types'
import { seasonalRank } from './season'

/**
 * Adventure Radar ranking layer.
 * Pure functions — no I/O, no DB. Operates on NearbyQuest rows
 * already fetched via questService.getNearbyQuests.
 */

export type RadarSortMode = 'relevance' | 'distance' | 'sq_score'

export const RADAR_SORT_OPTIONS: { value: RadarSortMode; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'distance', label: 'Distance' },
  { value: 'sq_score', label: 'SQ Score' },
]

export interface RankedQuest extends NearbyQuest {
  /** 0..1 composite Adventure Radar score */
  radar_score: number
  /** Quest has an active Pulse alert for this user */
  has_pulse: boolean
}

export interface RankOptions {
  radiusKm: number
  sortMode: RadarSortMode
  /** Quest ids with active pulse alerts (optional boost + badge) */
  pulseQuestIds?: ReadonlySet<string>
  /**
   * The user's preferred experience classes (user_quest_preferences).
   * When non-empty, matching quests get a relevance boost — non-matching
   * quests are never hidden, only ranked lower.
   */
  preferredClasses?: ReadonlyArray<string>
  /** Injectable clock for tests */
  now?: number
}

const WEIGHTS = {
  proximity: 0.45,
  sq: 0.35,
  recency: 0.1,
  pulse: 0.1,
  preference: 0.15,
  seasonal: 0.25,
  // Verified Adventure System: community-verified locations get a SLIGHT
  // relevance boost (trust signal, roughly half a pulse). Deliberately small —
  // it breaks ties in favor of verified quests without burying fresh uploads.
  // Distance/SQ sort modes are untouched (those stay factual).
  verified: 0.08,
} as const

const RECENCY_WINDOW_DAYS = 30

/**
 * Seasonal relevance multiplier (Phase 1.8 discovery logic):
 *   active seasonal (0) → 1 · active date-based (1) → 0.9 ·
 *   evergreen (2) → 0.4 · off-season (3) → 0.
 * Prefers the RPC-computed seasonal_rank, falling back to a local computation
 * so the ranker still works if the RPC predates migration 019.
 */
export function seasonalFactor(quest: NearbyQuest, now: number): number {
  const rank =
    typeof quest.seasonal_rank === 'number'
      ? quest.seasonal_rank
      : seasonalRank(quest, now)
  switch (rank) {
    case 0:
      return 1
    case 1:
      return 0.9
    case 2:
      return 0.4
    default:
      return 0
  }
}

/** Exponential distance decay: 1 at 0 km, ~0.14 at the radius edge. */
export function proximityFactor(distanceKm: number, radiusKm: number): number {
  const scale = Math.max(radiusKm / 2, 0.5)
  return Math.exp(-Math.max(distanceKm, 0) / scale)
}

/** Linear decay over RECENCY_WINDOW_DAYS; 0 when unpublished/old. */
export function recencyFactor(publishedAt: string | null, now: number): number {
  if (!publishedAt) return 0
  const ageMs = now - Date.parse(publishedAt)
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0
  const ageDays = ageMs / 86_400_000
  return Math.max(0, 1 - ageDays / RECENCY_WINDOW_DAYS)
}

/**
 * Score and sort quests for the radar list.
 * SQ scores are normalized against the max in the current result set,
 * so ranking is robust to whatever scale sq_score uses.
 */
export function rankQuests(
  quests: NearbyQuest[],
  {
    radiusKm,
    sortMode,
    pulseQuestIds,
    preferredClasses,
    now = Date.now(),
  }: RankOptions,
): RankedQuest[] {
  const maxSq = quests.reduce(
    (max, q) => Math.max(max, q.sq_score ?? 0),
    0,
  )
  const prefs =
    preferredClasses && preferredClasses.length > 0
      ? new Set(preferredClasses)
      : null

  const scored: RankedQuest[] = quests.map((q) => {
    const hasPulse = pulseQuestIds?.has(q.id) ?? false
    const proximity = proximityFactor(q.distance_km, radiusKm)
    const sq = maxSq > 0 ? (q.sq_score ?? 0) / maxSq : 0
    const recency = recencyFactor(q.published_at, now)
    const preferred = prefs?.has(q.experience_class) ?? false
    const seasonal = seasonalFactor(q, now)

    return {
      ...q,
      has_pulse: hasPulse,
      radar_score:
        WEIGHTS.proximity * proximity +
        WEIGHTS.sq * sq +
        WEIGHTS.recency * recency +
        WEIGHTS.pulse * (hasPulse ? 1 : 0) +
        WEIGHTS.preference * (preferred ? 1 : 0) +
        WEIGHTS.seasonal * seasonal +
        WEIGHTS.verified * (q.verified_location ? 1 : 0),
    }
  })

  switch (sortMode) {
    case 'distance':
      return scored.sort((a, b) => a.distance_km - b.distance_km)
    case 'sq_score':
      return scored.sort(
        (a, b) =>
          (b.sq_score ?? -1) - (a.sq_score ?? -1) ||
          a.distance_km - b.distance_km,
      )
    case 'relevance':
    default:
      return scored.sort(
        (a, b) =>
          b.radar_score - a.radar_score || a.distance_km - b.distance_km,
      )
  }
}
