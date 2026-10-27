-- 036_quests_protect_admin_fields.sql — PROPOSED, NOT APPLIED ANYWHERE.
--
-- Live finding (2026-10-27): policy "quests: update own" has no status/column
-- guard, so any user can set their own quest to 'published' (skipping review)
-- and edit admin/payment fields (payment_status='paid', tier, is_featured,
-- priority_boost, expires_at on a paid listing, verified_location, …).
--
-- Fix: BEFORE INSERT/UPDATE trigger on quests. For end users who are not
-- admins (profiles.is_admin, protected by 035) or moderators
-- (has_permission('moderation.manage')):
--   INSERT: status must be draft | pending_review; admin/payment/verification
--           fields must be at their defaults (payment_status may be 'unpaid' or
--           'pending' — the PostListingPage flow inserts 'pending').
--   UPDATE: may not move a quest INTO 'published'; may not change admin-controlled
--           columns; on a paid listing may not change tier/listing_type/
--           starts_at/expires_at. Editing an already-published quest demotes it
--           to 'pending_review' (re-review). Unpublish (→ draft) and archive stay
--           allowed.
-- Exempt: no end-user JWT (service role: stripe-webhook, SQL editor,
-- migrations) and nested trigger writes (refresh_quest_verified_location
-- updating verified_location / completed_count).
-- Depends on: 035 (else a user could make themselves admin and bypass this).
-- Ordering: 036, after 035; independent of 027/029 and 030–034. When 031
-- (dog meetups) is applied as well, both guards run; they are compatible
-- (031 is stricter for dog_meetup rows).

CREATE OR REPLACE FUNCTION public.quests_protect_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_priv boolean;
BEGIN
  IF v_uid IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_priv := COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = v_uid), false)
            OR COALESCE(public.has_permission('moderation.manage'), false);
  IF v_priv THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'pending_review') THEN
      RAISE EXCEPTION 'New quests must be draft or pending_review' USING ERRCODE = '42501';
    END IF;
    IF NEW.published_at IS NOT NULL
       OR NEW.payment_status NOT IN ('unpaid', 'pending')
       OR NEW.stripe_payment_id IS NOT NULL
       OR NEW.price_paid IS NOT NULL
       OR COALESCE(NEW.is_sponsored, false) OR NEW.sponsor_id IS NOT NULL
       OR COALESCE(NEW.priority_boost, 0) <> 0
       OR COALESCE(NEW.verified_location, false)
       OR COALESCE(NEW.completed_count, 0) <> 0
       OR NEW.sq_score IS NOT NULL OR NEW.sq_score_computed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Admin-controlled quest fields cannot be set by users' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Only an admin can publish a quest — submit it for review' USING ERRCODE = '42501';
  END IF;

  IF NEW.payment_status    IS DISTINCT FROM OLD.payment_status
     OR NEW.is_paid_listing IS DISTINCT FROM OLD.is_paid_listing
     OR NEW.tier            IS DISTINCT FROM OLD.tier
     OR NEW.price_paid      IS DISTINCT FROM OLD.price_paid
     OR NEW.stripe_payment_id IS DISTINCT FROM OLD.stripe_payment_id
     OR NEW.published_at    IS DISTINCT FROM OLD.published_at
     OR NEW.is_featured     IS DISTINCT FROM OLD.is_featured
     OR NEW.is_sponsored    IS DISTINCT FROM OLD.is_sponsored
     OR NEW.sponsor_id      IS DISTINCT FROM OLD.sponsor_id
     OR NEW.priority_boost  IS DISTINCT FROM OLD.priority_boost
     OR NEW.verified_location IS DISTINCT FROM OLD.verified_location
     OR NEW.completed_count IS DISTINCT FROM OLD.completed_count
     OR NEW.sq_score        IS DISTINCT FROM OLD.sq_score
     OR NEW.sq_score_computed_at IS DISTINCT FROM OLD.sq_score_computed_at
     OR NEW.created_by      IS DISTINCT FROM OLD.created_by
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Admin-controlled quest fields cannot be changed by users' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(OLD.is_paid_listing, false) AND (
       NEW.listing_type IS DISTINCT FROM OLD.listing_type
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    RAISE EXCEPTION 'Paid listing type and time window are admin-controlled' USING ERRCODE = '42501';
  END IF;

  -- Content edits to a live quest go back through review.
  IF OLD.status = 'published' AND NEW.status = 'published'
     AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    NEW.status := 'pending_review';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.quests_protect_admin_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_quests_protect_admin_fields ON public.quests;
CREATE TRIGGER trg_quests_protect_admin_fields
  BEFORE INSERT OR UPDATE ON public.quests
  FOR EACH ROW
  EXECUTE FUNCTION public.quests_protect_admin_fields();
