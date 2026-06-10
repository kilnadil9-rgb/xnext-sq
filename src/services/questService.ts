import { supabase } from '../lib/supabase/client'
import type { Quest, ExperienceClass, QuestByIdResult, NearbyQuest } from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ServiceResult } from '../lib/serviceUtils'
export type { NearbyQuest } from '../lib/supabase/types'

export interface ListPublishedQuestsOptions {
  experience_class?: ExperienceClass
  city?: string
  country_code?: string
  tags?: string[]
  limit?: number
  offset?: number
}

export interface SearchQuestsOptions {
  experience_class?: ExperienceClass
  limit?: number
  offset?: number
}

export interface GetQuestsByClassOptions {
  limit?: number
  offset?: number
}

export interface GetNearbyQuestsOptions {
  limit?: number
  offset?: number
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const questService = {
  /**
   * List published quests with optional filters.
   * Always filters status = 'published'.
   * Sorted by sq_score DESC, then published_at DESC.
   */
  async listPublishedQuests(
    options: ListPublishedQuestsOptions = {}
  ): Promise<ServiceResult<Quest[]>> {
    let query = supabase
      .from('quests')
      .select('*')
      .eq('status', 'published')
      .order('sq_score', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })

    const { experience_class, city, country_code, tags, limit = 50, offset = 0 } = options

    if (experience_class) {
      query = query.eq('experience_class', experience_class)
    }
    if (city) {
      query = query.eq('city', city)
    }
    if (country_code) {
      query = query.eq('country_code', country_code)
    }
    if (tags && tags.length > 0) {
      query = query.contains('tags', tags)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Fetch a single quest by ID.
   * Returns dedicated QuestByIdResult shape per original spec (quest + scoring_factors + availability_windows).
   * Note: scoring_factors and availability_windows are not columns on the quests table (per review);
   * they are returned as null here. Source them via future separate mechanism if needed.
   * Returns data with quest: null if not found (no top-level error).
   */
  async getQuestById(id: string): Promise<ServiceResult<QuestByIdResult>> {
    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      // PostgREST returns PGRST116 when .single() finds 0 rows
      if ((error as { code?: string }).code === 'PGRST116') {
        return {
          data: { quest: null, scoring_factors: null, availability_windows: null },
          error: null,
        }
      }
      return { data: null, error: extractMessage(error) }
    }
    return {
      data: {
        quest: data,
        scoring_factors: null,
        availability_windows: null,
      },
      error: null,
    }
  },

  /**
   * Full-text style search across title, description, city, and tags (via text cast).
   * Only published quests.
   * Optional experience_class filter.
   */
  async searchQuests(
    query: string,
    options: SearchQuestsOptions = {}
  ): Promise<ServiceResult<Quest[]>> {
    const q = (query ?? '').trim()
    if (q.length === 0) {
      return { data: [], error: null }
    }

    const { experience_class, limit = 20, offset = 0 } = options

    // Escape special chars for ilike
    const escaped = q.replace(/[%_]/g, '\\$&')

    let dbQuery = supabase
      .from('quests')
      .select('*')
      .eq('status', 'published')
      .or(
        `title.ilike.%${escaped}%,description.ilike.%${escaped}%,city.ilike.%${escaped}%,tags::text.ilike.%${escaped}%`
      )

    if (experience_class) {
      dbQuery = dbQuery.eq('experience_class', experience_class)
    }

    dbQuery = dbQuery
      .order('sq_score', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    const { data, error } = await dbQuery

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Find quests near a lat/lon within radiusKm using the find_quests_nearby RPC.
   *
   * The RPC (see 014_find_quests_nearby_rpc.sql) handles:
   *   - ST_DWithin for radius filter (in meters)
   *   - ST_Distance for distance_km (in km)
   *   - Only published quests with non-null location_point
   *   - Ordering by distance ASC, then sq_score DESC nulls last
   *   - Pagination via limit/offset
   *
   * No client-side distance math or filtering is performed.
   * Respects explicit published-only filter in the SQL (RLS compatible).
   */
  async getNearbyQuests(
    latitude: number,
    longitude: number,
    radiusKm: number,
    options: GetNearbyQuestsOptions = {}
  ): Promise<ServiceResult<NearbyQuest[]>> {
    const { limit = 50, offset = 0 } = options

    const { data, error } = await (supabase.rpc as any)('find_quests_nearby', {
      p_lat: latitude,
      p_lng: longitude,
      p_radius_km: radiusKm,
      p_limit: limit,
      p_offset: offset,
    })

    if (error) return { data: null, error: extractMessage(error) }
    return { data: (data ?? []) as NearbyQuest[], error: null }
  },

  /**
   * Return published quests for the given experience class.
   * Sorted by sq_score DESC, published_at DESC.
   * Supports pagination via options.
   */
  async getQuestsByClass(
    experienceClass: ExperienceClass,
    options: GetQuestsByClassOptions = {}
  ): Promise<ServiceResult<Quest[]>> {
    const { limit = 50, offset = 0 } = options

    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .eq('status', 'published')
      .eq('experience_class', experienceClass)
      .order('sq_score', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },
}
