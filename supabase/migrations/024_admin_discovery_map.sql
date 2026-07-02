-- 024_admin_discovery_map.sql
-- Admin Discovery Map — nationwide moderation view.
--
-- One RPC that returns EVERY quest/listing with a coordinate (any status),
-- with the fields the moderation map needs: status, listing/tier flags,
-- verified badge, photos, partner links, and the creator's trust score.
--
-- Security: SECURITY INVOKER — the caller's RLS applies. Admins see all rows
-- via the 018 "Admins can view all quests" policy; a non-admin calling this
-- RPC only gets rows they could already SELECT (published + their own), so
-- nothing new is exposed. The page itself is additionally admin-gated in-app.
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
  /** Creator credibility (migration 022); null if the profile isn't visible. */
  creator_trust_score integer
)
LANGUAGE sql
STABLE
-- SECURITY INVOKER (default): admin RLS gives full visibility, others get
-- nothing beyond what they can already read.
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
    p.trust_score AS creator_trust_score
  FROM public.quests q
  LEFT JOIN public.profiles p ON p.id = q.created_by
  WHERE q.location_point IS NOT NULL
  ORDER BY q.created_at DESC
  LIMIT p_limit;
$$;
