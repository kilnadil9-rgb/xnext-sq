-- 022_verified_adventure_system.sql
-- Phase 1 trust/safety polish — Verified Adventure System (builds on 021).
--
--   Part A: quests.completed_count — unique-completer count for social proof
--           ("12 explorers verified this location"). Stored on the quest row
--           because quest_completions RLS is owner-scoped, so clients cannot
--           count other users' completions directly.
--   Part B: profiles.trust_score — quiet, backend-only explorer credibility.
--           +1 per quest completed · +5 to the creator when their quest
--           becomes Verified. No UI reads it yet (future: faster approvals).
--   Part C: one sync trigger keeps completed_count + verified_location +
--           trust awards consistent (replaces 021's trigger function).
--   Part D: backfill counts and trust scores for existing data.
--   Part E: surface completed_count through find_quests_nearby.
--
-- Fake-quest protection stays structural: a quest with zero completions can
-- never verify, no matter how old it is. (Reporting flow is a future phase.)
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── Part A: unique-completer count on quests ─────────────────────────────────
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS completed_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quests.completed_count IS
  'Count of UNIQUE users who completed this quest (kept in sync by trg_refresh_verified_location). Drives social proof + verified_location (>= 3).';

-- ── Part B: quiet trust score on profiles ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_score integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.trust_score IS
  'Explorer credibility (backend-only for now): +1 per quest completed, +5 when an uploaded quest becomes Verified. Future: trusted users get faster approvals.';

-- ── Part C: unified sync trigger ─────────────────────────────────────────────
-- Replaces the 021 function body (same name + trigger, so 021 stays valid).
-- SECURITY DEFINER: completions RLS is owner-scoped; the recount/update of
-- quests + profiles must run with definer rights. Scope stays minimal.
CREATE OR REPLACE FUNCTION public.refresh_quest_verified_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quest_id uuid := COALESCE(NEW.quest_id, OLD.quest_id);
  v_unique_completers integer;
  v_was_verified boolean;
  v_now_verified boolean;
  v_creator uuid;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO v_unique_completers
  FROM public.quest_completions
  WHERE quest_id = v_quest_id;

  v_now_verified := (v_unique_completers >= 3);

  SELECT verified_location, created_by
  INTO v_was_verified, v_creator
  FROM public.quests
  WHERE id = v_quest_id;

  UPDATE public.quests
  SET completed_count = v_unique_completers,
      verified_location = v_now_verified
  WHERE id = v_quest_id
    AND (completed_count IS DISTINCT FROM v_unique_completers
         OR verified_location IS DISTINCT FROM v_now_verified);

  -- Trust: +1 to the completer per completion (floor 0 on delete).
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET trust_score = trust_score + 1
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET trust_score = GREATEST(trust_score - 1, 0)
    WHERE id = OLD.user_id;
  END IF;

  -- Trust: +5 to the creator the moment their quest becomes Verified
  -- (uploading quests that real explorers confirm = credibility).
  IF v_now_verified AND NOT COALESCE(v_was_verified, false) AND v_creator IS NOT NULL THEN
    UPDATE public.profiles
    SET trust_score = trust_score + 5
    WHERE id = v_creator;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger already exists from 021 (AFTER INSERT OR DELETE ON quest_completions,
-- FOR EACH ROW) and now runs the updated function. Recreate defensively:
DROP TRIGGER IF EXISTS trg_refresh_verified_location ON public.quest_completions;
CREATE TRIGGER trg_refresh_verified_location
  AFTER INSERT OR DELETE ON public.quest_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_quest_verified_location();

-- ── Part D: backfill ─────────────────────────────────────────────────────────
-- Counts + verified flags (idempotent).
UPDATE public.quests q
SET completed_count = sub.n,
    verified_location = (sub.n >= 3)
FROM (
  SELECT quest_id, COUNT(DISTINCT user_id) AS n
  FROM public.quest_completions
  GROUP BY quest_id
) sub
WHERE sub.quest_id = q.id
  AND (q.completed_count IS DISTINCT FROM sub.n
       OR q.verified_location IS DISTINCT FROM (sub.n >= 3));

-- Reset quests with zero remaining completions (stale counts after deletes).
UPDATE public.quests q
SET completed_count = 0,
    verified_location = false
WHERE (q.completed_count <> 0 OR q.verified_location)
  AND NOT EXISTS (
    SELECT 1 FROM public.quest_completions c WHERE c.quest_id = q.id
  );

-- Trust backfill: full recompute (idempotent — safe to re-run).
--   completions the user made (1 each) + verified quests they created (5 each).
UPDATE public.profiles p
SET trust_score = COALESCE(c.done, 0) + COALESCE(v.verified, 0) * 5
FROM public.profiles p2
LEFT JOIN (
  SELECT user_id, COUNT(*) AS done
  FROM public.quest_completions
  GROUP BY user_id
) c ON c.user_id = p2.id
LEFT JOIN (
  SELECT created_by, COUNT(*) AS verified
  FROM public.quests
  WHERE verified_location = true
  GROUP BY created_by
) v ON v.created_by = p2.id
WHERE p.id = p2.id
  AND p.trust_score IS DISTINCT FROM (COALESCE(c.done, 0) + COALESCE(v.verified, 0) * 5);

-- ── Part E: add completed_count to the nearby RPC ────────────────────────────
-- A return-type change requires DROP + CREATE. Everything from 021 preserved
-- verbatim — we only ADD completed_count.
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
  -- Verified Location (migration 021)
  verified_location boolean,
  -- NEW (Verified Adventure System): unique-completer social proof
  completed_count integer
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
    q.verified_location,
    q.completed_count
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
