import { supabase } from '../lib/supabase/client'
import type { AuditLog, AuditAction } from '../lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = null> {
  data: T | null
  error: string | null
}

export interface LogAuditEventParams {
  tableName: string
  recordId: string
  action: AuditAction
  oldData?: Record<string, unknown>
  newData?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface GetAuditLogsParams {
  tableName?: string
  recordId?: string
  userId?: string
  action?: AuditAction
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'An unexpected error occurred'
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const auditService = {
  /**
   * Log an audit event via the `public.log_audit_event()` database function.
   * Requires the `audit.read` permission on the backend (enforced by RLS).
   *
   * Most critical actions are auto-logged via DB triggers (defined in 005_audit_logs.sql).
   * Use this function for application-level events (e.g. login, password reset,
   * permission grant/revoke) that don't map to a direct table mutation.
   */
  async logAuditEvent({
    tableName,
    recordId,
    action,
    oldData,
    newData,
    metadata,
  }: LogAuditEventParams): Promise<ServiceResult> {
    const { error } = await (supabase.rpc as any)('log_audit_event', {
      p_table_name: tableName,
      p_record_id: recordId,
      p_action: action,
      p_old_data: oldData,
      p_new_data: newData,
      p_metadata: metadata,
    })

    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },

  /**
   * Retrieve audit logs with optional filters.
   * Requires the `audit.read` permission (enforced by RLS — only super_admin/admin by default).
   */
  async getAuditLogs({
    tableName,
    recordId,
    userId,
    action,
    fromDate,
    toDate,
    limit = 50,
    offset = 0,
  }: GetAuditLogsParams = {}): Promise<ServiceResult<AuditLog[]>> {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (tableName) query = query.eq('table_name', tableName)
    if (recordId) query = query.eq('record_id', recordId)
    if (userId) query = query.eq('user_id', userId)
    if (action) query = query.eq('action', action)
    if (fromDate) query = query.gte('created_at', fromDate)
    if (toDate) query = query.lte('created_at', toDate)

    const { data, error } = await query

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },
}
