-- 001_base_schema.sql
-- Consolidated base schema for XNEXT (replaces historical 001-013).
-- This makes the project reproducible from a fresh Supabase project.
-- 
-- Includes:
-- - Extensions (pgcrypto, postgis)
-- - All enums from schema
-- - All core tables with columns, PKs, FKs, defaults, constraints
-- - updated_at triggers for tables that have the column
-- - Indexes (including GIST spatial index on quests.location_point)
-- - RLS enabled on all tables
-- - Core RLS policies (based on service requirements, ownership, published visibility, permission checks via DB functions)
-- - Storage bucket 'avatars' (public) + basic policies
-- - Pre-014/015 DB functions/RPCs: has_role, has_permission, is_org_member, is_org_admin, create_organization, log_audit_event
--
-- Assumptions / Notes:
-- - Uses pgcrypto for gen_random_uuid()
-- - PostGIS for geography support (required by quests.location_point and 014/015 RPCs)
-- - RLS policies are "core" and conservative; services often layer additional .eq() checks
-- - Default roles/permissions can be seeded separately or via app (see rbacService comments)
-- - 014 and 015 remain unchanged and will be applied after this
-- - Run via `supabase db push` after linking a fresh project
-- - Compatible with existing seed.sql and all current services/types
--
-- Order of objects: extensions -> enums -> helper functions -> tables -> triggers -> indexes -> functions -> RLS -> storage

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid(), etc.
CREATE EXTENSION IF NOT EXISTS postgis;   -- for geography, ST_* functions (required by 014/015)

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE org_member_role AS ENUM ('owner', 'admin', 'member');

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

CREATE TYPE audit_action AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE',
  'SELECT',
  'LOGIN',
  'LOGOUT',
  'SIGNUP',
  'PASSWORD_RESET',
  'PERMISSION_GRANT',
  'PERMISSION_REVOKE'
);

CREATE TYPE quest_status AS ENUM ('draft', 'pending_review', 'published', 'archived');

CREATE TYPE experience_class AS ENUM ('wonder', 'opportunity', 'transformation', 'connection');

CREATE TYPE dream_list_status AS ENUM ('saved', 'planned', 'completed', 'dismissed');

CREATE TYPE pulse_trigger AS ENUM (
  'score_threshold',
  'deadline',
  'weather',
  'proximity',
  'seasonal'
);

CREATE TYPE chain_unlock_condition AS ENUM (
  'previous_completed',
  'any_completed',
  'manual'
);

CREATE TYPE pulse_frequency AS ENUM ('realtime', 'daily', 'weekly');

-- ============================================
-- HELPER FUNCTION FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLES (in dependency order)
-- ============================================

-- profiles (core auth-linked table)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  full_name text,
  avatar_url text,
  username text,
  bio text,
  website text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  website text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- roles (for RBAC)
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- permissions
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- role_permissions
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  UNIQUE (role_id, permission_id)
);

-- user_roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

-- organization_members
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role org_member_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- organization_invitations
CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role org_member_role NOT NULL DEFAULT 'member',
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  status invitation_status NOT NULL DEFAULT 'pending',
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text,
  record_id uuid,
  action audit_action NOT NULL,
  old_data jsonb,
  new_data jsonb,
  user_id uuid REFERENCES public.profiles(id),
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- quests (core for discovery / Radar)
CREATE TABLE public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  experience_class experience_class NOT NULL,
  location_name text,
  location_point geography(Point, 4326),
  location_radius_m integer,
  city text,
  country_code text,
  tags text[] NOT NULL DEFAULT '{}',
  is_sponsored boolean NOT NULL DEFAULT false,
  sponsor_id uuid,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_url text,
  status quest_status NOT NULL DEFAULT 'draft',
  sq_score numeric,
  sq_score_computed_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- quest_scoring_factors (SQ domain, from 008-013)
CREATE TABLE public.quest_scoring_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  uniqueness_score numeric NOT NULL DEFAULT 0,
  scarcity_score numeric NOT NULL DEFAULT 0,
  time_sensitivity_score numeric NOT NULL DEFAULT 0,
  discovery_likelihood numeric NOT NULL DEFAULT 0,
  community_signal numeric NOT NULL DEFAULT 0,
  seasonal_factor numeric NOT NULL DEFAULT 0,
  weather_factor numeric NOT NULL DEFAULT 0,
  distance_factor numeric NOT NULL DEFAULT 0,
  cooldown_factor numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quest_id)
);

-- quest_availability_windows
CREATE TABLE public.quest_availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  recurrence_rule text,
  capacity integer,
  remaining integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- dream_list
CREATE TABLE public.dream_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  status dream_list_status NOT NULL DEFAULT 'saved',
  priority integer NOT NULL DEFAULT 0,
  notes text,
  target_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_id)
);

-- quest_completions
CREATE TABLE public.quest_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  dream_list_id uuid REFERENCES public.dream_list(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  story text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  sq_score_at_completion numeric
);

-- quest_chains
CREATE TABLE public.quest_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  organization_id uuid REFERENCES public.organizations(id),
  is_platform_chain boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- quest_chain_steps
CREATE TABLE public.quest_chain_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES public.quest_chains(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  unlock_condition chain_unlock_condition NOT NULL DEFAULT 'manual',
  unlock_after_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, step_order)
);

-- pulse_alerts
CREATE TABLE public.pulse_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  triggered_by pulse_trigger NOT NULL,
  sq_score_at_trigger numeric,
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- user_quest_preferences
CREATE TABLE public.user_quest_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_classes experience_class[] NOT NULL DEFAULT '{}',
  preferred_tags text[] NOT NULL DEFAULT '{}',
  home_location geography(Point, 4326),
  max_distance_km numeric NOT NULL DEFAULT 50,
  pulse_enabled boolean NOT NULL DEFAULT true,
  pulse_min_sq_score numeric NOT NULL DEFAULT 70,
  pulse_frequency pulse_frequency NOT NULL DEFAULT 'daily',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.dream_list
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.quest_chains
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.user_quest_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- INDEXES
-- ============================================
-- Performance for common queries (list, filter, ownership)
CREATE INDEX IF NOT EXISTS idx_quests_status_published_at ON public.quests (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_quests_sq_score ON public.quests (sq_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_quests_created_by ON public.quests (created_by);
CREATE INDEX IF NOT EXISTS idx_quests_organization_id ON public.quests (organization_id);

CREATE INDEX IF NOT EXISTS idx_dream_list_user_status ON public.dream_list (user_id, status);
CREATE INDEX IF NOT EXISTS idx_dream_list_quest ON public.dream_list (quest_id);

CREATE INDEX IF NOT EXISTS idx_pulse_alerts_user ON public.pulse_alerts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_alerts_active ON public.pulse_alerts (user_id, dismissed_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_quest_chains_created_by ON public.quest_chains (created_by);
CREATE INDEX IF NOT EXISTS idx_quest_chain_steps_chain ON public.quest_chain_steps (chain_id, step_order);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members (organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs (user_id, created_at DESC);

-- PostGIS spatial index (critical for find_quests_nearby and Radar)
CREATE INDEX IF NOT EXISTS idx_quests_location_point ON public.quests USING GIST (location_point);

-- ============================================
-- REQUIRED FUNCTIONS / RPCs (pre-014/015)
-- ============================================

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(role_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND r.name = role_name
  );
END;
$$;

-- has_permission
CREATE OR REPLACE FUNCTION public.has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid()
      AND p.name = permission_name
  );
END;
$$;

-- is_org_member
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
  );
$$;

-- is_org_admin
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- create_organization (creates org + sets caller as owner member)
CREATE OR REPLACE FUNCTION public.create_organization(org_name text, org_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  owner_role_id uuid;
BEGIN
  -- Create the organization
  INSERT INTO organizations (name, slug, created_by)
  VALUES (org_name, org_slug, auth.uid())
  RETURNING id INTO new_org_id;

  -- Ensure 'owner' role exists (idempotent)
  INSERT INTO roles (name, description)
  VALUES ('owner', 'Organization owner')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO owner_role_id FROM roles WHERE name = 'owner';

  -- Add creator as owner member
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, auth.uid(), 'owner');

  RETURN new_org_id;
END;
$$;

-- log_audit_event
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_table_name text,
  p_record_id uuid,
  p_action audit_action,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    user_id,
    metadata
  ) VALUES (
    p_table_name,
    p_record_id,
    p_action,
    p_old_data,
    p_new_data,
    auth.uid(),
    p_metadata
  );
END;
$$;

-- Grant execute on public functions (common pattern)
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, uuid, audit_action, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================
-- RLS ENABLE + CORE POLICIES
-- ============================================

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and update their own profile"
  ON public.profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- organizations (readable by members via function; admin writes)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their organizations"
  ON public.organizations
  FOR SELECT
  USING (is_org_member(id));

CREATE POLICY "Org admins/owners can update their organizations"
  ON public.organizations
  FOR UPDATE
  USING (is_org_admin(id));

-- organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view memberships they belong to or via org admin"
  ON public.organization_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_org_admin(organization_id)
  );

CREATE POLICY "Org admins can manage members (except owners in some cases)"
  ON public.organization_members
  FOR ALL
  USING (is_org_admin(organization_id));

-- organization_invitations
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage invitations"
  ON public.organization_invitations
  FOR ALL
  USING (is_org_admin(organization_id));

-- roles / permissions / role_permissions (read mostly)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view roles" ON public.roles FOR SELECT TO authenticated USING (true);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- user_roles (users see their own; admins manage)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (user_id = auth.uid() OR has_role('admin'));

-- audit_logs (permission gated)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only users with audit.read can view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (has_permission('audit.read'));

-- quests (published visible; owners manage)
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published quests"
  ON public.quests
  FOR SELECT
  USING (status = 'published');

CREATE POLICY "Users can manage their own quests (including drafts)"
  ON public.quests
  FOR ALL
  USING (created_by = auth.uid());

-- quest_scoring_factors (protected, as per sqScoreService comments)
ALTER TABLE public.quest_scoring_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quest scoring factors are protected by RLS (server-side only)"
  ON public.quest_scoring_factors
  FOR ALL
  USING (false);  -- Effectively server-only; services note RLS protection

-- quest_availability_windows
ALTER TABLE public.quest_availability_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability windows visible for published quests"
  ON public.quest_availability_windows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quests q
      WHERE q.id = quest_id AND q.status = 'published'
    )
  );

-- dream_list (user owns)
ALTER TABLE public.dream_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own dream list items"
  ON public.dream_list
  FOR ALL
  USING (user_id = auth.uid());

-- quest_completions (user owns)
ALTER TABLE public.quest_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own quest completions"
  ON public.quest_completions
  FOR ALL
  USING (user_id = auth.uid());

-- quest_chains (creator / org)
ALTER TABLE public.quest_chains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public chains are viewable"
  ON public.quest_chains
  FOR SELECT
  USING (is_public OR created_by = auth.uid() OR is_org_member(organization_id));

CREATE POLICY "Creators and org admins manage chains"
  ON public.quest_chains
  FOR ALL
  USING (created_by = auth.uid() OR is_org_admin(organization_id));

-- quest_chain_steps (via parent chain ownership)
ALTER TABLE public.quest_chain_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Steps visible if parent chain is"
  ON public.quest_chain_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quest_chains qc
      WHERE qc.id = chain_id AND (qc.is_public OR qc.created_by = auth.uid() OR is_org_member(qc.organization_id))
    )
  );

-- pulse_alerts (user owns)
ALTER TABLE public.pulse_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own pulse alerts"
  ON public.pulse_alerts
  FOR ALL
  USING (user_id = auth.uid());

-- user_quest_preferences (user owns)
ALTER TABLE public.user_quest_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own quest preferences"
  ON public.user_quest_preferences
  FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- STORAGE BUCKET + POLICIES (avatars)
-- ============================================
-- Create the public avatars bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (on storage.objects)
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- End of base schema
-- Next: 014 and 015 (unchanged) add the find_quests_nearby RPC and lat/lng support.