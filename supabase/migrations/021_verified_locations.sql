-- 021_verified_locations.sql
-- Phase 1 trust/safety polish — Verified Locations.
--
-- Concept: a quest starts Unverified. Once 3 DIFFERENT users have completed
-- it, the location becomes Verified (verified_location = true) and the UI
-- shows a blue checkmark badge near the quest title.
--
--   Part A: quests.verified_location column
--   Part B: trigger on quest_completions keeps the flag in sync
--           (verified_location = true once completed_count >= 3 unique users)
--   Part C: backfill existing quests
--   Part D: surface verified_location through find_quests_nearby
--           (everything from 020 preserved verbatim — we only ADD the column)
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── Part A: verified_location flag on quests ─────────────────────────────────
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS verified_location boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quests.verified_location IS
  'True once >= 3 unique users have completed this quest (kept in sync by trg_refresh_verified_location). Community proof the pin + experience are real.';

-- ── Part B: sync trigger ─────────────────────────────────────────────────────
-- SECURITY DEFINER: quest_completions RLS is owner-scoped and completers are
-- not the quest owner, so the recount/update must run with definer rights.
-- Scope is minimal: recounts one quest and sets one boolean.
CREATE OR REPLACE FUNCTION public.refresh_quest_verified_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quest_id uuid := COALESCE(NEW.quest_id, OLD.quest_id);
  v_unique_completers integer;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO v_unique_completers
  FROM public.quest_completions
  WHERE quest_id = v_quest_id;

  UPDATE public.quests
  SET verified_location = (v_unique_completers >= 3)
  WHERE id = v_quest_id
    AND verified_location IS DISTINCT FROM (v_unique_completers >= 3);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_verified_location ON public.quest_completions;
CREATE TRIGGER trg_refresh_verified_location
  AFTER INSERT OR DELETE ON public.quest_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_quest_verified_location();

-- ── Part C: backfill ─────────────────────────────────────────────────────────
UPDATE public.quests q
SET verified_location = true
WHERE verified_location = false
  AND (
    SELECT COUNT(DISTINCT c.user_id)
    FROM public.quest_completions c
    WHERE c.quest_id = q.id
  ) >= 3;

-- ── Part D: add verified_location to the nearby RPC ──────────────────────────
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
  -- Image gallery (migration 020)
  media_urls jsonb,
  -- NEW (Phase 1 trust/safety): community-verified location badge
  verified_location boolean
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
    q.media_urls,
    q.verified_location
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
