-- 019_seasonal_and_parking.sql
-- XNEXT Phase 1.8 — Seasonal Experience System (Part 1) + Parking/Experience
-- coordinates (Part 4).
--
-- Design: EXTEND public.quests (additive, non-breaking) so seasonal experiences
-- reuse the existing map RPC, markers, ranking, preview card, and admin review.
-- Experiences with no seasonal data behave exactly as before (is_evergreen
-- defaults true).
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run (guards via IF NOT EXISTS / DROP+CREATE on the function).
--
-- PostGIS note: on Supabase, PostGIS is installed in the dedicated `extensions`
-- schema, which is not always on the migration runner's search_path. So the
-- geography/geometry types and ST_* functions are schema-qualified with
-- `extensions.` below to avoid "type geography does not exist" errors.

-- Ensure PostGIS is available (idempotent; lives in the extensions schema).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── Part 1: Seasonal columns ─────────────────────────────────────────────────
--   season_tags    : human/UI labels — 'spring' | 'summer' | 'fall' | 'winter'
--   active_months  : canonical machine-readable months (1-12) the experience is
--                    "in season"; the source of truth for seasonal ranking.
--   start_date /
--   end_date       : explicit date window for one-off / date-based experiences
--                    (meteor showers, festivals, super-blooms).
--   priority_boost : admin curation knob — pulls an experience higher on radar.
--   is_evergreen   : true = relevant year-round (default; preserves old behavior).
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS season_tags    text[]    NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS active_months  integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS start_date     timestamptz,
  ADD COLUMN IF NOT EXISTS end_date       timestamptz,
  ADD COLUMN IF NOT EXISTS priority_boost integer   NOT NULL DEFAULT 0,
  -- Part 4: optional parking coordinate (drive-to point). The experience itself
  -- still lives in location_point (required); parking is the navigation target
  -- when present (e.g. trailhead lot for a hike-in viewpoint).
  ADD COLUMN IF NOT EXISTS parking_point  extensions.geography(Point, 4326);

-- is_evergreen added separately so we can backfill existing rows to TRUE before
-- enforcing NOT NULL (older rows predate the column).
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS is_evergreen boolean;
UPDATE public.quests SET is_evergreen = true WHERE is_evergreen IS NULL;
ALTER TABLE public.quests
  ALTER COLUMN is_evergreen SET DEFAULT true,
  ALTER COLUMN is_evergreen SET NOT NULL;

-- Guard rails: months must be 1..12.
DO $$ BEGIN
  ALTER TABLE public.quests
    ADD CONSTRAINT quests_active_months_range
    CHECK (active_months <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for seasonal filtering / overlap queries.
CREATE INDEX IF NOT EXISTS idx_quests_active_months
  ON public.quests USING gin (active_months);
CREATE INDEX IF NOT EXISTS idx_quests_season_tags
  ON public.quests USING gin (season_tags);
CREATE INDEX IF NOT EXISTS idx_quests_season_window
  ON public.quests (start_date, end_date)
  WHERE start_date IS NOT NULL;

-- ── find_quests_nearby: add seasonal fields + parking + seasonal ranking ─────
-- A return-type change requires DROP + CREATE (CREATE OR REPLACE cannot change
-- OUT columns). Everything from 018 is preserved (time window, paid gate,
-- featured boost); we add seasonal awareness and parking coordinates.
--
-- seasonal_rank (lower = surfaced first), per Phase 1.8 discovery logic:
--   0 = active seasonal      (current month ∈ active_months)
--   1 = active date-based    (now within start_date..end_date)
--   2 = evergreen            (relevant year-round)
--   3 = inactive seasonal    (seasonal/date-based but out of season)
DROP FUNCTION IF EXISTS public.find_quests_nearby(
  double precision, double precision, double precision, integer, integer
);

CREATE FUNCTION public.find_quests_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  description text,
  experience_class public.experience_class,
  status public.quest_status,
  location_name text,
  city text,
  country_code text,
  sq_score numeric,
  published_at timestamptz,
  distance_km double precision,
  lat double precision,
  lng double precision,
  listing_type public.listing_type,
  is_featured boolean,
  starts_at timestamptz,
  expires_at timestamptz,
  -- Seasonal (Phase 1.8)
  season_tags text[],
  active_months integer[],
  start_date timestamptz,
  end_date timestamptz,
  priority_boost integer,
  is_evergreen boolean,
  seasonal_active boolean,
  seasonal_rank integer,
  -- Parking (Phase 1.8)
  parking_lat double precision,
  parking_lng double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH cur AS (SELECT extract(month FROM now())::int AS m)
  SELECT
    q.id, q.title, q.slug, q.description, q.experience_class, q.status,
    q.location_name, q.city, q.country_code, q.sq_score, q.published_at,
    (extensions.ST_Distance(q.location_point, extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography) / 1000.0) AS distance_km,
    extensions.ST_Y(q.location_point::extensions.geometry) AS lat,
    extensions.ST_X(q.location_point::extensions.geometry) AS lng,
    q.listing_type, q.is_featured, q.starts_at, q.expires_at,
    q.season_tags, q.active_months, q.start_date, q.end_date,
    q.priority_boost, q.is_evergreen,
    (
      (cur.m = ANY(COALESCE(q.active_months, '{}')))
      OR (q.start_date IS NOT NULL AND q.end_date IS NOT NULL
          AND now() >= q.start_date AND now() <= q.end_date)
    ) AS seasonal_active,
    CASE
      WHEN cur.m = ANY(COALESCE(q.active_months, '{}')) THEN 0
      WHEN q.start_date IS NOT NULL AND q.end_date IS NOT NULL
           AND now() >= q.start_date AND now() <= q.end_date THEN 1
      WHEN q.is_evergreen THEN 2
      ELSE 3
    END AS seasonal_rank,
    extensions.ST_Y(q.parking_point::extensions.geometry) AS parking_lat,
    extensions.ST_X(q.parking_point::extensions.geometry) AS parking_lng
  FROM public.quests q, cur
  WHERE q.status = 'published'
    AND q.location_point IS NOT NULL
    -- time window: future listings hidden, expired listings auto-disappear.
    AND (q.starts_at IS NULL OR q.starts_at <= now())
    AND (q.expires_at IS NULL OR q.expires_at > now())
    -- paid listings only show once payment has settled.
    AND (q.is_paid_listing = false OR q.payment_status = 'paid')
    AND extensions.ST_DWithin(
      q.location_point,
      extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography,
      p_radius_km * 1000.0
    )
  ORDER BY
    -- 1) Seasonal relevance tier (active seasonal → date-based → evergreen →
    --    out-of-season), per the Phase 1.8 discovery spec.
    seasonal_rank ASC,
    -- 2) Distance, with featured tiers and admin priority_boost pulling closer.
    (extensions.ST_Distance(q.location_point, extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography) / 1000.0
       - CASE WHEN q.is_featured THEN 0.5 ELSE 0 END
       - LEAST(GREATEST(q.priority_boost, 0), 5) * 0.2) ASC,
    q.sq_score DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Grants mirror prior migrations' posture (RLS still applies; SECURITY INVOKER).
-- GRANT EXECUTE ON FUNCTION public.find_quests_nearby(double precision, double precision, double precision, integer, integer) TO authenticated, anon;
