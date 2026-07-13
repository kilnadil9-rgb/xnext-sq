-- harness_shim.sql — local test scaffolding for migration 027 (dev/test ONLY).
--
-- Recreates just enough of the Supabase environment to apply and exercise
-- 027 against a plain Postgres server (no Supabase stack, no PostGIS binary):
--   * auth schema + auth.uid() reading request.jwt.claim.sub (the standard
--     local-testing shim — identical semantics to Supabase's auth.uid())
--   * anon / authenticated roles with Supabase-style default table grants
--   * an `extensions` schema with a haversine ST_DWithin + ST_MakePoint +
--     a geography domain over point (drop-in for the one PostGIS call 027
--     makes; production uses real PostGIS)
--   * minimal public tables 027 depends on (profiles, quests,
--     quest_completions, dream_list) with the columns 027 touches
--
-- NEVER apply this to any Supabase project. It exists so RLS + concurrency
-- tests (see tests/db/markerDb.test.mjs) run against a real database.

-- ── Roles (idempotent) ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── auth.uid() shim ───────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- ── extensions schema: PostGIS stand-ins (haversine) ─────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  CREATE DOMAIN extensions.geography AS point;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- point is stored as (lng, lat), matching ST_MakePoint(lng, lat).
CREATE OR REPLACE FUNCTION extensions.ST_MakePoint(lng double precision, lat double precision)
RETURNS point LANGUAGE sql IMMUTABLE AS $$ SELECT point(lng, lat); $$;

CREATE OR REPLACE FUNCTION extensions.ST_DWithin(
  a extensions.geography, b extensions.geography, meters double precision
)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000.0 * asin(sqrt(
    power(sin(radians(((b::point)[1] - (a::point)[1]) / 2)), 2) +
    cos(radians((a::point)[1])) * cos(radians((b::point)[1])) *
    power(sin(radians(((b::point)[0] - (a::point)[0]) / 2)), 2)
  )) <= meters;
$$;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;

-- ── Minimal public tables 027 depends on ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  username text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'published',
  location_point extensions.geography,
  location_radius_m integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quest_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  explorer_note text,
  is_public boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.dream_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'saved',
  completed_at timestamptz
);

-- Supabase-style default grants: roles can touch tables, RLS restricts.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated;

-- Owner-scoped RLS on completions (mirrors 001's production policy).
ALTER TABLE public.quest_completions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage their own quest completions"
    ON public.quest_completions FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
