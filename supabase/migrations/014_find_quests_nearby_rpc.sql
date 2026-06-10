-- 014_find_quests_nearby_rpc.sql
-- Adds the find_quests_nearby RPC required for questService.getNearbyQuests().
-- Uses PostGIS for geospatial filtering and distance calc on quests.location_point (geography).
-- Assumes:
--   - PostGIS extension already enabled (from prior migrations, e.g. 009_quests_core or extensions).
--   - quests table has: location_point geography, status, sq_score, published_at, etc.
--   - Spatial index on location_point exists (per prior reviews).
-- Does NOT modify any tables or weaken RLS.
--
-- Security:
--   - Uses default SECURITY INVOKER so that RLS policies of the calling user apply.
--   - Explicit WHERE status = 'published' AND location_point IS NOT NULL ensures
--     unpublished quests are never returned, even if RLS is permissive or bypassed.
--   - No SECURITY DEFINER used (not required here; keeps RLS behavior intact).
--   - search_path not overridden (default safe for this context).
--
-- Compatible with client calls from authenticated/anon users that already
-- successfully list published quests via .from('quests').

CREATE OR REPLACE FUNCTION public.find_quests_nearby(
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
  distance_km double precision
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
    (ST_Distance(q.location_point, ST_MakePoint(p_lng, p_lat)::geography) / 1000.0) AS distance_km
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
