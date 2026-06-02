/**
 * XNext / SQ — Supabase Database Types
 *
 * Run `supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts`
 * to replace this file with fully generated types.
 *
 * This file provides hand-authored types that mirror the existing schema
 * (migrations 001–007) until codegen is wired into CI.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type OrgMemberRole = 'owner' | 'admin' | 'member'
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired'
export type AuditAction =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'SELECT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'SIGNUP'
  | 'PASSWORD_RESET'
  | 'PERMISSION_GRANT'
  | 'PERMISSION_REVOKE'

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  username: string | null
  bio: string | null
  website: string | null
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  description: string | null
  website: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrgMemberRole
  joined_at: string
}

export interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  role: OrgMemberRole
  invited_by: string
  status: InvitationStatus
  token: string
  expires_at: string
  created_at: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Permission {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface RolePermission {
  id: string
  role_id: string
  permission_id: string
}

export interface UserRole {
  id: string
  user_id: string
  role_id: string
  granted_by: string | null
  granted_at: string
}

export interface AuditLog {
  id: string
  table_name: string | null
  record_id: string | null
  action: AuditAction
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  user_id: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── Insert types (omit server-generated fields) ──────────────────────────────

export type ProfileUpdate = Partial<
  Pick<Profile, 'full_name' | 'avatar_url' | 'username' | 'bio' | 'website' | 'onboarding_completed'>
>

export type OrganizationInsert = Pick<Organization, 'name' | 'slug'> &
  Partial<Pick<Organization, 'logo_url' | 'description' | 'website'>>

export type OrganizationUpdate = Partial<
  Pick<Organization, 'name' | 'logo_url' | 'description' | 'website'>
>

// ─── Database shape (for createClient<Database>) ──────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: ProfileUpdate
      }
      organizations: {
        Row: Organization
        Insert: OrganizationInsert & { created_by: string }
        Update: OrganizationUpdate
      }
      organization_members: {
        Row: OrganizationMember
        Insert: Omit<OrganizationMember, 'id' | 'joined_at'>
        Update: Partial<Pick<OrganizationMember, 'role'>>
      }
      organization_invitations: {
        Row: OrganizationInvitation
        Insert: Omit<OrganizationInvitation, 'id' | 'token' | 'status' | 'created_at'>
        Update: Partial<Pick<OrganizationInvitation, 'status'>>
      }
      roles: {
        Row: Role
        Insert: Omit<Role, 'id' | 'created_at'>
        Update: Partial<Pick<Role, 'name' | 'description'>>
      }
      permissions: {
        Row: Permission
        Insert: Omit<Permission, 'id' | 'created_at'>
        Update: Partial<Pick<Permission, 'name' | 'description'>>
      }
      role_permissions: {
        Row: RolePermission
        Insert: Omit<RolePermission, 'id'>
        Update: never
      }
      user_roles: {
        Row: UserRole
        Insert: Omit<UserRole, 'id' | 'granted_at'>
        Update: never
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'>
        Update: never
      }
    }
    Functions: {
      has_role: {
        Args: { role_name: string }
        Returns: boolean
      }
      has_permission: {
        Args: { permission_name: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { org_id: string }
        Returns: boolean
      }
      create_organization: {
        Args: { org_name: string; org_slug: string }
        Returns: string
      }
      log_audit_event: {
        Args: {
          p_table_name: string
          p_record_id: string
          p_action: AuditAction
          p_old_data?: Record<string, unknown>
          p_new_data?: Record<string, unknown>
          p_metadata?: Record<string, unknown>
        }
        Returns: void
      }
    }
    Enums: {
      org_member_role: OrgMemberRole
      invitation_status: InvitationStatus
      audit_action: AuditAction
    }
  }
}
