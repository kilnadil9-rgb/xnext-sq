/**
 * Explorer Markers service — the only client path to the marker system.
 *
 * Every sensitive operation (awards, placement, cancellation, discovery,
 * reporting) is a SECURITY DEFINER database function (migration 027); this
 * service never writes marker tables directly, and the database rejects any
 * attempt to do so (no RLS write policies exist). The client is untrusted.
 */
import { supabase } from '../lib/supabase/client'

import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import type {
  ExplorerMarker,
  ExplorerMarkerAward,
  ExplorerMarkerDiscovery,
  ExplorerMarkerMilestone,
  ExperienceMarkerView,
  MarkerInventoryRow,
} from '../lib/supabase/types'
import type { ExplorerMarkerTier, MarkerMilestone } from '../lib/explorerMarkers'
import { DEFAULT_MILESTONES } from '../lib/explorerMarkers'

/**
 * Untyped RPC escape hatch — same convention as questService's
 * find_quests_nearby call: the hand-authored Database types don't satisfy
 * supabase-js v2 RPC generics, so results are cast at each call site.
 */
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>

export type { ServiceResult } from '../lib/serviceUtils'

export interface PlaceMarkerInput {
  questId: string
  tier: ExplorerMarkerTier
  /** Optional, ≤120 chars, plain text, no URLs (validated client + server). */
  note?: string | null
  /** Optional existing photo URL (experience photo or uploaded completion photo). */
  photoUrl?: string | null
}

/**
 * Discovery keepsake with marker preview + quest title, as returned by the
 * get_my_keepsakes() RPC (raw explorer_markers rows are owner-only under
 * RLS; this RPC is the sanctioned read path and applies journey_visibility).
 */
export interface MarkerKeepsake {
  id: string
  marker_id: string
  quest_id: string
  discovered_at: string
  tier: ExplorerMarkerTier
  note: string | null
  marker_placed_at: string
  marker_status: string
  quest_title: string
  quest_slug: string
}

export const markerService = {
  /**
   * Progression + award configuration (single source of truth: the
   * explorer_marker_milestones table). Falls back to the mirrored defaults
   * if the table can't be read, so the UI never hardcodes thresholds.
   */
  async getMilestones(): Promise<ServiceResult<MarkerMilestone[]>> {
    const { data, error } = await supabase
      .from('explorer_marker_milestones')
      .select('*')
      .order('sort_order', { ascending: true })
      .returns<ExplorerMarkerMilestone[]>()

    if (error || !data || data.length === 0) {
      return { data: DEFAULT_MILESTONES, error: null }
    }
    return { data, error: null }
  },

  /**
   * Verified completion count for the current user (server-computed via the
   * auth.uid()-scoped RPC — the arbitrary-user variant is not executable by
   * clients, so one user can never read another's private count).
   */
  async getMyVerifiedCompletionCount(): Promise<ServiceResult<number>> {
    const { data, error } = await rpc('get_my_verified_completion_count')
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as number | null) ?? 0, error: null }
  },

  /**
   * Claim any newly qualified milestone awards. Idempotent and safe to call
   * on every sheet open — the database's UNIQUE (user_id, milestone_key)
   * makes double-claims impossible. Returns only NEW awards.
   */
  async claimMilestones(): Promise<ServiceResult<ExplorerMarkerAward[]>> {
    const { data, error } = await rpc('claim_explorer_milestones')
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as ExplorerMarkerAward[] | null) ?? [], error: null }
  },

  /** The user's full award ledger (auditable history). */
  async getMyAwards(): Promise<ServiceResult<ExplorerMarkerAward[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('explorer_marker_awards')
      .select('*')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false })
      .returns<ExplorerMarkerAward[]>()

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /** Server-calculated inventory (awarded − placed − consumed) per tier. */
  async getMyInventory(): Promise<ServiceResult<MarkerInventoryRow[]>> {
    const { data, error } = await rpc('get_my_marker_inventory')
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as MarkerInventoryRow[] | null) ?? [], error: null }
  },

  /** The user's own placed markers (all statuses — their complete record). */
  async getMyPlacedMarkers(): Promise<ServiceResult<ExplorerMarker[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('explorer_markers')
      .select('*')
      .eq('owner_user_id', user.id)
      .order('placed_at', { ascending: false })
      .returns<ExplorerMarker[]>()

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Place an earned marker at a completed experience. All rules (completion
   * required, inventory available, Legacy uniqueness, note limits) are
   * re-validated server-side — disabled buttons are UX, not security.
   */
  async placeMarker(input: PlaceMarkerInput): Promise<ServiceResult<ExplorerMarker>> {
    const { data, error } = await rpc('place_explorer_marker', {
      p_quest_id: input.questId,
      p_tier: input.tier,
      p_note: input.note?.trim() || null,
      p_photo_url: input.photoUrl || null,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: data as unknown as ExplorerMarker, error: null }
  },

  /**
   * Cancel a placement within its 24h grace window. The marker returns to
   * inventory; the record remains for the audit trail. After the window the
   * marker is permanent (server-enforced).
   */
  async cancelMarker(markerId: string): Promise<ServiceResult<ExplorerMarker>> {
    const { data, error } = await rpc('cancel_explorer_marker', {
      p_marker_id: markerId,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: data as unknown as ExplorerMarker, error: null }
  },

  /** Markers at an experience — privacy already applied by the database. */
  async getExperienceMarkers(
    questId: string,
  ): Promise<ServiceResult<ExperienceMarkerView[]>> {
    const { data, error } = await rpc('get_experience_markers', {
      p_quest_id: questId,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as ExperienceMarkerView[] | null) ?? [], error: null }
  },

  /**
   * Record a discovery ("Add to My Journey"). Eligibility — a completion of
   * the experience, or being within the experience radius — is verified by
   * the database. The marker is never removed for others; a keepsake is a
   * personal connection, not a taking.
   */
  async discoverMarker(
    markerId: string,
    position?: { lat: number; lng: number } | null,
  ): Promise<ServiceResult<ExplorerMarkerDiscovery>> {
    const { data, error } = await rpc('discover_explorer_marker', {
      p_marker_id: markerId,
      p_lat: position?.lat ?? null,
      p_lng: position?.lng ?? null,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: data as unknown as ExplorerMarkerDiscovery, error: null }
  },

  /** The user's keepsake collection (their discoveries, newest first). */
  async getMyKeepsakes(limit = 50): Promise<ServiceResult<MarkerKeepsake[]>> {
    const { data, error } = await rpc('get_my_keepsakes', { p_limit: limit })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as MarkerKeepsake[] | null) ?? [], error: null }
  },

  /** Report a marker for moderation review. */
  async reportMarker(markerId: string, reason: string): Promise<ServiceResult<null>> {
    const { error } = await rpc('report_explorer_marker', {
      p_marker_id: markerId,
      p_reason: reason,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },
}
