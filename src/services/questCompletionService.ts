import { supabase } from '../lib/supabase/client'
import type { QuestCompletion, ExperienceClass, ExplorerTags } from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import { EXPLORER_NOTE_MAX_WORDS, explorerNoteWordCount } from '../lib/trust'
import { dreamListService } from './dreamListService'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ServiceResult } from '../lib/serviceUtils'

export interface CompleteQuestOptions {
  story?: string | null
  isPublic?: boolean
  /** SQ score at the moment of completion (pass quest.sq_score if at hand) */
  sqScoreAtCompletion?: number | null
}

export interface GetMyCompletionsOptions {
  limit?: number
  offset?: number
}

// ── Explorer Notes (migration 026) ───────────────────────────────────────────
// Pure helpers live in lib/trust (unit-testable without the Supabase client);
// re-exported here so existing imports keep working unchanged.
export { EXPLORER_NOTE_MAX_WORDS, explorerNoteWordCount } from '../lib/trust'

export interface ExplorerNoteInput {
  /** One short tip, max 9 words. Empty/omitted = tags only. */
  note?: string | null
  tags?: ExplorerTags
}

/** Completion row joined with preview fields from the quest. */
export interface QuestCompletionWithQuest extends QuestCompletion {
  quests: {
    id: string
    title: string
    slug: string
    experience_class: ExperienceClass
    sq_score: number | null
    city: string | null
    /** Community Intelligence inputs (The Chase). */
    tags?: string[] | null
    description?: string | null
  } | null
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const questCompletionService = {
  /**
   * Record a quest completion for the current user.
   * If the quest is on the user's dream list, the dream list item is
   * linked and marked completed as well (best-effort; completion wins).
   */
  async completeQuest(
    questId: string,
    options: CompleteQuestOptions = {}
  ): Promise<ServiceResult<QuestCompletion>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Idempotency: never double-record the same quest.
    const existing = await this.getCompletionByQuestId(questId)
    if (existing.data) return { data: existing.data, error: null }

    // Link the dream list item if one exists (non-fatal lookup).
    const dreamItem = await dreamListService.getDreamListItemByQuestId(questId)
    const dreamListId = dreamItem.data?.id ?? null

    const insertPayload = {
      user_id: user.id,
      quest_id: questId,
      dream_list_id: dreamListId,
      completed_at: new Date().toISOString(),
      story: options.story?.trim() || null,
      media_urls: [],
      is_public: options.isPublic ?? false,
      sq_score_at_completion: options.sqScoreAtCompletion ?? null,
    }

    const { data, error } = await supabase
      .from('quest_completions')
      .insert(insertPayload as never)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }

    // Best-effort dream list sync; ignore failure (completion is recorded).
    if (dreamListId) {
      void dreamListService.markDreamListItemCompleted(dreamListId)
    }

    return { data, error: null }
  },

  /**
   * Attach an Explorer Note (one short tip + one-tap tags) to a completion
   * the current user owns. Max 9 words — this is Experience Graph input,
   * not a review. No-op error when both note and tags are empty.
   */
  async addExplorerNote(
    completionId: string,
    input: ExplorerNoteInput,
  ): Promise<ServiceResult<QuestCompletion>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const note = input.note?.trim() || null
    const tags = input.tags ?? {}
    const hasTags = Object.keys(tags).length > 0
    if (!note && !hasTags) {
      return { data: null, error: 'Add a short note or tap a tag first.' }
    }
    if (note && explorerNoteWordCount(note) > EXPLORER_NOTE_MAX_WORDS) {
      return {
        data: null,
        error: `Keep it to ${EXPLORER_NOTE_MAX_WORDS} words — one observation, high signal.`,
      }
    }

    const { data, error } = await supabase
      .from('quest_completions')
      .update({ explorer_note: note, explorer_tags: tags } as never)
      .eq('id', completionId)
      .eq('user_id', user.id) // belt + suspenders on top of owner RLS
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * The current user's completion for a quest, or null if not completed.
   */
  async getCompletionByQuestId(
    questId: string
  ): Promise<ServiceResult<QuestCompletion>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('quest_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('quest_id', questId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? null, error: null }
  },

  /**
   * The current user's completed quests, newest first, with quest preview
   * fields joined in.
   */
  async getMyCompletions(
    options: GetMyCompletionsOptions = {}
  ): Promise<ServiceResult<QuestCompletionWithQuest[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { limit = 50, offset = 0 } = options

    const { data, error } = await supabase
      .from('quest_completions')
      .select('*, quests(id,title,slug,experience_class,sq_score,city,tags,description)')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .returns<QuestCompletionWithQuest[]>()

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },
}
