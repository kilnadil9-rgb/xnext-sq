-- PROPOSED — NOT PART OF THE DOG MEETUPS MIGRATION CHAIN. NOT APPLIED ANYWHERE.
--
-- Finding: 001 gives every user "FOR ALL USING (id = auth.uid())" on their own
-- profiles row, with no column restriction. profiles also holds is_admin and
-- trust_score (live DB; see 018/022). Unless the live DB has a protection that
-- is not in this repo (migrations 002–013 and 028 are absent), any signed-in
-- user can run
--     update profiles set is_admin = true where id = auth.uid();
-- and become an admin — which defeats every "admins only" rule, including the
-- Dog Meetup moderation. Please verify on the live DB (read-only):
--     select polname, polcmd, pg_get_expr(polqual, polrelid) from pg_policy
--     where polrelid = 'public.profiles'::regclass;
--     select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- Proposed fix: a BEFORE INSERT/UPDATE trigger that refuses end-user writes to
-- the privileged columns. SECURITY DEFINER trigger functions that legitimately
-- change trust_score run nested (pg_trigger_depth() > 1) and are exempt; the
-- service role / SQL editor / migrations (no end-user JWT) are exempt.
-- Tested against the local replay in tests/db/dogMeetupDb.test.mjs.

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
