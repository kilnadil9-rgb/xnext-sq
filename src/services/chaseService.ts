/**
 * The Chase service — client path to the discovery economy (migration 029).
 *
 * All reads/writes go through SECURITY DEFINER RPCs:
 *  - get_chase_feed: nearby marker TEASERS. The database never returns
 *    note/photo/owner here — "Reward: Unknown" is enforced server-side.
 *  - signal_explorer_marker: usefulness signals, discoverers only.
 *  - get_my_explorer_impact: real-world influence, no vanity metrics.
 *
 * Unlocking itself stays markerService.discoverMarker (027) — proximity or
 * completion verified in the database, never trusted from the client.
 */
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import type { MarkerSignalKind } from '../lib/discoveryCommunities'
import type { LatLng } from '../components/map/types'

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>

export type { ServiceResult } from '../lib/serviceUtils'

/** One chase-feed teaser. Content is withheld by the database until unlock. */
export interface ChaseTeaser {
  marker_id: string
  marker_type: string
  community: string | null
  tier: string
  quest_id: string
  quest_title: string
  lat: number
  lng: number
  distance_km: number
  placed_at: string
  unlock_count: number
  unlocks_today: number
  signal_count: number
  seasonal_active: boolean
  verified_location: boolean
  discovered_by_me: boolean
  is_mine: boolean
}

export interface ExplorerImpact {
  markers_placed: number
  explorers_reached: number
  total_unlocks: number
  unlocks_today: number
  unlocks_this_week: number
  signals_received: Record<string, number>
  verified_locations_touched: number
}

export const chaseService = {
  /** Nearby hidden drops (teasers only — the reward stays unknown). */
  async getFeed(
    center: LatLng,
    radiusKm = 40,
    limit = 60,
  ): Promise<ServiceResult<ChaseTeaser[]>> {
    const { data, error } = await rpc('get_chase_feed', {
      p_lat: center.lat,
      p_lng: center.lng,
      p_radius_km: radiusKm,
      p_limit: limit,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as ChaseTeaser[] | null) ?? [], error: null }
  },

  /** Usefulness signal — the database verifies the caller unlocked it. */
  async signalMarker(
    markerId: string,
    signal: MarkerSignalKind,
  ): Promise<ServiceResult<null>> {
    const { error } = await rpc('signal_explorer_marker', {
      p_marker_id: markerId,
      p_signal: signal,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /** "Because of your discoveries…" — every number is a database aggregate. */
  async getMyImpact(): Promise<ServiceResult<ExplorerImpact>> {
    const { data, error } = await rpc('get_my_explorer_impact')
    if (error) return { data: null, error: extractMessage(error) }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { data: null, error: 'No impact data available' }
    return { data: row as ExplorerImpact, error: null }
  },
}
