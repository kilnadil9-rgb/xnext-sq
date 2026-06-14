import { supabase } from '../lib/supabase/client'
import type {
  QuestScoringFactor,
  QuestScoringFactorInsert,
  ExperienceClass,
  Quest,
} from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GetHighSQQuestsOptions {
  minScore?: number
  experience_class?: ExperienceClass
  city?: string
  limit?: number
  offset?: number
}

export interface SQScoreBreakdown {
  factors: QuestScoringFactor | null
  weightedContributions: Record<string, number>
  total: number
  computedAt: string | null
}

// Shared weights constant (0–1 multipliers)
const SCORE_WEIGHTS = {
  uniqueness_score: 0.18,
  scarcity_score: 0.16,
  time_sensitivity_score: 0.16,
  discovery_likelihood: 0.12,
  community_signal: 0.10,
  seasonal_factor: 0.08,
  weather_factor: 0.07,
  distance_factor: 0.07,
  cooldown_factor: 0.06,
} as const;

// Factors stored as 0–100 (must be normalized); factors stored as 0–1 (use as-is)
const HUNDRED_SCALE_FACTORS = [
  'uniqueness_score',
  'scarcity_score',
  'time_sensitivity_score',
  'discovery_likelihood',
  'community_signal',
] as const;

// ─── Service ─────────────────────────────────────────────────────────────────

export const sqScoreService = {
  /**
   * Get scoring factors for a quest, or null if none.
   *
   * Requires server-side execution or future Edge Function access because
   * quest_scoring_factors is protected by RLS.
   */
  async getQuestScoringFactors(
    questId: string
  ): Promise<ServiceResult<QuestScoringFactor>> {
    const { data, error } = await supabase
      .from('quest_scoring_factors')
      .select('*')
      .eq('quest_id', questId)
      .single()

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        return { data: null, error: null }
      }
      return { data: null, error: extractMessage(error) }
    }
    return { data, error: null }
  },

  /**
   * Upsert scoring factors for a quest.
   * Always sets computed_at to now().
   *
   * Requires server-side execution or future Edge Function access because
   * quest_scoring_factors is protected by RLS.
   */
  async upsertQuestScoringFactors(
    questId: string,
    factors: Omit<QuestScoringFactorInsert, 'quest_id' | 'computed_at'>
  ): Promise<ServiceResult<QuestScoringFactor>> {
    const now = new Date().toISOString()

    const payload = {
      quest_id: questId,
      computed_at: now,
      ...factors,
    }

    const { data, error } = await supabase
      .from('quest_scoring_factors')
      .upsert(payload as any, { onConflict: 'quest_id' })
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Pure function to calculate SQ score (0-100) from factors.
   * Normalizes 0–100 factors to 0–1; 0–1 factors used as-is.
   * Applies shared weights, clamps result to 0–100.
   */
  calculateSQScore(factors: Partial<QuestScoringFactor>): number {
    let total = 0

    for (const [key, weight] of Object.entries(SCORE_WEIGHTS) as [keyof typeof SCORE_WEIGHTS, number][]) {
      const raw = factors[key]
      let value = raw ?? 0
      // Only normalize 0–100 schema columns
      if ((HUNDRED_SCALE_FACTORS as readonly string[]).includes(key)) {
        value = value / 100
      }
      const normalized = Math.max(0, Math.min(1, value))
      total += normalized * weight
    }

    // Scale to 0-100, round to int, clamp
    const score = Math.round(total * 100)
    return Math.max(0, Math.min(100, score))
  },

  /**
   * Update the quest's sq_score and sq_score_computed_at based on its factors.
   * Returns the new score.
   *
   * Requires server-side execution or future Edge Function access because
   * quest_scoring_factors is protected by RLS.
   */
  async updateQuestSQScore(questId: string): Promise<ServiceResult<number>> {
    const { data: factors, error: factorsError } = await this.getQuestScoringFactors(questId)
    if (factorsError) return { data: null, error: factorsError }
    if (!factors) {
      return { data: null, error: 'No scoring factors found for quest' }
    }

    const score = this.calculateSQScore(factors)
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('quests')
      .update({
        sq_score: score,
        sq_score_computed_at: now,
      } as never)
      .eq('id', questId)
      .select('sq_score')
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    const result = data as { sq_score: number | null } | null
    return { data: result?.sq_score ?? score, error: null }
  },

  /**
   * Get breakdown for a quest's SQ score.
   *
   * Requires server-side execution or future Edge Function access because
   * quest_scoring_factors is protected by RLS.
   */
  async getQuestSQScoreBreakdown(questId: string): Promise<ServiceResult<SQScoreBreakdown>> {
    const { data: factors, error: factorsError } = await this.getQuestScoringFactors(questId)
    if (factorsError) return { data: null, error: factorsError }

    const contributions: Record<string, number> = {}
    let total = 0

    if (factors) {
      for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
        const raw = (factors as any)[key] ?? 0
        let value = raw
        // Only normalize 0–100 schema columns
        if ((HUNDRED_SCALE_FACTORS as readonly string[]).includes(key)) {
          value = value / 100
        }
        const normalized = Math.max(0, Math.min(1, value))
        const contrib = Math.round(normalized * weight * 100)
        contributions[key] = contrib
        total += normalized * weight
      }
    }

    const score = Math.round(total * 100)

    return {
      data: {
        factors: factors ?? null,
        weightedContributions: contributions,
        total: Math.max(0, Math.min(100, score)),
        computedAt: factors?.computed_at ?? null,
      },
      error: null,
    }
  },

  /**
   * List published high-SQ quests (sq_score >= minScore).
   * Supports additional filters. Sorted by sq_score DESC then published_at DESC.
   */
  async getHighSQQuests(
    options: GetHighSQQuestsOptions = {}
  ): Promise<ServiceResult<Quest[]>> {
    const { minScore = 70, experience_class, city, limit = 50, offset = 0 } = options

    let query = supabase
      .from('quests')
      .select('*')
      .eq('status', 'published')
      .gte('sq_score', minScore)
      .order('sq_score', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })

    if (experience_class) {
      query = query.eq('experience_class', experience_class)
    }
    if (city) {
      query = query.eq('city', city)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },
}
