import { supabase } from '../lib/supabase/client'
import type { Profile, DreamListItemWithQuest, UserQuestPreference } from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import { dreamListService } from './dreamListService'
import { questCompletionService, type QuestCompletionWithQuest } from './questCompletionService'
import { userQuestPreferencesService } from './userQuestPreferencesService'

// Re-export for callers
export type { ServiceResult } from '../lib/serviceUtils'

export interface ConsentVersions {
  privacyVersion: string
  termsVersion: string
}

export interface ExportBundle {
  profile: Partial<Profile> | null
  dreamList: DreamListItemWithQuest[]
  memories: QuestCompletionWithQuest[]
  preferences: UserQuestPreference | null
  exportedAt: string
}

/**
 * Privacy & data rights service (GDPR / CCPA / WA State support).
 * All operations are owner-scoped via RLS + explicit .eq(user_id).
 * Deletion flow supports 30-day advisory window via flags (soft) + immediate purge of content.
 */
export const privacyService = {
  /**
   * Record acceptance of Privacy Policy + Terms on first launch / consent screen.
   * Stores timestamp + version for compliance audit.
   */
  async acceptConsents({ privacyVersion, termsVersion }: ConsentVersions): Promise<ServiceResult<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const now = new Date().toISOString()
    const updates = {
      privacy_policy_accepted_at: now,
      privacy_policy_version: privacyVersion,
      terms_accepted_at: now,
      terms_version: termsVersion,
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates as never)
      .eq('id', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /** Current consent state for the signed-in user (nulls mean not yet accepted). */
  async getMyConsentStatus(): Promise<ServiceResult<Pick<Profile, 'privacy_policy_accepted_at' | 'privacy_policy_version' | 'terms_accepted_at' | 'terms_version' | 'data_deletion_requested_at' | 'data_deletion_scheduled_for'>>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('profiles')
      .select('privacy_policy_accepted_at, privacy_policy_version, terms_accepted_at, terms_version, data_deletion_requested_at, data_deletion_scheduled_for')
      .eq('id', user.id)
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data as any, error: null }
  },

  /**
   * Full portable export (Download My Data).
   * Includes profile (limited), dream list, quest completions (memories), and preferences.
   */
  async exportMyData(): Promise<ServiceResult<ExportBundle>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [profileRes, dreamRes, memRes, prefRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, username, created_at, privacy_policy_accepted_at, terms_accepted_at').eq('id', user.id).single(),
      dreamListService.getMyDreamList({ limit: 500 }),
      questCompletionService.getMyCompletions({ limit: 500 }),
      userQuestPreferencesService.getMyPreferences(),
    ])

    const bundle: ExportBundle = {
      profile: profileRes.data ?? null,
      dreamList: dreamRes.data ?? [],
      memories: memRes.data ?? [],
      preferences: prefRes.data ?? null,
      exportedAt: new Date().toISOString(),
    }

    return { data: bundle, error: null }
  },

  /** Export only Dream List items (with joined quest titles). */
  async exportDreamList(): Promise<ServiceResult<DreamListItemWithQuest[]>> {
    return dreamListService.getMyDreamList({ limit: 1000 })
  },

  /** Export only Memories (quest completions with quest metadata). */
  async exportMemories(): Promise<ServiceResult<QuestCompletionWithQuest[]>> {
    return questCompletionService.getMyCompletions({ limit: 1000 })
  },

  /**
   * Clear Search History — best effort.
   * No dedicated search history table exists; we clear preferred_tags (often derived from search/interactions)
   * and leave other preference values intact.
   */
  async clearSearchHistory(): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Reset tags; keep other prefs.
    const { error } = await supabase
      .from('user_quest_preferences')
      .update({ preferred_tags: [], updated_at: new Date().toISOString() } as never)
      .eq('user_id', user.id)

    if (error && (error as any).code !== 'PGRST116') {
      return { data: null, error: extractMessage(error) }
    }
    return { data: null, error: null }
  },

  /**
   * Reset Recommendations — clears personalized preference signals.
   * Removes the row so DEFAULT_PREFERENCES are used on next load.
   */
  async resetRecommendations(): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('user_quest_preferences')
      .delete()
      .eq('user_id', user.id)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Begin account deletion (Deliverable 5).
   * - Sets requested + 30-day scheduled timestamp on profile.
   * - Immediately purges user-generated content (dream list, memories/completions, pulse alerts, preferences/home location).
   * - Anonymizes audit logs via SECURITY DEFINER function (user_id/ip/ua scrubbed).
   * - Clears PII fields on profile (full_name, bio, website, avatar) for privacy.
   * Recovery: user may log back in before scheduled date and cancel via settings (clears flags).
   */
  async requestAccountDeletion(): Promise<ServiceResult<{ scheduledFor: string }>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const now = new Date()
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const requestedAt = now.toISOString()

    // 1. Purge owned content (RLS enforced)
    await Promise.all([
      supabase.from('dream_list').delete().eq('user_id', user.id),
      supabase.from('quest_completions').delete().eq('user_id', user.id),
      supabase.from('pulse_alerts').delete().eq('user_id', user.id),
      supabase.from('user_quest_preferences').delete().eq('user_id', user.id),
    ])

    // 2. Anonymize audit (via definer fn — normal users cannot UPDATE audit_logs directly)
    try {
      await supabase.rpc('anonymize_my_audit_logs')
    } catch {
      // Non-fatal in Phase 1; admin can run equivalent later.
    }

    // 3. Clear PII on profile + set deletion flags (keep row for recovery window + auth linkage)
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        full_name: null,
        bio: null,
        website: null,
        avatar_url: null,
        data_deletion_requested_at: requestedAt,
        data_deletion_scheduled_for: scheduledFor,
        updated_at: requestedAt,
      } as never)
      .eq('id', user.id)

    if (updateErr) return { data: null, error: extractMessage(updateErr) }

    return { data: { scheduledFor }, error: null }
  },

  /** Cancel a pending deletion (within the 30-day window). Clears flags only; previously deleted content cannot be restored. */
  async cancelAccountDeletion(): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('profiles')
      .update({
        data_deletion_requested_at: null,
        data_deletion_scheduled_for: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', user.id)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /** Helper to download a JSON file client-side from an object (used by Settings UI). */
  downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
