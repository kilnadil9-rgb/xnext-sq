-- 026_explorer_notes.sql
-- Explorer Notes (final Phase 1 user-facing feature) — additive only.
--
-- After completing a quest, an explorer can leave ONE short note (max 9
-- words, app-enforced; DB caps raw length) plus one-tap quick tags. These are
-- NOT public reviews — they're structured knowledge for the Experience Graph.
-- Phase 1 collects; later phases summarize ("Visitors consistently mention…").
--
-- Storage: columns on quest_completions (one note per completion, and
-- completions are already unique per user+quest in practice via the app's
-- idempotent completeQuest). Owner RLS from 001 already covers writes;
-- no new policies needed.
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor).
-- Safe to re-run.

ALTER TABLE public.quest_completions
  ADD COLUMN IF NOT EXISTS explorer_note text,
  ADD COLUMN IF NOT EXISTS explorer_tags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quest_completions.explorer_note IS
  'One short tip for the next explorer (max 9 words, app-enforced). Experience Graph input — not a public review.';
COMMENT ON COLUMN public.quest_completions.explorer_tags IS
  'One-tap quick tags: {difficulty, crowds, parking, family_friendly, dog_friendly, worth_returning}. Experience Graph input.';

-- Hard length guard (9 words comfortably fits; blocks essay abuse at the DB).
DO $$ BEGIN
  ALTER TABLE public.quest_completions
    ADD CONSTRAINT quest_completions_explorer_note_len
    CHECK (explorer_note IS NULL OR char_length(explorer_note) <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Future aggregation ("visitors consistently mention…") will scan notes per
-- quest; a partial index keeps that cheap without indexing empty rows.
CREATE INDEX IF NOT EXISTS idx_quest_completions_notes
  ON public.quest_completions (quest_id)
  WHERE explorer_note IS NOT NULL OR explorer_tags <> '{}'::jsonb;
