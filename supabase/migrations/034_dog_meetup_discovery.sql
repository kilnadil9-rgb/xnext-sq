-- 034_dog_meetup_discovery.sql
-- Dog Meetups — step 5 of 5: discovery + trust handling.
--
-- REQUIRES 030 + 031 (enum value + dog_* columns).
--
--   Part A  find_quests_nearby: 023 verbatim EXCEPT
--             * dog meetups use the upcoming window (visible up to 14 days
--               before start, hidden after end) instead of "hidden until start";
--             * dog_size / dog_fenced / dog_leash_info / dog_parking_info are
--               returned (NULL for non-meetups);
--             * verified_location is always false and completed_count 0 for
--               meetups; external_url never travels on meetups.
--           Only status = 'published' rows are ever returned, so pending and
--           rejected meetups can never appear (the RPC is SECURITY INVOKER and
--           the table's RLS applies on top).
--           Timing for all other types is unchanged.
--   Part B  refresh_quest_verified_location (022 body) + a dog_meetup branch:
--           completing a meetup updates completed_count only. It never marks the
--           location "verified" and never grants trust points (creator +5 /
--           completer +1), because attendance is not verified.
--
-- Return-type change => DROP + CREATE (same pattern as 018/019/020/021/022/023).
-- Apply with: supabase db push. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── Part A ───────────────────────────────────────────────────────────────────
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
  -- Social proof (migration 022)
  completed_count integer,
  -- NEW (023): partner presentation. tier lets clients gate partner-only UI;
  -- external_url is safe (published = approved); ticket_url is tier-gated.
  tier public.listing_tier,
  external_url text,
  ticket_url text,
  -- NEW (034): Dog Meetup details (NULL for every other row)
  dog_size text,
  dog_fenced boolean,
  dog_leash_info text,
  dog_parking_info text
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
    -- Dog meetups are never "verified locations" and carry no explorer social
    -- proof: attendance is not verified.
    (q.verified_location AND q.listing_type IS DISTINCT FROM 'dog_meetup') AS verified_location,
    CASE WHEN q.listing_type = 'dog_meetup' THEN 0 ELSE q.completed_count END AS completed_count,
    q.tier,
    -- Links only travel on listings (never organic user quests on the map),
    -- and only for rows this RPC already filtered to published/approved.
    CASE WHEN q.listing_type IS NOT NULL AND q.listing_type <> 'dog_meetup' THEN q.external_url ELSE NULL END AS external_url,
    CASE WHEN q.tier = 'monthly_partner' THEN q.ticket_url ELSE NULL END AS ticket_url,
    CASE WHEN q.listing_type = 'dog_meetup' THEN q.dog_size END AS dog_size,
    CASE WHEN q.listing_type = 'dog_meetup' THEN q.dog_fenced END AS dog_fenced,
    CASE WHEN q.listing_type = 'dog_meetup' THEN q.dog_leash_info END AS dog_leash_info,
    CASE WHEN q.listing_type = 'dog_meetup' THEN q.dog_parking_info END AS dog_parking_info
  FROM public.quests q, cur
  WHERE q.status = 'published'
    AND q.location_point IS NOT NULL
    -- time window. Everything except dog meetups: future listings hidden,
    -- expired listings auto-disappear (unchanged from 023).
    -- Dog meetups: visible from 14 days BEFORE start (upcoming lead window)
    -- until the end time (expires_at; default start + 2h, set by the guard
    -- trigger). Rows stay 'published' after the end — they only drop out of
    -- active discovery, preserving completion history.
    AND (
      CASE WHEN q.listing_type = 'dog_meetup'
        THEN q.starts_at IS NOT NULL
             AND q.starts_at <= now() + interval '14 days'
             AND q.expires_at IS NOT NULL
             AND q.expires_at > now()
        ELSE (q.starts_at IS NULL OR q.starts_at <= now())
             AND (q.expires_at IS NULL OR q.expires_at > now())
      END
    )
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

-- ── Part B ───────────────────────────────────────────────────────────────────
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
  v_listing_type public.listing_type;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO v_unique_completers
  FROM public.quest_completions
  WHERE quest_id = v_quest_id;

  SELECT verified_location, created_by, listing_type
  INTO v_was_verified, v_creator, v_listing_type
  FROM public.quests
  WHERE id = v_quest_id;

  -- Dog meetups: social playdates, attendance is NOT verified. Keep the count,
  -- never verify, never award trust.
  IF v_listing_type = 'dog_meetup' THEN
    UPDATE public.quests
    SET completed_count = v_unique_completers
    WHERE id = v_quest_id
      AND completed_count IS DISTINCT FROM v_unique_completers;
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_now_verified := (v_unique_completers >= 3);

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

  -- Trust: +5 to the creator the moment their quest becomes Verified.
  IF v_now_verified AND NOT COALESCE(v_was_verified, false) AND v_creator IS NOT NULL THEN
    UPDATE public.profiles
    SET trust_score = trust_score + 5
    WHERE id = v_creator;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
