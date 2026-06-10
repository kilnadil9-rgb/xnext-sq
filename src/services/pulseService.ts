import { supabase } from '../lib/supabase/client'
import type { PulseAlert, PulseTrigger } from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ServiceResult } from '../lib/serviceUtils'

export interface GetMyPulseAlertsOptions {
  unreadOnly?: boolean
  dismissedOnly?: boolean
  activeOnly?: boolean
  triggered_by?: PulseTrigger
  limit?: number
  offset?: number
}

export interface GetActivePulseAlertsOptions {
  limit?: number
  offset?: number
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const pulseService = {
  /**
   * Get current user's pulse alerts with optional filters.
   * Supports unreadOnly, dismissedOnly, activeOnly, triggered_by, pagination.
   * Sorted by created_at DESC.
   */
  async getMyPulseAlerts(
    options: GetMyPulseAlertsOptions = {}
  ): Promise<ServiceResult<PulseAlert[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const {
      unreadOnly,
      dismissedOnly,
      activeOnly,
      triggered_by,
      limit = 50,
      offset = 0,
    } = options

    let query = supabase
      .from('pulse_alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (unreadOnly) {
      query = query.is('read_at', null)
    }
    if (dismissedOnly) {
      query = query.not('dismissed_at', 'is', null)
    }
    if (activeOnly) {
      const now = new Date().toISOString()
      query = query.is('dismissed_at', null).or(`expires_at.is.null,expires_at.gt.${now}`)
    }
    if (triggered_by) {
      query = query.eq('triggered_by', triggered_by)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Get a single pulse alert by id for the current user, or null if not found.
   */
  async getPulseAlertById(id: string): Promise<ServiceResult<PulseAlert>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('pulse_alerts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
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
   * Mark a pulse alert as read for the current user.
   */
  async markPulseAlertRead(id: string): Promise<ServiceResult<PulseAlert>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('pulse_alerts')
      .update({ read_at: now } as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Dismiss a pulse alert for the current user.
   */
  async dismissPulseAlert(id: string): Promise<ServiceResult<PulseAlert>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('pulse_alerts')
      .update({ dismissed_at: now } as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Mark all unread (and not dismissed) pulse alerts as read for the current user.
   */
  async markAllPulseAlertsRead(): Promise<ServiceResult> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('pulse_alerts')
      .update({ read_at: now } as never)
      .eq('user_id', user.id)
      .is('read_at', null)
      .is('dismissed_at', null)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Get current user's active pulse alerts (not dismissed, not expired).
   * Supports pagination. Sorted by created_at DESC.
   */
  async getActivePulseAlerts(
    options: GetActivePulseAlertsOptions = {}
  ): Promise<ServiceResult<PulseAlert[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { limit = 50, offset = 0 } = options
    const now = new Date().toISOString()

    let query = supabase
      .from('pulse_alerts')
      .select('*')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /**
   * Get count of current user's unread (and not dismissed) pulse alerts.
   */
  async getUnreadPulseCount(): Promise<ServiceResult<number>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { count, error } = await supabase
      .from('pulse_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)
      .is('dismissed_at', null)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: count ?? 0, error: null }
  },
}
