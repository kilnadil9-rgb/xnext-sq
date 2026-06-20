-- 018_paid_listings.sql
-- Paid, time-sensitive listings for XNEXT (yard sales, local events, business
-- promos, market shows, community events).
--
-- Design: EXTEND public.quests (additive, non-breaking) so listings reuse the
-- existing map RPC, markers, ranking, preview card, and admin review. Organic
-- adventures have listing_type = NULL and are unaffected.
--
-- Moderation: listings are created as status = 'pending_review' and only become
-- visible after an admin sets status = 'published' (approve). Payment is tracked
-- separately via payment_status; the public RPC requires paid + in-window.
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run (guards via IF NOT EXISTS / DO blocks).

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.listing_type AS ENUM
    ('yard_sale', 'local_event', 'business_promo', 'market_show', 'community_event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_tier AS ENUM
    ('yard_sale', 'local_event', 'business_spotlight', 'featured_business', 'monthly_partner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM
    ('unpaid', 'pending', 'paid', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Columns (all additive; organic quests keep defaults) ─────────────────────
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS listing_type      public.listing_type,
  ADD COLUMN IF NOT EXISTS is_paid_listing   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier              public.listing_tier,
  ADD COLUMN IF NOT EXISTS price_paid        numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_status    public.payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS stripe_payment_id text,
  ADD COLUMN IF NOT EXISTS starts_at         timestamptz,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS contact_email     text,
  ADD COLUMN IF NOT EXISTS contact_phone     text;
-- Reused existing columns: created_by (submitted_by), location_name (address),
-- location_point (lat/lng), expires_at, status (moderation), created_at/updated_at.

-- Helps the time-window + featured query.
CREATE INDEX IF NOT EXISTS idx_quests_listing_window
  ON public.quests (status, starts_at, expires_at)
  WHERE listing_type IS NOT NULL;

-- ── Admin moderation RLS (the long-missing piece) ────────────────────────────
-- Lets admins SELECT + UPDATE ALL quests/listings so they can review submissions
-- from other users. Relies on profiles.is_admin (boolean).
DO $$ BEGIN
  CREATE POLICY "Admins can view all quests" ON public.quests
    FOR SELECT
    USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update any quest" ON public.quests
    FOR UPDATE
    USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── find_quests_nearby: time-window + paid gate + featured boost + new cols ──
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
  expires_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    q.id, q.title, q.slug, q.description, q.experience_class, q.status,
    q.location_name, q.city, q.country_code, q.sq_score, q.published_at,
    (ST_Distance(q.location_point, ST_MakePoint(p_lng, p_lat)::geography) / 1000.0) AS distance_km,
    ST_Y(q.location_point::geometry) AS lat,
    ST_X(q.location_point::geometry) AS lng,
    q.listing_type, q.is_featured, q.starts_at, q.expires_at
  FROM public.quests q
  WHERE q.status = 'published'
    AND q.location_point IS NOT NULL
    -- time window: future listings hidden, expired listings auto-disappear.
    AND (q.starts_at IS NULL OR q.starts_at <= now())
    AND (q.expires_at IS NULL OR q.expires_at > now())
    -- paid listings only show once payment has settled.
    AND (q.is_paid_listing = false OR q.payment_status = 'paid')
    AND ST_DWithin(
      q.location_point,
      ST_MakePoint(p_lng, p_lat)::geography,
      p_radius_km * 1000.0
    )
  ORDER BY
    -- Featured tiers rank slightly higher (~treated as 500 m closer) without
    -- burying genuinely nearby organic adventures.
    (ST_Distance(q.location_point, ST_MakePoint(p_lng, p_lat)::geography) / 1000.0
       - CASE WHEN q.is_featured THEN 0.5 ELSE 0 END) ASC,
    q.sq_score DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;
