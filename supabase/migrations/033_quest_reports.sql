-- 033_quest_reports.sql
-- Dog Meetups — step 4 of 5: user reports of a published quest/meetup.
--
--   * one report per user per quest (UNIQUE), reason enum + optional text <= 500
--   * RLS: signed-in users insert ONLY their own report (status 'open', on a
--     published quest) and can read their own; admins read + update all
--   * report_quest() RPC: validated entry point (+ simple per-user rate limit)
--
-- No contact details, no reporter identity is ever exposed to the host.
-- Safe to re-run. Requires 031 (is_admin_user).

DO $$ BEGIN
  CREATE TYPE public.quest_report_reason AS ENUM (
    'inappropriate_content',
    'inappropriate_photo',
    'unsafe_or_not_dog_friendly',
    'spam_or_commercial',
    'wrong_location_or_time',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quest_report_status AS ENUM ('open', 'reviewed', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.quest_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id         uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason           public.quest_report_reason NOT NULL,
  details          text CHECK (details IS NULL OR char_length(details) <= 500),
  status           public.quest_report_status NOT NULL DEFAULT 'open',
  reviewed_by      uuid REFERENCES public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quest_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_quest_reports_status_created
  ON public.quest_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quest_reports_quest
  ON public.quest_reports (quest_id);

ALTER TABLE public.quest_reports ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges grant ALL on new public tables to anon + authenticated,
-- so revoke first, then grant only what is needed (column-limited UPDATE).
REVOKE ALL ON public.quest_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.quest_reports TO authenticated;
GRANT UPDATE (status, reviewed_by, reviewed_at) ON public.quest_reports TO authenticated;

DROP POLICY IF EXISTS "Users can report published quests" ON public.quest_reports;
CREATE POLICY "Users can report published quests" ON public.quest_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND status = 'open'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.quests q
      WHERE q.id = quest_id AND q.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Users can read their own reports" ON public.quest_reports;
CREATE POLICY "Users can read their own reports" ON public.quest_reports
  FOR SELECT TO authenticated
  USING (reporter_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all reports" ON public.quest_reports;
CREATE POLICY "Admins can read all reports" ON public.quest_reports
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can update reports" ON public.quest_reports;
CREATE POLICY "Admins can update reports" ON public.quest_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Returns true if a new report was recorded, false if this user had already
-- reported this quest (idempotent from the UI's point of view).
CREATE OR REPLACE FUNCTION public.report_quest(
  p_quest_id uuid,
  p_reason public.quest_report_reason,
  p_details text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_details text := NULLIF(btrim(COALESCE(p_details, '')), '');
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to report' USING ERRCODE = '42501';
  END IF;
  IF v_details IS NOT NULL AND char_length(v_details) > 500 THEN
    RAISE EXCEPTION 'details must be 500 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.quest_reports
      WHERE reporter_user_id = v_uid AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'too many reports; try again later' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.quest_reports (quest_id, reporter_user_id, reason, details)
  VALUES (p_quest_id, v_uid, p_reason, v_details)
  ON CONFLICT (quest_id, reporter_user_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.report_quest(uuid, public.quest_report_reason, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_quest(uuid, public.quest_report_reason, text) TO authenticated;
