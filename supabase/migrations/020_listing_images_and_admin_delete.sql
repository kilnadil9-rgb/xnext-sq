-- 020_listing_images_and_admin_delete.sql
-- Phase 1 admin listings — finishing touches:
--   Part A: surface media_urls through find_quests_nearby so listing/quest
--           images can render on the map preview + detail cards. Everything
--           from 019 is preserved verbatim (time window, paid gate, featured
--           boost, seasonal ranking, parking) — we only ADD media_urls.
--   Part B: admin DELETE policy on quests so admins can remove any listing
--           (creation/edit already covered by 018's admin UPDATE + the
--           owner "manage your own" policy from 001).
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run.
--
-- PostGIS note (same as 019): ST_* + geography/geometry are schema-qualified
-- with `extensions.` because PostGIS lives in the extensions schema on Supabase.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── Part A: add media_urls to the nearby RPC ─────────────────────────────────
-- A return-type change requires DROP + CREATE.
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
  parking_lng double precision,
  -- NEW (Phase 1 listings): image gallery for map preview + detail cards
  media_urls jsonb
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
    extensions.ST_X(q.parking_point::extensions.geometry) AS parking_lng,
    q.media_urls
  FROM public.quests q, cur
  WHERE q.status = 'published'
    AND q.location_point IS NOT NULL
    -- time window: future listings hidden, expired listings auto-disappear.
    AND (q.starts_at IS NULL OR q.starts_at <= now())
    AND (q.expires_at IS NULL OR q.expires_at > now())
    -- paid listings only show once payment has settled (admin/free pass through).
    AND (q.is_paid_listing = false OR q.payment_status = 'paid')
    AND extensions.ST_DWithin(
      q.location_point,
      extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography,
      p_radius_km * 1000.0
    )
  ORDER BY
    seasonal_rank ASC,
    (extensions.ST_Distance(q.location_point, extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography) / 1000.0
       - CASE WHEN q.is_featured THEN 0.5 ELSE 0 END
       - LEAST(GREATEST(q.priority_boost, 0), 5) * 0.2) ASC,
    q.sq_score DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Grants mirror prior migrations' posture (RLS still applies; SECURITY INVOKER).
-- GRANT EXECUTE ON FUNCTION public.find_quests_nearby(double precision, double precision, double precision, integer, integer) TO authenticated, anon;

-- ── Part B: admins can delete any quest/listing ──────────────────────────────
-- 001 lets owners manage their own rows; 018 added admin SELECT + UPDATE.
-- This completes admin moderation with DELETE (e.g. pulling a bad listing).
DO $$ BEGIN
  CREATE POLICY "Admins can delete any quest" ON public.quests
    FOR DELETE
    USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
