-- 015_find_quests_nearby_latlng.sql
-- Adds lat/lng output columns to find_quests_nearby so the map screen can
-- place markers. Everything else (filters, ordering, security posture)
-- matches 014_find_quests_nearby_rpc.sql exactly:
--   - SECURITY INVOKER (default), RLS of caller applies
--   - Explicit status = 'published' AND location_point IS NOT NULL
--   - ST_DWithin radius filter (km -> meters), distance_km computed
--
-- A return-type change requires DROP + CREATE (CREATE OR REPLACE cannot
-- change OUT columns).

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
  lng double precision
)
LANGUAGE sql
STABLE
-- SECURITY INVOKER (default) - respects RLS of caller + explicit published filter
AS $$
  SELECT
    q.id,
    q.title,
    q.slug,
    q.description,
    q.experience_class,
    q.status,
    q.location_name,
    q.city,
    q.country_code,
    q.sq_score,
    q.published_at,
    (ST_Distance(q.location_point, ST_MakePoint(p_lng, p_lat)::geography) / 1000.0) AS distance_km,
    ST_Y(q.location_point::geometry) AS lat,
    ST_X(q.location_point::geometry) AS lng
  FROM public.quests q
  WHERE q.status = 'published'
    AND q.location_point IS NOT NULL
    AND ST_DWithin(
      q.location_point,
      ST_MakePoint(p_lng, p_lat)::geography,
      p_radius_km * 1000.0
    )
  ORDER BY
    distance_km ASC,
    q.sq_score DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Optional grants (uncomment/adjust in real env if needed beyond RLS):
-- GRANT EXECUTE ON FUNCTION public.find_quests_nearby(double precision, double precision, double precision, integer, integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.find_quests_nearby(double precision, double precision, double precision, integer, integer) TO anon;
