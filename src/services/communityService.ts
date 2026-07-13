/**
 * Community metrics + journey activity for the People sheet.
 *
 * Evidence only: every number comes from real database aggregates
 * (get_community_metrics / get_community_activity, migration 027). If a
 * metric can't be read it is omitted — never faked.
 *
 * Privacy: activity items carry a quest title, marker tier, and a DAY (never
 * a precise timestamp or location). Explorer names appear only when the
 * profile's journey_visibility is 'public' — enforced in the database, not here.
 */
import { supabase } from '../lib/supabase/client'

import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import type { CommunityMetrics, CommunityActivityItem } from '../lib/supabase/types'

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

export const communityService = {
  async getMetrics(): Promise<ServiceResult<CommunityMetrics>> {
    const { data, error } = await rpc('get_community_metrics')
    if (error) return { data: null, error: extractMessage(error) }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { data: null, error: 'No metrics available' }
    return { data: row as CommunityMetrics, error: null }
  },

  async getActivity(limit = 12): Promise<ServiceResult<CommunityActivityItem[]>> {
    const { data, error } = await rpc('get_community_activity', {
      p_limit: limit,
    })
    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data as CommunityActivityItem[] | null) ?? [], error: null }
  },
}
