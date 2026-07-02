-- 025_command_center.sql
-- XNEXT Command Center (final Phase 1 push) — additive only.
--
-- Extends admin_map_listings (024) with business_name so the Command Center's
-- global search can match venues/businesses/partners by name. Everything else
-- is preserved verbatim; same SECURITY INVOKER posture (admin RLS = full
-- visibility, non-admins get nothing beyond what they can already read).
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS public.admin_map_listings(integer);

CREATE FUNCTION public.admin_map_listings(p_limit integer DEFAULT 2000)
RETURNS TABLE (
  id uuid,
  title text,
  status public.quest_status,
  experience_class public.experience_class,
  listing_type public.listing_type,
  tier public.listing_tier,
  is_featured boolean,
  is_paid_listing boolean,
  payment_status public.payment_status,
  verified_location boolean,
  completed_count integer,
  city text,
  country_code text,
  location_name text,
  created_at timestamptz,
  published_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  lat double precision,
  lng double precision,
  media_urls jsonb,
  external_url text,
  ticket_url text,
  created_by uuid,
  creator_trust_score integer,
  -- NEW (025): venue/business name for Command Center global search
  business_name text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    q.id,
    q.title,
    q.status,
    q.experience_class,
    q.listing_type,
    q.tier,
    q.is_featured,
    q.is_paid_listing,
    q.payment_status,
    q.verified_location,
    q.completed_count,
    q.city,
    q.country_code,
    q.location_name,
    q.created_at,
    q.published_at,
    q.starts_at,
    q.expires_at,
    extensions.ST_Y(q.location_point::extensions.geometry) AS lat,
    extensions.ST_X(q.location_point::extensions.geometry) AS lng,
    q.media_urls,
    q.external_url,
    q.ticket_url,
    q.created_by,
    p.trust_score AS creator_trust_score,
    q.business_name
  FROM public.quests q
  LEFT JOIN public.profiles p ON p.id = q.created_by
  WHERE q.location_point IS NOT NULL
  ORDER BY q.created_at DESC
  LIMIT p_limit;
$$;
