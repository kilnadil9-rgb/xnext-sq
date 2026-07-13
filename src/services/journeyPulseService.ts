/**
 * Journey Pulse repository — derives qualifying activity from EXISTING
 * trusted records (no duplicate activity log, no snapshot table in v1):
 *
 *   completions (+ Explorer Notes, photos, Dream List link, seasonal quests),
 *   explorer marker placements, marker discoveries.
 *
 * All records are owner-scoped by RLS and carry server timestamps. The pulse
 * value itself is computed by the pure `calculateJourneyPulse` — a client
 * cannot submit a pulse value, only the database's own records feed it.
 *
 * Excluded by construction: deleted completions (gone from the query),
 * cancelled marker placements (consumed=false), moderation-removed markers,
 * and anything older than the 90-day window.
 */
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import {
  calculateJourneyPulse,
  JOURNEY_PULSE_WINDOW_DAYS,
  type JourneyPulseActivity,
  type JourneyPulseResult,
} from '../lib/journeyPulse'

interface PulseCompletionRow {
  id: string
  quest_id: string
  completed_at: string
  dream_list_id: string | null
  explorer_note: string | null
  media_urls: unknown
  quests: {
    experience_class: string
    active_months: number[] | null
    start_date: string | null
    end_date: string | null
  } | null
}

/** Breakdown for the detail panel ("What moved your pulse"). */
export interface JourneyPulseBreakdown {
  verifiedCompletions: number
  dreamListCompletions: number
  explorerNotes: number
  markersPlaced: number
  markersDiscovered: number
  /** Days covered by the breakdown (last 30, matching the detail copy). */
  windowDays: number
}

export interface JourneyPulseData {
  result: JourneyPulseResult
  breakdown: JourneyPulseBreakdown
}

function isSeasonalActive(
  quest: PulseCompletionRow['quests'],
  completedAt: string,
): boolean {
  if (!quest) return false
  const t = Date.parse(completedAt)
  if (!Number.isFinite(t)) return false
  const month = new Date(t).getUTCMonth() + 1
  if (Array.isArray(quest.active_months) && quest.active_months.includes(month)) {
    return true
  }
  if (quest.start_date && quest.end_date) {
    const start = Date.parse(quest.start_date)
    const end = Date.parse(quest.end_date)
    return Number.isFinite(start) && Number.isFinite(end) && t >= start && t <= end
  }
  return false
}

export const journeyPulseService = {
  async getMyJourneyPulse(): Promise<ServiceResult<JourneyPulseData>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const windowStart = new Date(
      Date.now() - JOURNEY_PULSE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const [completionsRes, allCompletionsRes, markersRes, discoveriesRes] =
      await Promise.all([
        supabase
          .from('quest_completions')
          .select(
            'id,quest_id,completed_at,dream_list_id,explorer_note,media_urls,quests(experience_class,active_months,start_date,end_date)',
          )
          .eq('user_id', user.id)
          .gte('completed_at', windowStart)
          .order('completed_at', { ascending: false })
          .limit(500)
          .returns<PulseCompletionRow[]>(),
        // Full history (ids + class + time) to detect FIRST-time category
        // completions without a second source of truth.
        supabase
          .from('quest_completions')
          .select('id,completed_at,quests(experience_class)')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: true })
          .limit(2000)
          .returns<
            { id: string; completed_at: string; quests: { experience_class: string } | null }[]
          >(),
        supabase
          .from('explorer_markers')
          .select('id,placed_at,status,consumed')
          .eq('owner_user_id', user.id)
          .gte('placed_at', windowStart)
          .returns<
            { id: string; placed_at: string; status: string; consumed: boolean }[]
          >(),
        supabase
          .from('explorer_marker_discoveries')
          .select('id,marker_id,discovered_at')
          .eq('user_id', user.id)
          .gte('discovered_at', windowStart)
          .returns<{ id: string; marker_id: string; discovered_at: string }[]>(),
      ])

    if (completionsRes.error) {
      return { data: null, error: extractMessage(completionsRes.error) }
    }

    const completions = completionsRes.data ?? []
    const activity: JourneyPulseActivity[] = []

    // First-time category completions (bonus applies when the very first
    // completion of a class falls inside the window).
    const firstOfClass = new Map<string, string>() // class → completion id
    for (const c of allCompletionsRes.data ?? []) {
      const cls = c.quests?.experience_class
      if (cls && !firstOfClass.has(cls)) firstOfClass.set(cls, c.id)
    }
    const firstCategoryIds = new Set(firstOfClass.values())

    for (const c of completions) {
      activity.push({
        id: `completion:${c.id}`,
        type: 'verified_completion',
        occurredAt: c.completed_at,
        experienceId: c.quest_id,
      })
      if (firstCategoryIds.has(c.id)) {
        activity.push({
          id: `first-category:${c.id}`,
          type: 'first_category_completion',
          occurredAt: c.completed_at,
          experienceId: c.quest_id,
        })
      }
      if (c.dream_list_id) {
        activity.push({
          id: `dream:${c.id}`,
          type: 'dream_list_completion',
          occurredAt: c.completed_at,
          experienceId: c.quest_id,
        })
      }
      if (c.explorer_note) {
        activity.push({
          id: `note:${c.id}`,
          type: 'explorer_note',
          occurredAt: c.completed_at,
          experienceId: c.quest_id,
        })
      }
      if (Array.isArray(c.media_urls) && c.media_urls.length > 0) {
        activity.push({
          id: `photo:${c.id}`,
          type: 'photo_contribution',
          occurredAt: c.completed_at,
          experienceId: c.quest_id,
        })
      }
      if (isSeasonalActive(c.quests, c.completed_at)) {
        activity.push({
          id: `seasonal:${c.id}`,
          type: 'seasonal_completion',
          occurredAt: c.completed_at,
          experienceId: c.quest_id,
        })
      }
    }

    // Marker placements: cancelled placements (retired within grace,
    // consumed=false) and moderation removals do NOT count.
    for (const m of markersRes.data ?? []) {
      if (m.status === 'active') {
        activity.push({
          id: `placed:${m.id}`,
          type: 'marker_placed',
          occurredAt: m.placed_at,
          markerId: m.id,
        })
      }
    }

    for (const d of discoveriesRes.data ?? []) {
      activity.push({
        id: `discovered:${d.id}`,
        type: 'marker_discovered',
        occurredAt: d.discovered_at,
        markerId: d.marker_id,
      })
    }

    const result = calculateJourneyPulse(activity)

    // Detail-panel breakdown: last 30 days, real counts only.
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000
    const in30 = (iso: string) => {
      const t = Date.parse(iso)
      return Number.isFinite(t) && t >= cutoff30
    }
    const breakdown: JourneyPulseBreakdown = {
      verifiedCompletions: completions.filter((c) => in30(c.completed_at)).length,
      dreamListCompletions: completions.filter(
        (c) => c.dream_list_id && in30(c.completed_at),
      ).length,
      explorerNotes: completions.filter(
        (c) => c.explorer_note && in30(c.completed_at),
      ).length,
      markersPlaced: (markersRes.data ?? []).filter(
        (m) => m.status === 'active' && in30(m.placed_at),
      ).length,
      markersDiscovered: (discoveriesRes.data ?? []).filter((d) =>
        in30(d.discovered_at),
      ).length,
      windowDays: 30,
    }

    return { data: { result, breakdown }, error: null }
  },
}
