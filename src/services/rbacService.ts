import { supabase } from '../lib/supabase/client'
import type { Role, Permission } from '../lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = null> {
  data: T | null
  error: string | null
}

// Seeded role names from 004_roles_permissions.sql
export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'creator'
  | 'moderator'
  | 'member'
  | 'viewer'

// Seeded permission names from 004_roles_permissions.sql
export type AppPermission =
  | 'users.read'
  | 'users.manage'
  | 'roles.read'
  | 'roles.manage'
  | 'content.read'
  | 'content.create'
  | 'content.update'
  | 'content.delete'
  | 'moderation.read'
  | 'moderation.manage'
  | 'billing.read'
  | 'billing.manage'
  | 'audit.read'
  | 'settings.manage'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'An unexpected error occurred'
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const rbacService = {
  /**
   * Check if the authenticated user has a given role.
   * Delegates to the `public.has_role()` DB function (defined in 004_roles_permissions.sql)
   * so the check is always authoritative and never gameable from the client.
   */
  async hasRole(roleName: AppRole): Promise<boolean> {
    const { data, error } = await (supabase.rpc as any)('has_role', { role_name: roleName })
    if (error) return false
    return data === true
  },

  /**
   * Check if the authenticated user has a given permission.
   * Delegates to the `public.has_permission()` DB function.
   */
  async hasPermission(permissionName: AppPermission): Promise<boolean> {
    const { data, error } = await (supabase.rpc as any)('has_permission', {
      permission_name: permissionName,
    })
    if (error) return false
    return data === true
  },

  /**
   * Get all roles assigned to the authenticated user.
   */
  async getUserRoles(): Promise<ServiceResult<Role[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('user_roles')
      .select('roles(*)')
      .eq('user_id', user.id)
      .returns<{ roles: Role }[]>()

    if (error) return { data: null, error: extractMessage(error) }

    const roles = data.map((row) => row.roles).filter(Boolean)
    return { data: roles, error: null }
  },

  /**
   * Get all permissions the authenticated user has (via their roles).
   */
  async getUserPermissions(): Promise<ServiceResult<Permission[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('user_roles')
      .select(`
        roles (
          role_permissions (
            permissions (*)
          )
        )
      `)
      .eq('user_id', user.id)

    if (error) return { data: null, error: extractMessage(error) }

    // Flatten nested structure: user_roles → roles → role_permissions → permissions
    const permissions: Permission[] = []
    const seen = new Set<string>()

    for (const userRole of data as unknown as Array<{
      roles: { role_permissions: Array<{ permissions: Permission }> } | null
    }>) {
      for (const rp of userRole.roles?.role_permissions ?? []) {
        const p = rp.permissions
        if (p && !seen.has(p.id)) {
          seen.add(p.id)
          permissions.push(p)
        }
      }
    }

    return { data: permissions, error: null }
  },
}
