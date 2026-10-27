-- 031_dog_meetups.sql
-- Dog Meetups (social dog playdates) — step 2 of 5: schema, server-enforced
-- moderation, and the admin approve/reject RPCs.
--
-- REQUIRES 030 (enum value 'dog_meetup') to be applied + committed first.
--
-- What this does
--   Part A  Typed meetup columns on public.quests (+ CHECK constraints so the
--           database itself rejects malformed meetups).
--   Part B  is_admin_user() helper.
--   Part C  Guard trigger on public.quests. For dog_meetup rows ONLY:
--             * non-admins may only ever write status draft / pending_review
--               (closes self-publish for meetups — RLS alone cannot, because
--               the 001 owner policy is FOR ALL with no status guard);
--             * approved (published) / archived meetups are frozen for
--               non-admins (no bait-and-switch after review);
--             * paid/featured/contact/link/verified fields are forced to
--               safe values; public media_urls must stay empty until approval;
--             * the pending photo path must live in the owner's own folder;
--             * start/end time sanity + default expiry (start + 2 hours).
--           Rows of every OTHER listing type / organic quests are untouched.
--   Part D  Restrictive RLS policy (defense in depth with the trigger).
--   Part E  admin approve_dog_meetup / reject_dog_meetup RPCs.
--
-- Not changed here: the auto-publish behaviour of Discover / organic quests.
-- See docs/dog-meetups.md ("Self-publish for other quest types") for the
-- separate, proposed hardening.
--
-- Safe to re-run.

-- ── Part A: columns + constraints ────────────────────────────────────────────
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS dog_size               text,
  ADD COLUMN IF NOT EXISTS dog_fenced             boolean,
  ADD COLUMN IF NOT EXISTS dog_leash_info         text,
  ADD COLUMN IF NOT EXISTS dog_parking_info       text,
  -- Path inside the PRIVATE bucket meetup-photos-pending ("{uid}/{file}").
  -- Never a URL. Cleared on approve (photo moves to the public bucket) / reject.
  ADD COLUMN IF NOT EXISTS dog_photo_pending_path text;

COMMENT ON COLUMN public.quests.dog_photo_pending_path IS
  'Dog Meetups: object path in the private bucket meetup-photos-pending. Not a public URL. Cleared on approve/reject.';

DO $$ BEGIN
  ALTER TABLE public.quests ADD CONSTRAINT quests_dog_meetup_fields_chk CHECK (
    (dog_leash_info IS NULL OR char_length(dog_leash_info) <= 160)
    AND (dog_parking_info IS NULL OR char_length(dog_parking_info) <= 160)
    AND (dog_size IS NULL OR dog_size IN ('small', 'medium', 'large', 'all'))
    AND (
      listing_type IS DISTINCT FROM 'dog_meetup'
      OR (
        dog_size IS NOT NULL
        AND char_length(btrim(title)) BETWEEN 3 AND 80
        AND description IS NOT NULL
        AND char_length(btrim(description)) BETWEEN 1 AND 500
        AND location_name IS NOT NULL
        AND char_length(btrim(location_name)) BETWEEN 1 AND 120
        AND location_point IS NOT NULL
        AND starts_at IS NOT NULL
        AND expires_at IS NOT NULL
        AND expires_at > starts_at
        AND expires_at <= starts_at + interval '24 hours'
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Part B: admin helper ─────────────────────────────────────────────────────
-- profiles.is_admin is referenced by the 018/020/025/027 admin policies but is
-- not created by any migration in this repo (it exists in the live DB). The
-- guard below is a no-op where the column already exists.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon, authenticated;

-- ── Part C: guard trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.quests_dog_meetup_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_meetup boolean;
BEGIN
  v_is_meetup := NEW.listing_type IS NOT DISTINCT FROM 'dog_meetup'
    OR (TG_OP = 'UPDATE' AND OLD.listing_type IS NOT DISTINCT FROM 'dog_meetup');
  IF NOT v_is_meetup THEN
    RETURN NEW;  -- every other quest / listing type: completely untouched
  END IF;

  -- A listing_type may never be switched to/from dog_meetup after creation by
  -- a non-admin (would be a way around the rules below).
  IF TG_OP = 'UPDATE'
     AND NEW.listing_type IS DISTINCT FROM OLD.listing_type
     AND v_uid IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'dog meetup type cannot be changed' USING ERRCODE = '42501';
  END IF;

  -- Meetups are never "verified locations" (no attendance verification).
  NEW.verified_location := false;

  -- Nested trigger context (e.g. the verified-location/completed_count sync on
  -- quest_completions). Allow ONLY if moderation-relevant fields are unchanged.
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.listing_type IS DISTINCT FROM OLD.listing_type
       OR NEW.dog_photo_pending_path IS DISTINCT FROM OLD.dog_photo_pending_path
       OR NEW.media_urls IS DISTINCT FROM OLD.media_urls THEN
      RAISE EXCEPTION 'dog meetup moderation fields cannot change from a nested trigger'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Default expiry: end time omitted => start + 2 hours (documented).
  IF NEW.expires_at IS NULL AND NEW.starts_at IS NOT NULL THEN
    NEW.expires_at := NEW.starts_at + interval '2 hours';
  END IF;

  -- Service role / SQL editor / migrations (no end-user JWT) and admins are
  -- trusted from here on. Everyone else is constrained below.
  IF v_uid IS NULL OR public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  -- Non-admin: may not touch an approved/archived meetup at all.
  IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('draft', 'pending_review') THEN
    RAISE EXCEPTION 'this dog meetup has been reviewed and can only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  -- Non-admin: only draft / pending_review. Never published, never archived.
  IF NEW.status NOT IN ('draft', 'pending_review') THEN
    RAISE EXCEPTION 'dog meetups must be approved by an admin before they are published'
      USING ERRCODE = '42501';
  END IF;

  -- Non-admin: force every privileged / commercial / contact field to a safe value.
  NEW.published_at       := NULL;
  NEW.is_featured        := false;
  NEW.is_paid_listing    := false;
  NEW.payment_status     := 'unpaid';
  NEW.tier               := NULL;
  NEW.price_paid         := NULL;
  NEW.stripe_payment_id  := NULL;
  NEW.priority_boost     := 0;
  NEW.is_sponsored       := false;
  NEW.sponsor_id         := NULL;
  NEW.external_url       := NULL;
  NEW.ticket_url         := NULL;
  NEW.business_name      := NULL;
  NEW.contact_email      := NULL;
  NEW.contact_phone      := NULL;
  NEW.organization_id    := NULL;
  -- Pending meetups never carry a public image URL; the approved URL is set
  -- only by approve_dog_meetup().
  NEW.media_urls         := '[]'::jsonb;

  -- Pending photo path must be inside the owner's own folder of the private
  -- bucket (prevents pointing a meetup at someone else's object).
  IF NEW.dog_photo_pending_path IS NOT NULL
     AND NEW.dog_photo_pending_path !~ ('^' || NEW.created_by::text || '/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'invalid pending photo path' USING ERRCODE = '22023';
  END IF;

  -- Time sanity for submissions (no past start, bounded horizon).
  IF TG_OP = 'INSERT'
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    IF NEW.starts_at < now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'meetup start time is in the past' USING ERRCODE = '22023';
    END IF;
    IF NEW.starts_at > now() + interval '90 days' THEN
      RAISE EXCEPTION 'meetup start time is too far in the future (max 90 days)' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quests_dog_meetup_guard ON public.quests;
CREATE TRIGGER trg_quests_dog_meetup_guard
  BEFORE INSERT OR UPDATE ON public.quests
  FOR EACH ROW
  EXECUTE FUNCTION public.quests_dog_meetup_guard();

-- ── Part D: restrictive RLS (defense in depth) ───────────────────────────────
-- RESTRICTIVE policies are ANDed with the existing permissive ones. For a
-- non-admin, a dog_meetup row can only be written as draft / pending_review.
-- (Existing/other rows evaluate to TRUE.)
DROP POLICY IF EXISTS "Dog meetups need admin to publish" ON public.quests;
CREATE POLICY "Dog meetups need admin to publish" ON public.quests
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    listing_type IS DISTINCT FROM 'dog_meetup'
    OR status IN ('draft', 'pending_review')
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "Dog meetups need admin to update" ON public.quests;
CREATE POLICY "Dog meetups need admin to update" ON public.quests
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    listing_type IS DISTINCT FROM 'dog_meetup'
    OR status IN ('draft', 'pending_review')
    OR public.is_admin_user()
  )
  WITH CHECK (
    listing_type IS DISTINCT FROM 'dog_meetup'
    OR status IN ('draft', 'pending_review')
    OR public.is_admin_user()
  );

-- ── Part E: admin moderation RPCs ────────────────────────────────────────────
-- SECURITY INVOKER: they rely on the existing admin UPDATE policy + the guard
-- trigger above, and re-check is_admin_user() explicitly for clear errors.

-- Approve: pending_review -> published. p_public_photo_url is the URL of the
-- copy the admin client placed in the PUBLIC bucket meetup-photos (path
-- "{quest_id}/..."), or NULL to approve without a photo. Returns the old
-- private pending path so the client can delete that object.
CREATE OR REPLACE FUNCTION public.approve_dog_meetup(
  p_quest_id uuid,
  p_public_photo_url text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.quests%ROWTYPE;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.quests
  WHERE id = p_quest_id AND listing_type = 'dog_meetup'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dog meetup not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending_review' THEN
    RAISE EXCEPTION 'dog meetup is not pending review (status: %)', v_row.status
      USING ERRCODE = '22023';
  END IF;
  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'dog meetup has already ended; reject it instead' USING ERRCODE = '22023';
  END IF;
  IF p_public_photo_url IS NOT NULL
     AND position('/storage/v1/object/public/meetup-photos/' || p_quest_id::text || '/' IN p_public_photo_url) = 0 THEN
    RAISE EXCEPTION 'photo URL must point at the public meetup-photos bucket for this meetup'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.quests
  SET status = 'published',
      published_at = now(),
      media_urls = CASE WHEN p_public_photo_url IS NULL
                        THEN '[]'::jsonb
                        ELSE jsonb_build_array(p_public_photo_url) END,
      dog_photo_pending_path = NULL,
      updated_at = now()
  WHERE id = p_quest_id;

  RETURN v_row.dog_photo_pending_path;
END;
$$;

-- Reject: pending_review/draft -> archived (kept for audit, never public).
-- Returns the old private pending path so the client can delete the object.
CREATE OR REPLACE FUNCTION public.reject_dog_meetup(p_quest_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.quests%ROWTYPE;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.quests
  WHERE id = p_quest_id AND listing_type = 'dog_meetup'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dog meetup not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.quests
  SET status = 'archived',
      media_urls = '[]'::jsonb,
      dog_photo_pending_path = NULL,
      updated_at = now()
  WHERE id = p_quest_id;

  RETURN v_row.dog_photo_pending_path;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_dog_meetup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_dog_meetup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_dog_meetup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_dog_meetup(uuid) TO authenticated;
