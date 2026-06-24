import { supabase } from '../lib/supabase/client'
import type { Quest, ExperienceClass, QuestStatus, QuestByIdResult, NearbyQuest } from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import { toEwktPoint, questSlug } from '../lib/geo'

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

export interface GetMyQuestsOptions {
  status?: QuestStatus
  limit?: number
  offset?: number
}

export interface QuestLocationInput {
  lat: number
  lng: number
}

export interface CreateQuestInput {
  title: string
  experience_class: ExperienceClass
  location: QuestLocationInput
  description?: string | null
  location_name?: string | null
  city?: string | null
  country_code?: string | null
  tags?: string[]
  external_url?: string | null
  /** Optional media (photo URLs etc). Saved to media_urls column. */
  media_urls?: string[]
  /** Allow discover flow etc to start as pending_review instead of draft. */
  status?: QuestStatus
  /** Extra provenance/details merged into the metadata jsonb column. */
  metadata?: Record<string, unknown>
  // ── Seasonal (Phase 1.8) ──
  /** 'spring' | 'summer' | 'fall' | 'winter' UI labels. */
  season_tags?: string[]
  /** Canonical 1-12 months the experience is in season. */
  active_months?: number[]
  /** ISO date window for one-off / date-based experiences. */
  start_date?: string | null
  end_date?: string | null
  /** Relevant year-round (default true when no seasonal data). */
  is_evergreen?: boolean
  /** Admin curation knob (defaults 0). */
  priority_boost?: number
  /** Optional separate parking/drive-to coordinate. */
  parking?: QuestLocationInput | null
}

export interface UpdateQuestInput {
  title?: string
  experience_class?: ExperienceClass
  location?: QuestLocationInput
  description?: string | null
  location_name?: string | null
  city?: string | null
  country_code?: string | null
  tags?: string[]
  external_url?: string | null
  // ── Seasonal (Phase 1.8) ──
  season_tags?: string[]
  active_months?: number[]
  start_date?: string | null
  end_date?: string | null
  is_evergreen?: boolean
  priority_boost?: number
  /** Pass a coordinate to set, null to clear, omit to leave unchanged. */
  parking?: QuestLocationInput | null
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

  // ─── Creator flow (RLS: "Users can manage their own quests") ──────────────

  /**
   * List the current user's own quests across all statuses.
   * Sorted by updated_at DESC. Optional status filter.
   */
  async getMyQuests(
    options: GetMyQuestsOptions = {}
  ): Promise<ServiceResult<Quest[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { status, limit = 50, offset = 0 } = options

    let query = supabase
      .from('quests')
      .select('*')
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query.range(offset, offset + limit - 1)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Fetch one of the current user's own quests (any status), for editing.
   */
  async getMyQuestById(id: string): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .eq('id', id)
      .eq('created_by', user.id)
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Create a quest as a draft owned by the current user.
   * location is written as EWKT; PostGIS casts it to geography(Point, 4326).
   */
  async createQuest(input: CreateQuestInput): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const insertPayload = {
      organization_id: null,
      created_by: user.id,
      slug: questSlug(input.title),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      experience_class: input.experience_class,
      location_name: input.location_name?.trim() || null,
      location_point: toEwktPoint(input.location),
      location_radius_m: null,
      city: input.city?.trim() || null,
      country_code: input.country_code?.trim().toUpperCase() || null,
      tags: input.tags ?? [],
      is_sponsored: false,
      sponsor_id: null,
      media_urls: input.media_urls ?? [],
      external_url: input.external_url?.trim() || null,
      status: (input.status ?? 'draft') as QuestStatus,
      expires_at: null,
      metadata: input.metadata ?? {},
      // Seasonal (Phase 1.8): default to evergreen so unclassified experiences
      // behave exactly as before. Admin can refine later in review.
      season_tags: input.season_tags ?? [],
      active_months: input.active_months ?? [],
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      is_evergreen: input.is_evergreen ?? true,
      priority_boost: input.priority_boost ?? 0,
      parking_point: input.parking ? toEwktPoint(input.parking) : null,
    }

    const { data, error } = await supabase
      .from('quests')
      .insert(insertPayload as never)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Update basic fields on one of the current user's own quests.
   */
  async updateQuest(
    id: string,
    updates: UpdateQuestInput
  ): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { location, parking, ...rest } = updates
    const updatePayload: Record<string, unknown> = {
      ...rest,
      updated_at: new Date().toISOString(),
    }
    if (location) {
      updatePayload.location_point = toEwktPoint(location)
    }
    // parking: coordinate → set, null → clear, undefined → leave unchanged.
    if (parking !== undefined) {
      updatePayload.parking_point = parking ? toEwktPoint(parking) : null
    }

    const { data, error } = await supabase
      .from('quests')
      .update(updatePayload as never)
      .eq('id', id)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Transition a quest's lifecycle status (publish / unpublish / archive).
   * Publishing stamps published_at so it surfaces in nearby/feed ordering.
   */
  async setQuestStatus(
    id: string,
    status: QuestStatus
  ): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'published') {
      updatePayload.published_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('quests')
      .update(updatePayload as never)
      .eq('id', id)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },
}
