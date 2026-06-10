import { supabase } from '../lib/supabase/client'
import type {
  DreamList,
  DreamListInsert,
  DreamListUpdate,
  DreamListStatus,
  ExperienceClass,
  DreamListItemWithQuest,
} from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ServiceResult } from '../lib/serviceUtils'

export interface GetMyDreamListOptions {
  status?: DreamListStatus
  experience_class?: ExperienceClass
  limit?: number
  offset?: number
}

export interface AddToDreamListOptions {
  status?: DreamListStatus
  priority?: number
  notes?: string
  target_date?: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const dreamListService = {
  /**
   * Get the current authenticated user's dream list items.
   * Supports filtering by status and experience_class (via join to quests).
   * Sorted by priority ASC, then created_at DESC.
   * Returns joined quest data (id, title, slug, experience_class, sq_score) when available.
   */
  async getMyDreamList(
    options: GetMyDreamListOptions = {}
  ): Promise<ServiceResult<DreamListItemWithQuest[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { status, experience_class, limit = 50, offset = 0 } = options

    const questFields = 'id,title,slug,experience_class,sq_score'
    const select = experience_class
      ? `*, quests!inner(${questFields})`
      : `*, quests(${questFields})`

    let query = supabase
      .from('dream_list')
      .select(select)
      .eq('user_id', user.id)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (experience_class) {
      query = query.eq('quests.experience_class', experience_class)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query.returns<
      Array<DreamListItemWithQuest>
    >()

    if (error) return { data: null, error: extractMessage(error) }

    return { data: data ?? [], error: null }
  },

  /**
   * Add a quest to the current user's dream list.
   * Defaults status to 'saved'.
   */
  async addToDreamList(
    questId: string,
    options: AddToDreamListOptions = {}
  ): Promise<ServiceResult<DreamList>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const insertPayload: DreamListInsert = {
      user_id: user.id,
      quest_id: questId,
      status: options.status ?? 'saved',
    }

    if (options.priority !== undefined) {
      insertPayload.priority = options.priority
    }
    if (options.notes !== undefined) {
      insertPayload.notes = options.notes
    }
    if (options.target_date !== undefined) {
      insertPayload.target_date = options.target_date
    }

    const { data, error } = await supabase
      .from('dream_list')
      .insert(insertPayload as any)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Update an existing dream list item owned by the current user.
   */
  async updateDreamListItem(
    id: string,
    updates: DreamListUpdate
  ): Promise<ServiceResult<DreamList>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const updatePayload = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('dream_list')
      .update(updatePayload as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Remove a dream list item owned by the current user.
   */
  async removeFromDreamList(id: string): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('dream_list')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Get the current user's dream list entry for a specific quest, or null if not present.
   */
  async getDreamListItemByQuestId(
    questId: string
  ): Promise<ServiceResult<DreamList>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('dream_list')
      .select('*')
      .eq('user_id', user.id)
      .eq('quest_id', questId)
      .single()

    if (error) {
      // PGRST116 = no rows found for .single()
      if ((error as { code?: string }).code === 'PGRST116') {
        return { data: null, error: null }
      }
      return { data: null, error: extractMessage(error) }
    }
    return { data, error: null }
  },

  /**
   * Mark a dream list item as completed (sets status and completed_at).
   */
  async markDreamListItemCompleted(id: string): Promise<ServiceResult<DreamList>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('dream_list')
      .update({
        status: 'completed' as DreamListStatus,
        completed_at: now,
        updated_at: now,
      } as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },
}
