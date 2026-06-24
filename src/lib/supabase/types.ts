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
  is_admin: boolean
  privacy_policy_accepted_at: string | null
  privacy_policy_version: string | null
  terms_accepted_at: string | null
  terms_version: string | null
  data_deletion_requested_at: string | null
  data_deletion_scheduled_for: string | null
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

export type ExperienceClass = 'wonder' | 'opportunity' | 'transformation' | 'connection'

export type QuestStatus = 'draft' | 'pending_review' | 'published' | 'archived'

export type DreamListStatus = 'saved' | 'planned' | 'completed' | 'dismissed'

export type PulseTrigger =
  | 'score_threshold'
  | 'deadline'
  | 'weather'
  | 'proximity'
  | 'seasonal'

export type ChainUnlockCondition =
  | 'previous_completed'
  | 'any_completed'
  | 'manual'

export type PulseFrequency = 'realtime' | 'daily' | 'weekly'

// ── Paid time-sensitive listings (migration 018) ─────────────────────────────
export type ListingType =
  | 'yard_sale'
  | 'local_event'
  | 'business_promo'
  | 'market_show'
  | 'community_event'

export type ListingTier =
  | 'yard_sale'
  | 'local_event'
  | 'business_spotlight'
  | 'featured_business'
  | 'monthly_partner'

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded'

// Standard Supabase Json type for json/jsonb columns (per task requirement)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Quest {
  id: string
  organization_id: string | null
  created_by: string
  slug: string
  title: string
  description: string | null
  experience_class: ExperienceClass
  location_name: string | null
  location_point: unknown | null
  location_radius_m: number | null
  city: string | null
  country_code: string | null
  tags: string[]
  is_sponsored: boolean
  sponsor_id: string | null
  media_urls: Json
  external_url: string | null
  status: QuestStatus
  sq_score: number | null
  sq_score_computed_at: string | null
  published_at: string | null
  expires_at: string | null
  metadata: Json
  created_at: string
  updated_at: string
  // Paid time-sensitive listing fields (migration 018; null/false on organic quests)
  listing_type?: ListingType | null
  is_paid_listing?: boolean
  tier?: ListingTier | null
  price_paid?: number | null
  payment_status?: PaymentStatus
  stripe_payment_id?: string | null
  starts_at?: string | null
  is_featured?: boolean
  business_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  // Seasonal experience fields (migration 019). Defaults keep organic quests
  // year-round unless a creator/admin classifies them.
  season_tags?: string[]
  active_months?: number[]
  start_date?: string | null
  end_date?: string | null
  priority_boost?: number
  is_evergreen?: boolean
  /** Optional drive-to parking coordinate (migration 019); WKB hex when read. */
  parking_point?: unknown | null
  // scoring_factors and availability_windows are NOT columns on the quests table
  // (per review). They have been removed from Quest Row type to avoid phantom
  // properties. Use QuestByIdResult for getQuestById() if/when they are sourced
  // via separate storage, joins, or RPC.
}

export interface QuestByIdResult {
  quest: Quest | null
  scoring_factors: Record<string, unknown> | null
  availability_windows: Array<Record<string, unknown>> | null
}

/**
 * Shape returned by the find_quests_nearby RPC
 * (014_find_quests_nearby_rpc.sql, lat/lng added in
 * 015_find_quests_nearby_latlng.sql).
 * Subset of Quest fields + computed distance_km for feed/preview use.
 * (Not a full Quest; no organization_id, tags, etc.)
 */
export interface NearbyQuest {
  id: string
  title: string
  slug: string
  description: string | null
  experience_class: ExperienceClass
  status: QuestStatus
  location_name: string | null
  city: string | null
  country_code: string | null
  sq_score: number | null
  published_at: string | null
  distance_km: number
  /** From ST_Y(location_point); non-null because RPC filters location_point IS NOT NULL */
  lat: number
  /** From ST_X(location_point) */
  lng: number
  // Listing fields (migration 018; undefined until the RPC is updated)
  listing_type?: ListingType | null
  is_featured?: boolean
  starts_at?: string | null
  expires_at?: string | null
  // Seasonal + parking fields (migration 019 RPC).
  season_tags?: string[]
  active_months?: number[]
  start_date?: string | null
  end_date?: string | null
  priority_boost?: number
  is_evergreen?: boolean
  /** Computed by the RPC: is the experience in its active month/date window now. */
  seasonal_active?: boolean
  /** Computed by the RPC: 0 active seasonal · 1 date-based · 2 evergreen · 3 off-season. */
  seasonal_rank?: number
  /** From ST_Y(parking_point); null when no separate parking coordinate. */
  parking_lat?: number | null
  /** From ST_X(parking_point); null when no separate parking coordinate. */
  parking_lng?: number | null
}

// ─── SQ Domain tables (derived directly from migrations 008-013) ──────────────

export interface QuestScoringFactor {
  id: string
  quest_id: string
  uniqueness_score: number
  scarcity_score: number
  time_sensitivity_score: number
  discovery_likelihood: number
  community_signal: number
  seasonal_factor: number
  weather_factor: number
  distance_factor: number
  cooldown_factor: number
  computed_at: string
}

export type QuestScoringFactorInsert = Omit<QuestScoringFactor, 'id' | 'computed_at'>

export type QuestScoringFactorUpdate = Partial<
  Omit<QuestScoringFactor, 'id' | 'quest_id' | 'computed_at'>
>

export interface QuestAvailabilityWindow {
  id: string
  quest_id: string
  starts_at: string
  ends_at: string | null
  recurrence_rule: string | null
  capacity: number | null
  remaining: number | null
  notes: string | null
  created_at: string
}

export interface DreamList {
  id: string
  user_id: string
  quest_id: string
  status: DreamListStatus
  priority: number
  notes: string | null
  target_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type DreamListItemWithQuest = DreamList & {
  quests?: {
    id: string
    title: string
    slug: string
    experience_class: ExperienceClass
    sq_score: number | null
  } | null
}

export interface QuestCompletion {
  id: string
  user_id: string
  quest_id: string
  dream_list_id: string | null
  completed_at: string
  story: string | null
  media_urls: Json
  is_public: boolean
  sq_score_at_completion: number | null
}

export interface QuestChain {
  id: string
  name: string
  description: string | null
  created_by: string
  organization_id: string | null
  is_platform_chain: boolean
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface QuestChainStep {
  id: string
  chain_id: string
  quest_id: string
  step_order: number
  unlock_condition: ChainUnlockCondition
  unlock_after_days: number | null
  created_at: string
}

export type QuestChainWithSteps = QuestChain & {
  quest_chain_steps: QuestChainStep[]
}

export interface PulseAlert {
  id: string
  user_id: string
  quest_id: string
  triggered_by: PulseTrigger
  sq_score_at_trigger: number | null
  delivered_at: string | null
  read_at: string | null
  dismissed_at: string | null
  expires_at: string | null
  created_at: string
}

export interface UserQuestPreference {
  user_id: string
  preferred_classes: ExperienceClass[]
  preferred_tags: string[]
  home_location: unknown | null
  max_distance_km: number
  pulse_enabled: boolean
  pulse_min_sq_score: number
  pulse_frequency: PulseFrequency
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  created_at: string
  updated_at: string
}

// ─── Insert types (omit server-generated fields) ──────────────────────────────

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'full_name'
    | 'avatar_url'
    | 'username'
    | 'bio'
    | 'website'
    | 'onboarding_completed'
    | 'privacy_policy_accepted_at'
    | 'privacy_policy_version'
    | 'terms_accepted_at'
    | 'terms_version'
    | 'data_deletion_requested_at'
    | 'data_deletion_scheduled_for'
  >
>

export type OrganizationInsert = Pick<Organization, 'name' | 'slug'> &
  Partial<Pick<Organization, 'logo_url' | 'description' | 'website'>>

export type OrganizationUpdate = Partial<
  Pick<Organization, 'name' | 'logo_url' | 'description' | 'website'>
>

export type DreamListInsert = Partial<
  Omit<DreamList, 'id' | 'created_at' | 'updated_at'>
> & {
  user_id: string
  quest_id: string
}

export type DreamListUpdate = Partial<
  Omit<DreamList, 'id' | 'user_id' | 'quest_id' | 'created_at' | 'updated_at'>
>

export type QuestChainInsert = Omit<QuestChain, 'id' | 'created_at' | 'updated_at'>

export type QuestChainUpdate = Partial<
  Omit<QuestChain, 'id' | 'created_at' | 'updated_at'>
>

export type QuestChainStepInsert = Omit<QuestChainStep, 'id' | 'created_at'>

export type QuestChainStepUpdate = Partial<
  Omit<QuestChainStep, 'id' | 'created_at'>
>

// ─── Database shape (for createClient<Database>) ──────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: ProfileUpdate
        Relationships: []
      }
      organizations: {
        Row: Organization
        Insert: OrganizationInsert & { created_by: string }
        Update: OrganizationUpdate
        Relationships: []
      }
      organization_members: {
        Row: OrganizationMember
        Insert: Omit<OrganizationMember, 'id' | 'joined_at'>
        Update: Partial<Pick<OrganizationMember, 'role'>>
        Relationships: []
      }
      organization_invitations: {
        Row: OrganizationInvitation
        Insert: Omit<OrganizationInvitation, 'id' | 'token' | 'status' | 'created_at'>
        Update: Partial<Pick<OrganizationInvitation, 'status'>>
        Relationships: []
      }
      roles: {
        Row: Role
        Insert: Omit<Role, 'id' | 'created_at'>
        Update: Partial<Pick<Role, 'name' | 'description'>>
        Relationships: []
      }
      permissions: {
        Row: Permission
        Insert: Omit<Permission, 'id' | 'created_at'>
        Update: Partial<Pick<Permission, 'name' | 'description'>>
        Relationships: []
      }
      role_permissions: {
        Row: RolePermission
        Insert: Omit<RolePermission, 'id'>
        Update: Record<string, never>
        Relationships: []
      }
      user_roles: {
        Row: UserRole
        Insert: Omit<UserRole, 'id' | 'granted_at'>
        Update: Record<string, never>
        Relationships: []
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'>
        Update: Record<string, never>
        Relationships: []
      }
      quests: {
        Row: Quest
        Insert: Omit<
          Quest,
          'id' | 'created_at' | 'updated_at' | 'sq_score' | 'sq_score_computed_at' | 'published_at'
        >
        Update: Partial<
          Pick<
            Quest,
            | 'title'
            | 'description'
            | 'experience_class'
            | 'location_name'
            | 'location_point'
            | 'location_radius_m'
            | 'city'
            | 'country_code'
            | 'tags'
            | 'is_sponsored'
            | 'sponsor_id'
            | 'media_urls'
            | 'external_url'
            | 'status'
            | 'sq_score'
            | 'published_at'
            | 'expires_at'
            | 'metadata'
            | 'season_tags'
            | 'active_months'
            | 'start_date'
            | 'end_date'
            | 'priority_boost'
            | 'is_evergreen'
            | 'parking_point'
            | 'is_featured'
          >
        >
        Relationships: []
      }
      quest_scoring_factors: {
        Row: QuestScoringFactor
        Insert: QuestScoringFactorInsert
        Update: QuestScoringFactorUpdate
        Relationships: []
      }
      quest_availability_windows: {
        Row: QuestAvailabilityWindow
        Insert: Omit<QuestAvailabilityWindow, 'id' | 'created_at'>
        Update: Partial<Omit<QuestAvailabilityWindow, 'id' | 'quest_id' | 'created_at'>>
        Relationships: []
      }
      dream_list: {
        Row: DreamList
        Insert: DreamListInsert
        Update: DreamListUpdate
        Relationships: []
      }
      quest_completions: {
        Row: QuestCompletion
        Insert: Omit<QuestCompletion, 'id'>
        Update: Partial<Omit<QuestCompletion, 'id' | 'user_id' | 'quest_id'>>
        Relationships: []
      }
      quest_chains: {
        Row: QuestChain
        Insert: QuestChainInsert
        Update: QuestChainUpdate
        Relationships: []
      }
      quest_chain_steps: {
        Row: QuestChainStep
        Insert: QuestChainStepInsert
        Update: QuestChainStepUpdate
        Relationships: []
      }
      pulse_alerts: {
        Row: PulseAlert
        Insert: Omit<PulseAlert, 'id' | 'created_at'>
        Update: Partial<Omit<PulseAlert, 'id' | 'user_id' | 'quest_id' | 'triggered_by' | 'created_at'>>
        Relationships: []
      }
      user_quest_preferences: {
        Row: UserQuestPreference
        Insert: Omit<UserQuestPreference, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserQuestPreference, 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
    }
    Views: {}
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
      anonymize_my_audit_logs: {
        Args: Record<string, never>
        Returns: void
      }
      find_quests_nearby: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_km: number
          p_limit?: number
          p_offset?: number
        }
        Returns: NearbyQuest[]
      }
    }
    Enums: {
      org_member_role: OrgMemberRole
      invitation_status: InvitationStatus
      audit_action: AuditAction
      quest_status: QuestStatus
      experience_class: ExperienceClass
      dream_list_status: DreamListStatus
      pulse_trigger: PulseTrigger
      chain_unlock_condition: ChainUnlockCondition
      pulse_frequency: PulseFrequency
    }
  }
}
