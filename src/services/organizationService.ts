import { supabase } from '../lib/supabase/client'
import type {
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  OrganizationInsert,
  OrganizationUpdate,
  OrgMemberRole,
} from '../lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = null> {
  data: T | null
  error: string | null
}

export interface OrgMemberWithProfile extends OrganizationMember {
  profiles: {
    full_name: string | null
    avatar_url: string | null
    email: string | null
  } | null
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

export const organizationService = {
  /**
   * Create a new organization. The current user becomes the owner automatically
   * via the `create_organization` database function (defined in 006_tenants.sql).
   */
  async createOrganization(
    params: OrganizationInsert
  ): Promise<ServiceResult<Organization>> {
    // Call the DB function which creates the org + owner member in a transaction
    const { data: orgId, error: fnError } = await (supabase.rpc as any)('create_organization', {
      org_name: params.name,
      org_slug: params.slug,
    })

    if (fnError) return { data: null, error: extractMessage(fnError) }

    // Fetch the created org row
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (error) return { data: null, error: extractMessage(error) }

    // Apply optional fields if provided
    if (params.logo_url || params.description || params.website) {
      const { data: updated, error: updateError } = await supabase
        .from('organizations')
        .update({
          logo_url: params.logo_url,
          description: params.description,
          website: params.website,
        } as never)
        .eq('id', orgId)
        .select()
        .single()

      if (updateError) return { data: null, error: extractMessage(updateError) }
      return { data: updated, error: null }
    }

    return { data, error: null }
  },

  /**
   * Get all organizations the authenticated user is a member of.
   */
  async getUserOrganizations(): Promise<ServiceResult<Organization[]>> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .returns<{ organizations: Organization }[]>()

    if (error) return { data: null, error: extractMessage(error) }

    const orgs = data.map((row) => row.organizations).filter(Boolean)
    return { data: orgs, error: null }
  },

  /**
   * Get a single organization by ID.
   * RLS + is_org_member() ensures only members can read.
   */
  async getOrganizationById(orgId: string): Promise<ServiceResult<Organization>> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Update organization details. Only org admins/owners can call this
   * (enforced by RLS + is_org_admin()).
   */
  async updateOrganization(
    orgId: string,
    updates: OrganizationUpdate
  ): Promise<ServiceResult<Organization>> {
    const { data, error } = await supabase
      .from('organizations')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', orgId)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Get all members of an organization, joined with their profile data.
   */
  async getOrganizationMembers(
    orgId: string
  ): Promise<ServiceResult<OrgMemberWithProfile[]>> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        *,
        profiles (
          full_name,
          avatar_url,
          email
        )
      `)
      .eq('organization_id', orgId)
      .returns<OrgMemberWithProfile[]>()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Invite a user to an organization by email.
   * Only org admins/owners can invite.
   */
  async inviteMember(
    orgId: string,
    email: string,
    role: OrgMemberRole = 'member'
  ): Promise<ServiceResult<OrganizationInvitation>> {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7-day expiry

    const { data, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: orgId,
        email,
        role,
        expires_at: expiresAt.toISOString(),
        // invited_by is set server-side via auth.uid() default
      } as any)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Accept an invitation by token.
   * Marks the invitation as accepted and inserts an org_member row.
   * The actual member creation should be handled by a DB trigger on invitation status change.
   */
  async acceptInvitation(token: string): Promise<ServiceResult<OrganizationMember>> {
    // 1. Find the invitation
    const { data: invitation, error: findError } = await (supabase
      .from('organization_invitations') as any)
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (findError || !invitation) {
      return { data: null, error: 'Invitation not found or has expired.' }
    }

    // 2. Mark as accepted
    const { error: acceptError } = await supabase
      .from('organization_invitations')
      .update({ status: 'accepted' } as never)
      .eq('id', invitation.id)

    if (acceptError) return { data: null, error: extractMessage(acceptError) }

    // 3. Insert member row (idempotent — upsert on conflict)
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .upsert(
        {
          organization_id: invitation.organization_id,
          // user_id resolved from RLS/auth.uid() on the server
          role: invitation.role,
        } as never,
        { onConflict: 'organization_id,user_id' }
      )
      .select()
      .single()

    if (memberError) return { data: null, error: extractMessage(memberError) }
    return { data: member, error: null }
  },
}
