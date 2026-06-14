import { supabase } from '../lib/supabase/client'
import type {
  QuestChain,
  QuestChainStep,
  QuestChainInsert,
  QuestChainStepInsert,
  QuestChainUpdate,
  QuestChainStepUpdate,
  ChainUnlockCondition,
  QuestChainWithSteps,
} from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ServiceResult } from '../lib/serviceUtils'

export interface ListPublicQuestChainsOptions {
  organization_id?: string
  is_platform_chain?: boolean
  limit?: number
  offset?: number
}

export interface AddQuestToChainOptions {
  step_order?: number
  unlock_condition?: ChainUnlockCondition
  unlock_after_days?: number
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const questChainService = {
  /**
   * List public quest chains with optional filters.
   * Sorted by created_at DESC.
   */
  async listPublicQuestChains(
    options: ListPublicQuestChainsOptions = {}
  ): Promise<ServiceResult<QuestChain[]>> {
    const { organization_id, is_platform_chain, limit = 50, offset = 0 } = options

    let query = supabase
      .from('quest_chains')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    if (organization_id) {
      query = query.eq('organization_id', organization_id)
    }
    if (is_platform_chain !== undefined) {
      query = query.eq('is_platform_chain', is_platform_chain)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Get one public quest chain by id, or null.
   * Includes associated quest_chain_steps if present (via join).
   */
  async getQuestChainById(id: string): Promise<ServiceResult<QuestChainWithSteps | null>> {
    const { data, error } = await supabase
      .from('quest_chains')
      .select('*, quest_chain_steps(*)')
      .eq('id', id)
      .eq('is_public', true)
      .single()
      .returns<QuestChainWithSteps>()

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        return { data: null, error: null }
      }
      return { data: null, error: extractMessage(error) }
    }
    return { data, error: null }
  },

  /**
   * Get quest_chain_steps for a chain.
   * Sorted by step_order ASC.
   */
  async getQuestChainSteps(chainId: string): Promise<ServiceResult<QuestChainStep[]>> {
    const { data, error } = await supabase
      .from('quest_chain_steps')
      .select('*')
      .eq('chain_id', chainId)
      .order('step_order', { ascending: true })

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Create a quest chain. Sets created_by from current user.
   */
  async createQuestChain(
    input: Omit<QuestChainInsert, 'created_by'>
  ): Promise<ServiceResult<QuestChain>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const payload: QuestChainInsert = {
      ...input,
      created_by: user.id,
    }

    const { data, error } = await supabase
      .from('quest_chains')
      .insert(payload as any)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Update a quest chain. Enforces created_by = current user.
   */
  async updateQuestChain(
    id: string,
    updates: QuestChainUpdate
  ): Promise<ServiceResult<QuestChain>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const updatePayload = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('quest_chains')
      .update(updatePayload as never)
      .eq('id', id)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Delete a quest chain owned by current user.
   */
  async deleteQuestChain(id: string): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('quest_chains')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Add a quest as a step in a chain.
   * Verifies current user owns the parent chain before writing.
   * If step_order not provided, auto-assigns next available order.
   */
  async addQuestToChain(
    chainId: string,
    questId: string,
    options: AddQuestToChainOptions = {}
  ): Promise<ServiceResult<QuestChainStep>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Verify ownership of parent chain
    const { data: chain, error: chainError } = await (supabase
      .from('quest_chains') as any)
      .select('created_by')
      .eq('id', chainId)
      .single()

    if (chainError || !chain || (chain as any).created_by !== user.id) {
      return { data: null, error: 'Chain not found or unauthorized' }
    }

    // Determine step_order: if not provided, compute max + 1
    let stepOrder: number
    if (options.step_order !== undefined) {
      stepOrder = options.step_order
    } else {
      const { data: maxStep, error: maxError } = await (supabase
        .from('quest_chain_steps') as any)
        .select('step_order')
        .eq('chain_id', chainId)
        .order('step_order', { ascending: false })
        .limit(1)
        .single()

      if (maxError) {
        if ((maxError as { code?: string }).code === 'PGRST116') {
          stepOrder = 1
        } else {
          return { data: null, error: extractMessage(maxError) }
        }
      } else {
        stepOrder = ((maxStep as any)?.step_order || 0) + 1
      }
    }

    const payload: QuestChainStepInsert = {
      chain_id: chainId,
      quest_id: questId,
      step_order: stepOrder,
      unlock_condition: options.unlock_condition ?? 'previous_completed',
      unlock_after_days: options.unlock_after_days ?? null,
    }

    const { data, error } = await supabase
      .from('quest_chain_steps')
      .insert(payload as any)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Update a chain step.
   * Verifies current user owns the parent chain before writing.
   */
  async updateQuestChainStep(
    id: string,
    updates: QuestChainStepUpdate
  ): Promise<ServiceResult<QuestChainStep>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Fetch step to get chain_id
    const { data: step, error: stepError } = await (supabase
      .from('quest_chain_steps') as any)
      .select('chain_id')
      .eq('id', id)
      .single()

    if (stepError || !step) {
      return { data: null, error: 'Not found or unauthorized' }
    }

    // Verify ownership of parent chain
    const { data: chain, error: chainError } = await (supabase
      .from('quest_chains') as any)
      .select('created_by')
      .eq('id', (step as any).chain_id)
      .single()

    if (chainError || !chain || (chain as any).created_by !== user.id) {
      return { data: null, error: 'Not found or unauthorized' }
    }

    const { data, error } = await supabase
      .from('quest_chain_steps')
      .update(updates as never)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Remove a chain step.
   * Verifies current user owns the parent chain before writing.
   */
  async removeQuestChainStep(id: string): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Fetch step to get chain_id
    const { data: step, error: stepError } = await (supabase
      .from('quest_chain_steps') as any)
      .select('chain_id')
      .eq('id', id)
      .single()

    if (stepError || !step) {
      return { data: null, error: 'Not found or unauthorized' }
    }

    // Verify ownership of parent chain
    const { data: chain, error: chainError } = await (supabase
      .from('quest_chains') as any)
      .select('created_by')
      .eq('id', (step as any).chain_id)
      .single()

    if (chainError || !chain || (chain as any).created_by !== user.id) {
      return { data: null, error: 'Not found or unauthorized' }
    }

    const { error } = await supabase
      .from('quest_chain_steps')
      .delete()
      .eq('id', id)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },
}
