/**
 * GENERATED Supabase types — regenerated from the disposable dev project
 * (xnext-markers-dev-disposable, ref vyipvsrmxirpdkbkfpsp) after applying
 * the full migration chain 001→027 on 2026-07-12.
 *
 * `supabase gen types typescript` output, verbatim. Kept alongside the
 * hand-authored src/lib/supabase/types.ts (which the app currently imports)
 * for signature verification; migrating the app to consume this file is a
 * separate refactor decision.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_list: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          priority: number
          quest_id: string
          status: Database["public"]["Enums"]["dream_list_status"]
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: number
          quest_id: string
          status?: Database["public"]["Enums"]["dream_list_status"]
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: number
          quest_id?: string
          status?: Database["public"]["Enums"]["dream_list_status"]
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_list_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_list_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explorer_marker_awards: {
        Row: {
          completions_at_award: number
          created_at: string
          earned_at: string
          id: string
          milestone_key: string
          quantity: number
          reason: string
          tier: string
          user_id: string
        }
        Insert: {
          completions_at_award?: number
          created_at?: string
          earned_at?: string
          id?: string
          milestone_key: string
          quantity: number
          reason: string
          tier: string
          user_id: string
        }
        Update: {
          completions_at_award?: number
          created_at?: string
          earned_at?: string
          id?: string
          milestone_key?: string
          quantity?: number
          reason?: string
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explorer_marker_awards_milestone_key_fkey"
            columns: ["milestone_key"]
            isOneToOne: false
            referencedRelation: "explorer_marker_milestones"
            referencedColumns: ["milestone_key"]
          },
          {
            foreignKeyName: "explorer_marker_awards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explorer_marker_discoveries: {
        Row: {
          completion_id: string | null
          created_at: string
          discovered_at: string
          id: string
          marker_id: string
          quest_id: string
          user_id: string
        }
        Insert: {
          completion_id?: string | null
          created_at?: string
          discovered_at?: string
          id?: string
          marker_id: string
          quest_id: string
          user_id: string
        }
        Update: {
          completion_id?: string | null
          created_at?: string
          discovered_at?: string
          id?: string
          marker_id?: string
          quest_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explorer_marker_discoveries_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "quest_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explorer_marker_discoveries_marker_id_fkey"
            columns: ["marker_id"]
            isOneToOne: false
            referencedRelation: "explorer_markers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explorer_marker_discoveries_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explorer_marker_discoveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explorer_marker_milestones: {
        Row: {
          created_at: string
          level_name: string
          milestone_key: string
          quantity: number
          required_completions: number
          sort_order: number
          tier: string
        }
        Insert: {
          created_at?: string
          level_name: string
          milestone_key: string
          quantity: number
          required_completions: number
          sort_order: number
          tier: string
        }
        Update: {
          created_at?: string
          level_name?: string
          milestone_key?: string
          quantity?: number
          required_completions?: number
          sort_order?: number
          tier?: string
        }
        Relationships: []
      }
      explorer_marker_reports: {
        Row: {
          created_at: string
          id: string
          marker_id: string
          reason: string
          reporter_user_id: string
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          marker_id: string
          reason: string
          reporter_user_id: string
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          marker_id?: string
          reason?: string
          reporter_user_id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "explorer_marker_reports_marker_id_fkey"
            columns: ["marker_id"]
            isOneToOne: false
            referencedRelation: "explorer_markers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explorer_marker_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explorer_markers: {
        Row: {
          consumed: boolean
          created_at: string
          id: string
          level_name_at_placement: string | null
          locked_at: string
          note: string | null
          owner_user_id: string
          photo_url: string | null
          placed_at: string
          quest_id: string
          retired_at: string | null
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          id?: string
          level_name_at_placement?: string | null
          locked_at?: string
          note?: string | null
          owner_user_id: string
          photo_url?: string | null
          placed_at?: string
          quest_id: string
          retired_at?: string | null
          status?: string
          tier: string
          updated_at?: string
        }
        Update: {
          consumed?: boolean
          created_at?: string
          id?: string
          level_name_at_placement?: string | null
          locked_at?: string
          note?: string | null
          owner_user_id?: string
          photo_url?: string | null
          placed_at?: string
          quest_id?: string
          retired_at?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "explorer_markers_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explorer_markers_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          data_deletion_requested_at: string | null
          data_deletion_scheduled_for: string | null
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          journey_visibility: string
          onboarding_completed: boolean
          privacy_policy_accepted_at: string | null
          privacy_policy_version: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          trust_score: number
          updated_at: string
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          data_deletion_requested_at?: string | null
          data_deletion_scheduled_for?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          journey_visibility?: string
          onboarding_completed?: boolean
          privacy_policy_accepted_at?: string | null
          privacy_policy_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          trust_score?: number
          updated_at?: string
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          data_deletion_requested_at?: string | null
          data_deletion_scheduled_for?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          journey_visibility?: string
          onboarding_completed?: boolean
          privacy_policy_accepted_at?: string | null
          privacy_policy_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          trust_score?: number
          updated_at?: string
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      pulse_alerts: {
        Row: {
          created_at: string
          delivered_at: string | null
          dismissed_at: string | null
          expires_at: string | null
          id: string
          quest_id: string
          read_at: string | null
          sq_score_at_trigger: number | null
          triggered_by: Database["public"]["Enums"]["pulse_trigger"]
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          quest_id: string
          read_at?: string | null
          sq_score_at_trigger?: number | null
          triggered_by: Database["public"]["Enums"]["pulse_trigger"]
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          quest_id?: string
          read_at?: string | null
          sq_score_at_trigger?: number | null
          triggered_by?: Database["public"]["Enums"]["pulse_trigger"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulse_alerts_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulse_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_availability_windows: {
        Row: {
          capacity: number | null
          created_at: string
          ends_at: string | null
          id: string
          notes: string | null
          quest_id: string
          recurrence_rule: string | null
          remaining: number | null
          starts_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          quest_id: string
          recurrence_rule?: string | null
          remaining?: number | null
          starts_at: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          quest_id?: string
          recurrence_rule?: string | null
          remaining?: number | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_availability_windows_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_chain_steps: {
        Row: {
          chain_id: string
          created_at: string
          id: string
          quest_id: string
          step_order: number
          unlock_after_days: number | null
          unlock_condition: Database["public"]["Enums"]["chain_unlock_condition"]
        }
        Insert: {
          chain_id: string
          created_at?: string
          id?: string
          quest_id: string
          step_order: number
          unlock_after_days?: number | null
          unlock_condition?: Database["public"]["Enums"]["chain_unlock_condition"]
        }
        Update: {
          chain_id?: string
          created_at?: string
          id?: string
          quest_id?: string
          step_order?: number
          unlock_after_days?: number | null
          unlock_condition?: Database["public"]["Enums"]["chain_unlock_condition"]
        }
        Relationships: [
          {
            foreignKeyName: "quest_chain_steps_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "quest_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_chain_steps_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_chains: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_platform_chain: boolean
          is_public: boolean
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_platform_chain?: boolean
          is_public?: boolean
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_platform_chain?: boolean
          is_public?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_chains_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_chains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_completions: {
        Row: {
          completed_at: string
          dream_list_id: string | null
          explorer_note: string | null
          explorer_tags: Json
          id: string
          is_public: boolean
          media_urls: Json
          quest_id: string
          sq_score_at_completion: number | null
          story: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          dream_list_id?: string | null
          explorer_note?: string | null
          explorer_tags?: Json
          id?: string
          is_public?: boolean
          media_urls?: Json
          quest_id: string
          sq_score_at_completion?: number | null
          story?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string
          dream_list_id?: string | null
          explorer_note?: string | null
          explorer_tags?: Json
          id?: string
          is_public?: boolean
          media_urls?: Json
          quest_id?: string
          sq_score_at_completion?: number | null
          story?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_completions_dream_list_id_fkey"
            columns: ["dream_list_id"]
            isOneToOne: false
            referencedRelation: "dream_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_scoring_factors: {
        Row: {
          community_signal: number
          computed_at: string
          cooldown_factor: number
          discovery_likelihood: number
          distance_factor: number
          id: string
          quest_id: string
          scarcity_score: number
          seasonal_factor: number
          time_sensitivity_score: number
          uniqueness_score: number
          weather_factor: number
        }
        Insert: {
          community_signal?: number
          computed_at?: string
          cooldown_factor?: number
          discovery_likelihood?: number
          distance_factor?: number
          id?: string
          quest_id: string
          scarcity_score?: number
          seasonal_factor?: number
          time_sensitivity_score?: number
          uniqueness_score?: number
          weather_factor?: number
        }
        Update: {
          community_signal?: number
          computed_at?: string
          cooldown_factor?: number
          discovery_likelihood?: number
          distance_factor?: number
          id?: string
          quest_id?: string
          scarcity_score?: number
          seasonal_factor?: number
          time_sensitivity_score?: number
          uniqueness_score?: number
          weather_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "quest_scoring_factors_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: true
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          active_months: number[]
          business_name: string | null
          city: string | null
          completed_count: number
          contact_email: string | null
          contact_phone: string | null
          country_code: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          experience_class: Database["public"]["Enums"]["experience_class"]
          expires_at: string | null
          external_url: string | null
          id: string
          is_evergreen: boolean
          is_featured: boolean
          is_paid_listing: boolean
          is_sponsored: boolean
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          location_name: string | null
          location_point: unknown
          location_radius_m: number | null
          media_urls: Json
          metadata: Json
          organization_id: string | null
          parking_point: unknown
          payment_status: Database["public"]["Enums"]["payment_status"]
          price_paid: number | null
          priority_boost: number
          published_at: string | null
          season_tags: string[]
          slug: string
          sponsor_id: string | null
          sq_score: number | null
          sq_score_computed_at: string | null
          start_date: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["quest_status"]
          stripe_payment_id: string | null
          tags: string[]
          ticket_url: string | null
          tier: Database["public"]["Enums"]["listing_tier"] | null
          title: string
          updated_at: string
          verified_location: boolean
        }
        Insert: {
          active_months?: number[]
          business_name?: string | null
          city?: string | null
          completed_count?: number
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          experience_class: Database["public"]["Enums"]["experience_class"]
          expires_at?: string | null
          external_url?: string | null
          id?: string
          is_evergreen?: boolean
          is_featured?: boolean
          is_paid_listing?: boolean
          is_sponsored?: boolean
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          location_name?: string | null
          location_point?: unknown
          location_radius_m?: number | null
          media_urls?: Json
          metadata?: Json
          organization_id?: string | null
          parking_point?: unknown
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_paid?: number | null
          priority_boost?: number
          published_at?: string | null
          season_tags?: string[]
          slug: string
          sponsor_id?: string | null
          sq_score?: number | null
          sq_score_computed_at?: string | null
          start_date?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["quest_status"]
          stripe_payment_id?: string | null
          tags?: string[]
          ticket_url?: string | null
          tier?: Database["public"]["Enums"]["listing_tier"] | null
          title: string
          updated_at?: string
          verified_location?: boolean
        }
        Update: {
          active_months?: number[]
          business_name?: string | null
          city?: string | null
          completed_count?: number
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          experience_class?: Database["public"]["Enums"]["experience_class"]
          expires_at?: string | null
          external_url?: string | null
          id?: string
          is_evergreen?: boolean
          is_featured?: boolean
          is_paid_listing?: boolean
          is_sponsored?: boolean
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          location_name?: string | null
          location_point?: unknown
          location_radius_m?: number | null
          media_urls?: Json
          metadata?: Json
          organization_id?: string | null
          parking_point?: unknown
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_paid?: number | null
          priority_boost?: number
          published_at?: string | null
          season_tags?: string[]
          slug?: string
          sponsor_id?: string | null
          sq_score?: number | null
          sq_score_computed_at?: string | null
          start_date?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["quest_status"]
          stripe_payment_id?: string | null
          tags?: string[]
          ticket_url?: string | null
          tier?: Database["public"]["Enums"]["listing_tier"] | null
          title?: string
          updated_at?: string
          verified_location?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "quests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_quest_preferences: {
        Row: {
          created_at: string
          home_location: unknown
          max_distance_km: number
          preferred_classes: Database["public"]["Enums"]["experience_class"][]
          preferred_tags: string[]
          pulse_enabled: boolean
          pulse_frequency: Database["public"]["Enums"]["pulse_frequency"]
          pulse_min_sq_score: number
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          home_location?: unknown
          max_distance_km?: number
          preferred_classes?: Database["public"]["Enums"]["experience_class"][]
          preferred_tags?: string[]
          pulse_enabled?: boolean
          pulse_frequency?: Database["public"]["Enums"]["pulse_frequency"]
          pulse_min_sq_score?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          home_location?: unknown
          max_distance_km?: number
          preferred_classes?: Database["public"]["Enums"]["experience_class"][]
          preferred_tags?: string[]
          pulse_enabled?: boolean
          pulse_frequency?: Database["public"]["Enums"]["pulse_frequency"]
          pulse_min_sq_score?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quest_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_map_listings: {
        Args: { p_limit?: number }
        Returns: {
          business_name: string
          city: string
          completed_count: number
          country_code: string
          created_at: string
          created_by: string
          creator_trust_score: number
          experience_class: Database["public"]["Enums"]["experience_class"]
          expires_at: string
          external_url: string
          id: string
          is_featured: boolean
          is_paid_listing: boolean
          lat: number
          listing_type: Database["public"]["Enums"]["listing_type"]
          lng: number
          location_name: string
          media_urls: Json
          payment_status: Database["public"]["Enums"]["payment_status"]
          published_at: string
          starts_at: string
          status: Database["public"]["Enums"]["quest_status"]
          ticket_url: string
          tier: Database["public"]["Enums"]["listing_tier"]
          title: string
          verified_location: boolean
        }[]
      }
      anonymize_my_audit_logs: { Args: never; Returns: undefined }
      cancel_explorer_marker: {
        Args: { p_marker_id: string }
        Returns: {
          consumed: boolean
          created_at: string
          id: string
          level_name_at_placement: string | null
          locked_at: string
          note: string | null
          owner_user_id: string
          photo_url: string | null
          placed_at: string
          quest_id: string
          retired_at: string | null
          status: string
          tier: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "explorer_markers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_explorer_milestones: {
        Args: never
        Returns: {
          completions_at_award: number
          created_at: string
          earned_at: string
          id: string
          milestone_key: string
          quantity: number
          reason: string
          tier: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "explorer_marker_awards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      count_verified_completions: {
        Args: { p_user_id: string }
        Returns: number
      }
      create_organization: {
        Args: { org_name: string; org_slug: string }
        Returns: string
      }
      discover_explorer_marker: {
        Args: { p_lat?: number; p_lng?: number; p_marker_id: string }
        Returns: {
          completion_id: string | null
          created_at: string
          discovered_at: string
          id: string
          marker_id: string
          quest_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "explorer_marker_discoveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_quests_nearby: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_offset?: number
          p_radius_km: number
        }
        Returns: {
          active_months: number[]
          city: string
          completed_count: number
          country_code: string
          description: string
          distance_km: number
          end_date: string
          experience_class: Database["public"]["Enums"]["experience_class"]
          expires_at: string
          external_url: string
          id: string
          is_evergreen: boolean
          is_featured: boolean
          lat: number
          listing_type: Database["public"]["Enums"]["listing_type"]
          lng: number
          location_name: string
          media_urls: Json
          parking_lat: number
          parking_lng: number
          priority_boost: number
          published_at: string
          season_tags: string[]
          seasonal_active: boolean
          seasonal_rank: number
          slug: string
          sq_score: number
          start_date: string
          starts_at: string
          status: Database["public"]["Enums"]["quest_status"]
          ticket_url: string
          tier: Database["public"]["Enums"]["listing_tier"]
          title: string
          verified_location: boolean
        }[]
      }
      get_community_activity: {
        Args: { p_limit?: number }
        Returns: {
          explorer_name: string
          happened_on: string
          kind: string
          quest_title: string
          tier: string
        }[]
      }
      get_community_metrics: {
        Args: never
        Returns: {
          completions_today: number
          dream_completed_today: number
          explorer_notes_today: number
          markers_discovered_today: number
          markers_placed_total: number
        }[]
      }
      get_experience_markers: {
        Args: { p_quest_id: string }
        Returns: {
          discovered_by_me: boolean
          discovery_count: number
          explorer_name: string
          id: string
          is_mine: boolean
          level_name_at_placement: string
          note: string
          photo_url: string
          placed_at: string
          tier: string
        }[]
      }
      get_my_keepsakes: {
        Args: { p_limit?: number }
        Returns: {
          discovered_at: string
          id: string
          marker_id: string
          marker_placed_at: string
          marker_status: string
          note: string
          quest_id: string
          quest_slug: string
          quest_title: string
          tier: string
        }[]
      }
      get_my_marker_inventory: {
        Args: never
        Returns: {
          available: number
          awarded: number
          tier: string
        }[]
      }
      get_my_verified_completion_count: { Args: never; Returns: number }
      has_permission: { Args: { permission_name: string }; Returns: boolean }
      has_role: { Args: { role_name: string }; Returns: boolean }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_record_id: string
          p_table_name: string
        }
        Returns: undefined
      }
      place_explorer_marker: {
        Args: {
          p_note?: string
          p_photo_url?: string
          p_quest_id: string
          p_tier: string
        }
        Returns: {
          consumed: boolean
          created_at: string
          id: string
          level_name_at_placement: string | null
          locked_at: string
          note: string | null
          owner_user_id: string
          photo_url: string | null
          placed_at: string
          quest_id: string
          retired_at: string | null
          status: string
          tier: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "explorer_markers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_explorer_marker: {
        Args: { p_marker_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      audit_action:
        | "INSERT"
        | "UPDATE"
        | "DELETE"
        | "SELECT"
        | "LOGIN"
        | "LOGOUT"
        | "SIGNUP"
        | "PASSWORD_RESET"
        | "PERMISSION_GRANT"
        | "PERMISSION_REVOKE"
      chain_unlock_condition: "previous_completed" | "any_completed" | "manual"
      dream_list_status: "saved" | "planned" | "completed" | "dismissed"
      experience_class:
        | "wonder"
        | "opportunity"
        | "transformation"
        | "connection"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      listing_tier:
        | "yard_sale"
        | "local_event"
        | "business_spotlight"
        | "featured_business"
        | "monthly_partner"
      listing_type:
        | "yard_sale"
        | "local_event"
        | "business_promo"
        | "market_show"
        | "community_event"
      org_member_role: "owner" | "admin" | "member"
      payment_status: "unpaid" | "pending" | "paid" | "refunded"
      pulse_frequency: "realtime" | "daily" | "weekly"
      pulse_trigger:
        | "score_threshold"
        | "deadline"
        | "weather"
        | "proximity"
        | "seasonal"
      quest_status: "draft" | "pending_review" | "published" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: [
        "INSERT",
        "UPDATE",
        "DELETE",
        "SELECT",
        "LOGIN",
        "LOGOUT",
        "SIGNUP",
        "PASSWORD_RESET",
        "PERMISSION_GRANT",
        "PERMISSION_REVOKE",
      ],
      chain_unlock_condition: ["previous_completed", "any_completed", "manual"],
      dream_list_status: ["saved", "planned", "completed", "dismissed"],
      experience_class: [
        "wonder",
        "opportunity",
        "transformation",
        "connection",
      ],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      listing_tier: [
        "yard_sale",
        "local_event",
        "business_spotlight",
        "featured_business",
        "monthly_partner",
      ],
      listing_type: [
        "yard_sale",
        "local_event",
        "business_promo",
        "market_show",
        "community_event",
      ],
      org_member_role: ["owner", "admin", "member"],
      payment_status: ["unpaid", "pending", "paid", "refunded"],
      pulse_frequency: ["realtime", "daily", "weekly"],
      pulse_trigger: [
        "score_threshold",
        "deadline",
        "weather",
        "proximity",
        "seasonal",
      ],
      quest_status: ["draft", "pending_review", "published", "archived"],
    },
  },
} as const
