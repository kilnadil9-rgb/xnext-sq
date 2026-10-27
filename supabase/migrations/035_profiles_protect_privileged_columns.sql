-- 035_profiles_protect_privileged_columns.sql
--
-- SECURITY FIX — ALREADY APPLIED TO PRODUCTION (genidibsxbowwirucefw) on
-- 2026-10-27 ~11:25 PT, in one transaction, approved by Aaron.
-- Closes the self-admin escalation: profiles UPDATE policy is (auth.uid() = id)
-- with no column restriction, so any user could set their own is_admin /
-- trust_score. A BEFORE INSERT/UPDATE trigger now refuses end-user writes to
-- those columns. Exempt: no end-user JWT (service role, SQL editor, GoTrue
-- signup via handle_new_user) and nested trigger writes (pg_trigger_depth() > 1,
-- e.g. refresh_quest_verified_location's trust_score +1/+5).
-- profiles SELECT visibility is NOT changed (proposed separately).
--
-- Ordering: numbered 035 so it never collides with feature/dog-meetups
-- (030–034). It depends only on profiles.is_admin / trust_score, which exist
-- live (is_admin is live-schema drift, not created by any repo migration).
-- Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS): re-running on
-- production is a no-op. Rollback: docs/security/profiles-privileged-columns.md
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE OR COALESCE(NEW.trust_score, 0) <> 0 THEN
      RAISE EXCEPTION 'is_admin / trust_score cannot be set by users' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin
        OR NEW.trust_score IS DISTINCT FROM OLD.trust_score THEN
    RAISE EXCEPTION 'is_admin / trust_score cannot be changed by users' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_privileged_columns();
