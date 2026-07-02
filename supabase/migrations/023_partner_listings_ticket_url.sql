-- 023_partner_listings_ticket_url.sql
-- Monthly Local Partner upgrade + ticket links (Phase 1 paid-listings polish).
--
--   Part A: quests.ticket_url — optional "Buy Tickets" link, intended ONLY for
--           approved Monthly Local Partner listings (Toyota Center events,
--           concerts, race events, major venues). App layer restricts writes;
--           the RPC below gates reads so it can never leak onto free quests.
--   Part B: surface tier / external_url / ticket_url through find_quests_nearby
--           so the map cards can render partner presentation.
--
-- Approval safety: find_quests_nearby only returns status = 'published' rows,
-- and paid listings are born 'pending_review' — so any link the map ever sees
-- has already passed admin approval. ticket_url is additionally gated to the
-- monthly_partner tier at the SQL level.
--
-- Everything from 022 preserved verbatim — we only ADD output columns.
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── Part A: ticket_url column ────────────────────────────────────────────────
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS ticket_url text;

COMMENT ON COLUMN public.quests.ticket_url IS
  'Optional ticket purchase link (Monthly Local Partner tier only). Shown as a "Buy Tickets" button after admin approval; never rendered on free/user quests.';

-- ── Part B: tier + links through the nearby RPC ──────────────────────────────
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
  -- Verified Location (migration 021)
  verified_location boolean,
  -- Social proof (migration 022)
  completed_count integer,
  -- NEW (023): partner presentation. tier lets clients gate partner-only UI;
  -- external_url is safe (published = approved); ticket_url is tier-gated.
  tier public.listing_tier,
  external_url text,
  ticket_url text
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
    q.completed_count,
    q.tier,
    -- Links only travel on listings (never organic user quests on the map),
    -- and only for rows this RPC already filtered to published/approved.
    CASE WHEN q.listing_type IS NOT NULL THEN q.external_url ELSE NULL END AS external_url,
    CASE WHEN q.tier = 'monthly_partner' THEN q.ticket_url ELSE NULL END AS ticket_url
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
