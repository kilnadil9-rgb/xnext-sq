import { supabase } from '../lib/supabase/client'
import type {
  ExperienceClass,
  PulseFrequency,
  UserQuestPreference,
} from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ServiceResult } from '../lib/serviceUtils'

export interface SavePreferencesInput {
  preferred_classes?: ExperienceClass[]
  preferred_tags?: string[]
  max_distance_km?: number
  pulse_enabled?: boolean
  pulse_min_sq_score?: number
  pulse_frequency?: PulseFrequency
}

/** Schema defaults (user_quest_preferences) for users with no row yet. */
export const DEFAULT_PREFERENCES: SavePreferencesInput = {
  preferred_classes: [],
  preferred_tags: [],
  max_distance_km: 50,
  pulse_enabled: true,
  pulse_min_sq_score: 70,
  pulse_frequency: 'daily',
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const userQuestPreferencesService = {
  /**
   * The current user's preferences, or null when none saved yet
   * (callers should fall back to DEFAULT_PREFERENCES).
   */
  async getMyPreferences(): Promise<ServiceResult<UserQuestPreference>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('user_quest_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? null, error: null }
  },

  /**
   * Create or update the current user's preferences (upsert on user_id PK).
   * Only the provided fields are written; the rest keep schema defaults
   * or existing values.
   */
  async saveMyPreferences(
    input: SavePreferencesInput
  ): Promise<ServiceResult<UserQuestPreference>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const payload = {
      user_id: user.id,
      ...input,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('user_quest_preferences')
      .upsert(payload as never, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },
}
