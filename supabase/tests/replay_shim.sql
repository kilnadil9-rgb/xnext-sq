-- replay_shim.sql — local test scaffolding to REPLAY the repo migrations
-- (001, 014–027, 029, 030+) on plain Postgres with no Supabase stack (dev/test ONLY).
--
-- Used by tests/db/dogMeetupDb.test.mjs, which also rewrites a few PostGIS-only
-- constructs while replaying (see `adaptSql` there). Provides:
--   * anon / authenticated / service_role roles with Supabase-style grants
--   * auth.uid() (reads request.jwt.claim.sub) and an auth.users stub
--   * storage.buckets / storage.objects stubs (+ foldername/extension helpers)
--     with RLS enabled on storage.objects, like Supabase
--   * PostGIS stand-ins in `public` (domain over point + haversine ST_*)
--
-- Storage here is the SQL layer only (bucket flags + RLS policies). It does NOT
-- exercise the Storage HTTP API, MIME sniffing or the real file_size_limit
-- enforcement. NEVER apply this to a Supabase project.

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- ── auth ──────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ── storage ───────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END $$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;

-- ── PostGIS stand-ins (in public, where `CREATE EXTENSION postgis` puts them) ─
-- geography/geometry are domains over point stored as (lng, lat).
CREATE DOMAIN public.geography AS point;
CREATE DOMAIN public.geometry AS point;

CREATE FUNCTION public.ST_MakePoint(lng double precision, lat double precision)
RETURNS point LANGUAGE sql IMMUTABLE AS $$ SELECT point(lng, lat); $$;

CREATE FUNCTION public.ST_Distance(a public.geography, b public.geography)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000.0 * asin(sqrt(
    power(sin(radians(((b::point)[1] - (a::point)[1]) / 2)), 2) +
    cos(radians((a::point)[1])) * cos(radians((b::point)[1])) *
    power(sin(radians(((b::point)[0] - (a::point)[0]) / 2)), 2)
  ));
$$;

CREATE FUNCTION public.ST_DWithin(a public.geography, b public.geography, meters double precision)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT public.ST_Distance(a, b) <= meters; $$;

CREATE FUNCTION public.ST_X(g public.geometry) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$ SELECT (g::point)[0]; $$;
CREATE FUNCTION public.ST_Y(g public.geometry) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$ SELECT (g::point)[1]; $$;
