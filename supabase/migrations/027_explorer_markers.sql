-- 027_explorer_markers.sql
-- Explorer Markers Community System — foundation (Phase B).
--
-- Scarce digital markers that explorers EARN through verified completions and
-- PLACE permanently at experiences they completed. Not a currency, not a
-- review system: "I made it here. This place mattered to me. I left something
-- for the next explorer."
--
--   Part A: profiles.journey_visibility (public / community / private)
--   Part B: explorer_marker_milestones — the single configurable source of
--           truth for progression levels + marker awards (no hardcoded
--           thresholds in functions or UI).
--   Part C: explorer_marker_awards — idempotent, auditable award ledger.
--   Part D: explorer_markers — placed markers (active/retired/moderated).
--   Part E: explorer_marker_discoveries — personal keepsakes (non-exclusive).
--   Part F: explorer_marker_reports — basic moderation from day one.
--   Part G: SECURITY DEFINER functions — the ONLY write path for awards,
--           placement, cancellation, and discovery. Clients cannot grant
--           themselves markers or bypass eligibility.
--   Part H: read RPCs — experience markers (privacy-aware), inventory,
--           community metrics (real values only).
--   Part I: strict RLS.
--
-- MODERATION POLICY (explicit, v1): a marker removed by moderation is
-- CONSUMED — it does NOT return to the owner's inventory. Change by flipping
-- `consumed` in moderation tooling if policy changes later.
--
-- STAGED ONLY: do not run against production. Apply locally with
-- `supabase db push` against a dev branch/project.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT / OR REPLACE throughout).

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ============================================================
-- Part A: journey visibility on profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS journey_visibility text NOT NULL DEFAULT 'community';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_journey_visibility_check
    CHECK (journey_visibility IN ('public', 'community', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.profiles.journey_visibility IS
  'Explorer journey visibility: public (name shown on markers), community (name shown to signed-in explorers), private (markers appear anonymous; owner still sees their own full record).';

-- ============================================================
-- Part B: milestone configuration (single source of truth)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explorer_marker_milestones (
  milestone_key text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('trail','bronze','silver','gold','diamond','legacy')),
  quantity integer NOT NULL CHECK (quantity > 0),
  required_completions integer NOT NULL CHECK (required_completions > 0),
  level_name text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.explorer_marker_milestones IS
  'Configurable product values: explorer progression levels + marker awards. UI and award function both read this table — never hardcode thresholds.';

INSERT INTO public.explorer_marker_milestones
  (milestone_key, tier, quantity, required_completions, level_name, sort_order)
VALUES
  ('first_completion', 'trail',   3, 1,   'Trail Explorer',   1),
  ('completions_10',   'bronze',  2, 10,  'Bronze Explorer',  2),
  ('completions_50',   'silver',  2, 50,  'Silver Explorer',  3),
  ('completions_100',  'gold',    2, 100, 'Gold Explorer',    4),
  ('completions_250',  'diamond', 1, 250, 'Diamond Explorer', 5),
  ('completions_500',  'legacy',  1, 500, 'Legacy Explorer',  6)
ON CONFLICT (milestone_key) DO NOTHING;

-- ============================================================
-- Part C: award ledger (idempotent, auditable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explorer_marker_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('trail','bronze','silver','gold','diamond','legacy')),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  milestone_key text NOT NULL REFERENCES public.explorer_marker_milestones(milestone_key),
  completions_at_award integer NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_marker_awards_user ON public.explorer_marker_awards (user_id);

-- ============================================================
-- Part D: placed markers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explorer_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('trail','bronze','silver','gold','diamond','legacy')),
  note text CHECK (note IS NULL OR char_length(note) <= 120),
  photo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','retired','removed_by_moderation')),
  -- Marker consumed = it never returns to inventory. Cancellation within the
  -- grace window sets consumed=false (marker returns to inventory).
  consumed boolean NOT NULL DEFAULT true,
  level_name_at_placement text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  -- Grace window end: cancellation allowed before this; permanent after.
  locked_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE Legacy Marker per explorer, enforced at the database.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_legacy_marker
  ON public.explorer_markers (owner_user_id)
  WHERE tier = 'legacy' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_explorer_markers_quest
  ON public.explorer_markers (quest_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_explorer_markers_owner
  ON public.explorer_markers (owner_user_id);

DO $$ BEGIN
  CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.explorer_markers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Part E: discoveries (personal keepsakes — marker stays in place)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explorer_marker_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_id uuid NOT NULL REFERENCES public.explorer_markers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  completion_id uuid REFERENCES public.quest_completions(id) ON DELETE SET NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marker_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_marker_discoveries_user
  ON public.explorer_marker_discoveries (user_id, discovered_at DESC);

-- ============================================================
-- Part F: reports (basic moderation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explorer_marker_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_id uuid NOT NULL REFERENCES public.explorer_markers(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) <= 500),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marker_id, reporter_user_id)
);

-- ============================================================
-- Part G: trusted write path (SECURITY DEFINER functions)
-- ============================================================

-- Verified completions = DISTINCT experiences with a live completion record.
--
-- COMPLETION VALIDITY (audited 2026-07): quest_completions has NO soft-delete,
-- invalidation, moderation, or status column — invalid completions are hard-
-- deleted, so "row exists" = "valid" under the current schema. If a validity
-- column (e.g. deleted_at / is_invalidated) is ever added, THIS function is
-- the single place to add the filter — progression, awards, placement, and
-- discovery eligibility all flow through it.
--
-- INTERNAL ONLY: accepts an arbitrary user id, so EXECUTE is revoked from
-- client roles below. Clients use get_my_verified_completion_count().
CREATE OR REPLACE FUNCTION public.count_verified_completions(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT quest_id)::integer
  FROM public.quest_completions
  WHERE user_id = p_user_id;
$$;

-- Client-facing variant: the signed-in user's own count only.
CREATE OR REPLACE FUNCTION public.get_my_verified_completion_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.count_verified_completions(auth.uid());
$$;

-- Claim any milestone awards the caller has newly qualified for.
-- Idempotent: UNIQUE (user_id, milestone_key) + ON CONFLICT DO NOTHING makes
-- double-claims impossible. Auditable: every award row records the milestone,
-- reason, and completion count at award time. Recalculable: re-running is safe.
CREATE OR REPLACE FUNCTION public.claim_explorer_milestones()
RETURNS SETOF public.explorer_marker_awards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_completions integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_completions := public.count_verified_completions(v_user);

  RETURN QUERY
  INSERT INTO public.explorer_marker_awards
    (user_id, tier, quantity, reason, milestone_key, completions_at_award)
  SELECT
    v_user, m.tier, m.quantity,
    'Milestone: ' || m.level_name || ' (' || m.required_completions || ' verified completions)',
    m.milestone_key, v_completions
  FROM public.explorer_marker_milestones m
  WHERE m.required_completions <= v_completions
  ON CONFLICT (user_id, milestone_key) DO NOTHING
  RETURNING *;
END;
$$;

-- Place a marker. Server-side validation of EVERYTHING the client could fake:
-- completion required, inventory required, note constraints, Legacy rules.
CREATE OR REPLACE FUNCTION public.place_explorer_marker(
  p_quest_id uuid,
  p_tier text,
  p_note text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS public.explorer_markers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_note text := NULLIF(trim(coalesce(p_note, '')), '');
  v_awarded integer;
  v_used integer;
  v_level text;
  v_row public.explorer_markers;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tier NOT IN ('trail','bronze','silver','gold','diamond','legacy') THEN
    RAISE EXCEPTION 'Unknown marker tier';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 120 THEN
    RAISE EXCEPTION 'Marker notes are limited to 120 characters';
  END IF;
  IF v_note IS NOT NULL AND v_note ~* '(https?://|www\.)' THEN
    RAISE EXCEPTION 'Marker notes cannot contain links';
  END IF;

  -- Must have completed this experience (existing completion rules).
  IF NOT EXISTS (
    SELECT 1 FROM public.quest_completions
    WHERE user_id = v_user AND quest_id = p_quest_id
  ) THEN
    RAISE EXCEPTION 'Complete this experience before leaving a marker';
  END IF;

  -- Experience must exist and be published.
  IF NOT EXISTS (
    SELECT 1 FROM public.quests WHERE id = p_quest_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Experience not found';
  END IF;

  -- CONCURRENCY: transaction-scoped advisory lock keyed by (user, tier).
  -- Two concurrent placements by the same user for the same tier serialize
  -- here, so the read-then-insert inventory check below cannot double-spend
  -- (with one marker available, exactly one call succeeds). Different users
  -- and different tiers never contend. Lock is released at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('explorer_marker_place:' || v_user::text || ':' || p_tier, 0)
  );

  -- Inventory: awarded minus active minus permanently consumed.
  SELECT COALESCE(SUM(quantity), 0) INTO v_awarded
  FROM public.explorer_marker_awards
  WHERE user_id = v_user AND tier = p_tier;

  SELECT COUNT(*) INTO v_used
  FROM public.explorer_markers
  WHERE owner_user_id = v_user AND tier = p_tier
    AND (status = 'active' OR consumed);

  IF v_awarded - v_used < 1 THEN
    RAISE EXCEPTION 'No % markers available', p_tier;
  END IF;

  -- One active Legacy Marker per explorer (also DB-enforced by unique index).
  IF p_tier = 'legacy' AND EXISTS (
    SELECT 1 FROM public.explorer_markers
    WHERE owner_user_id = v_user AND tier = 'legacy' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active Legacy Marker';
  END IF;

  -- Explorer level at placement (from the shared milestone config).
  SELECT m.level_name INTO v_level
  FROM public.explorer_marker_milestones m
  WHERE m.required_completions <= public.count_verified_completions(v_user)
  ORDER BY m.required_completions DESC
  LIMIT 1;

  INSERT INTO public.explorer_markers
    (owner_user_id, quest_id, tier, note, photo_url, level_name_at_placement)
  VALUES (v_user, p_quest_id, p_tier, v_note, p_photo_url, v_level)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Cancel a marker within its grace window. The marker returns to inventory
-- (consumed=false) and the record stays for the audit trail — never deleted.
-- After locked_at the marker is permanent (v1: no user-initiated retirement).
CREATE OR REPLACE FUNCTION public.cancel_explorer_marker(p_marker_id uuid)
RETURNS public.explorer_markers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.explorer_markers;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.explorer_markers
  SET status = 'retired', consumed = false, retired_at = now()
  WHERE id = p_marker_id
    AND owner_user_id = v_user
    AND status = 'active'
    AND now() < locked_at
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This marker can no longer be cancelled — it is part of the trail now';
  END IF;

  RETURN v_row;
END;
$$;

-- Discover a marker: requires a real-world connection to the experience —
-- either a completion, or being within the experience radius right now.
-- Uses the same PostGIS geography as find_quests_nearby (no second proximity
-- system).
--
-- COORDINATE TRUST (explicit, v1): p_lat/p_lng are CLIENT-REPORTED GPS.
-- The server enforces the radius against the quest's true location, which
-- stops casual remote discovery, but client GPS can be spoofed — this check
-- is NOT tamper-proof and must never be described as strong proof of
-- physical presence. It matches the trust level of the app's existing
-- completion flow. If completions later gain hardened presence verification,
-- discovery inherits it via the completion-based eligibility path.
CREATE OR REPLACE FUNCTION public.discover_explorer_marker(
  p_marker_id uuid,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS public.explorer_marker_discoveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_marker public.explorer_markers;
  v_completion_id uuid;
  v_eligible boolean := false;
  v_row public.explorer_marker_discoveries;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_marker FROM public.explorer_markers
  WHERE id = p_marker_id AND status = 'active';
  IF v_marker.id IS NULL THEN
    RAISE EXCEPTION 'Marker not found';
  END IF;
  IF v_marker.owner_user_id = v_user THEN
    RAISE EXCEPTION 'This is your own marker';
  END IF;

  -- Eligibility 1: verified completion of this experience.
  SELECT id INTO v_completion_id
  FROM public.quest_completions
  WHERE user_id = v_user AND quest_id = v_marker.quest_id
  ORDER BY completed_at DESC
  LIMIT 1;
  IF v_completion_id IS NOT NULL THEN
    v_eligible := true;
  END IF;

  -- Eligibility 2: physically within the experience radius (default 500 m).
  IF NOT v_eligible AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT extensions.ST_DWithin(
      q.location_point,
      extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography,
      COALESCE(q.location_radius_m, 500)
    ) INTO v_eligible
    FROM public.quests q
    WHERE q.id = v_marker.quest_id AND q.location_point IS NOT NULL;
    v_eligible := COALESCE(v_eligible, false);
  END IF;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'Reach this experience in the real world to discover its markers';
  END IF;

  INSERT INTO public.explorer_marker_discoveries
    (marker_id, user_id, quest_id, completion_id)
  VALUES (p_marker_id, v_user, v_marker.quest_id, v_completion_id)
  ON CONFLICT (marker_id, user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Already part of your journey';
  END IF;

  RETURN v_row;
END;
$$;

-- Report a marker (moderation intake). Removal itself is an admin action via
-- the moderation UPDATE policy below; award history is preserved either way.
CREATE OR REPLACE FUNCTION public.report_explorer_marker(
  p_marker_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A short reason is required';
  END IF;
  INSERT INTO public.explorer_marker_reports (marker_id, reporter_user_id, reason)
  VALUES (p_marker_id, auth.uid(), left(trim(p_reason), 500))
  ON CONFLICT (marker_id, reporter_user_id) DO NOTHING;
END;
$$;

-- ============================================================
-- Part H: read RPCs
-- ============================================================

-- Markers at an experience, privacy-aware. Owner identity only leaves the
-- database when journey_visibility allows it; private profiles appear as
-- anonymous tiers. The caller always sees their own markers fully.
CREATE OR REPLACE FUNCTION public.get_experience_markers(p_quest_id uuid)
RETURNS TABLE (
  id uuid,
  tier text,
  note text,
  photo_url text,
  placed_at timestamptz,
  level_name_at_placement text,
  explorer_name text,
  is_mine boolean,
  discovered_by_me boolean,
  discovery_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.tier,
    CASE
      WHEN m.owner_user_id = auth.uid() THEN m.note
      WHEN p.journey_visibility = 'private' THEN NULL
      ELSE m.note
    END AS note,
    CASE
      WHEN m.owner_user_id = auth.uid() THEN m.photo_url
      WHEN p.journey_visibility = 'private' THEN NULL
      ELSE m.photo_url
    END AS photo_url,
    m.placed_at,
    m.level_name_at_placement,
    CASE
      WHEN m.owner_user_id = auth.uid()
        THEN COALESCE(p.full_name, p.username, 'You')
      WHEN p.journey_visibility IN ('public', 'community')
        THEN COALESCE(p.full_name, p.username, 'An explorer')
      ELSE 'An explorer'
    END AS explorer_name,
    (m.owner_user_id = auth.uid()) AS is_mine,
    EXISTS (
      SELECT 1 FROM public.explorer_marker_discoveries d
      WHERE d.marker_id = m.id AND d.user_id = auth.uid()
    ) AS discovered_by_me,
    (SELECT COUNT(*) FROM public.explorer_marker_discoveries d
      WHERE d.marker_id = m.id) AS discovery_count
  FROM public.explorer_markers m
  JOIN public.profiles p ON p.id = m.owner_user_id
  WHERE m.quest_id = p_quest_id AND m.status = 'active'
  ORDER BY
    CASE m.tier
      WHEN 'legacy' THEN 0 WHEN 'diamond' THEN 1 WHEN 'gold' THEN 2
      WHEN 'silver' THEN 3 WHEN 'bronze' THEN 4 ELSE 5
    END,
    m.placed_at DESC;
$$;

-- Caller's keepsake collection: their discoveries joined with a marker
-- preview + quest title. Required because raw explorer_markers rows are
-- owner-only under RLS — this RPC is the sanctioned read path and applies
-- journey_visibility to the marker owner's note (identity is never included).
CREATE OR REPLACE FUNCTION public.get_my_keepsakes(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  marker_id uuid,
  quest_id uuid,
  discovered_at timestamptz,
  tier text,
  note text,
  marker_placed_at timestamptz,
  marker_status text,
  quest_title text,
  quest_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.marker_id,
    d.quest_id,
    d.discovered_at,
    m.tier,
    CASE WHEN p.journey_visibility = 'private' THEN NULL ELSE m.note END AS note,
    m.placed_at AS marker_placed_at,
    m.status AS marker_status,
    q.title AS quest_title,
    q.slug AS quest_slug
  FROM public.explorer_marker_discoveries d
  JOIN public.explorer_markers m ON m.id = d.marker_id
  JOIN public.profiles p ON p.id = m.owner_user_id
  JOIN public.quests q ON q.id = d.quest_id
  WHERE d.user_id = auth.uid()
  ORDER BY d.discovered_at DESC
  LIMIT GREATEST(LEAST(p_limit, 200), 1);
$$;

-- Caller's marker inventory per tier (ledger-derived, never client-mutable).
CREATE OR REPLACE FUNCTION public.get_my_marker_inventory()
RETURNS TABLE (tier text, awarded bigint, available bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.tier,
    COALESCE(a.awarded, 0) AS awarded,
    GREATEST(COALESCE(a.awarded, 0) - COALESCE(u.used, 0), 0) AS available
  FROM (VALUES ('trail'),('bronze'),('silver'),('gold'),('diamond'),('legacy')) AS t(tier)
  LEFT JOIN (
    SELECT aw.tier, SUM(aw.quantity) AS awarded
    FROM public.explorer_marker_awards aw
    WHERE aw.user_id = auth.uid()
    GROUP BY aw.tier
  ) a ON a.tier = t.tier
  LEFT JOIN (
    SELECT em.tier, COUNT(*) AS used
    FROM public.explorer_markers em
    WHERE em.owner_user_id = auth.uid()
      AND (em.status = 'active' OR em.consumed)
    GROUP BY em.tier
  ) u ON u.tier = t.tier;
$$;

-- Aggregate community evidence — real values only, no personal data.
CREATE OR REPLACE FUNCTION public.get_community_metrics()
RETURNS TABLE (
  completions_today bigint,
  explorer_notes_today bigint,
  markers_placed_total bigint,
  markers_discovered_today bigint,
  dream_completed_today bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.quest_completions
      WHERE completed_at >= date_trunc('day', now())),
    (SELECT COUNT(*) FROM public.quest_completions
      WHERE explorer_note IS NOT NULL
        AND completed_at >= date_trunc('day', now())),
    (SELECT COUNT(*) FROM public.explorer_markers WHERE status = 'active'),
    (SELECT COUNT(*) FROM public.explorer_marker_discoveries
      WHERE discovered_at >= date_trunc('day', now())),
    (SELECT COUNT(*) FROM public.dream_list
      WHERE status = 'completed'
        AND completed_at >= date_trunc('day', now()));
$$;

-- Recent evidence-based journey activity, privacy-first:
--  * marker placements/discoveries: quest title + tier + day; explorer name
--    ONLY when journey_visibility = 'public' (never precise time or location).
--  * completions: only rows the owner explicitly marked is_public.
CREATE OR REPLACE FUNCTION public.get_community_activity(p_limit integer DEFAULT 12)
RETURNS TABLE (
  kind text,
  tier text,
  quest_title text,
  explorer_name text,
  happened_on date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT activity.kind, activity.tier, activity.quest_title,
         activity.explorer_name, activity.happened_on
  FROM (
    SELECT
      'marker_placed'::text AS kind,
      m.tier,
      q.title AS quest_title,
      CASE WHEN p.journey_visibility = 'public'
        THEN COALESCE(p.full_name, p.username) END AS explorer_name,
      m.placed_at::date AS happened_on,
      m.placed_at AS ts
    FROM public.explorer_markers m
    JOIN public.quests q ON q.id = m.quest_id
    JOIN public.profiles p ON p.id = m.owner_user_id
    WHERE m.status = 'active'
    UNION ALL
    SELECT
      'marker_discovered', m.tier, q.title,
      NULL,
      d.discovered_at::date, d.discovered_at
    FROM public.explorer_marker_discoveries d
    JOIN public.explorer_markers m ON m.id = d.marker_id AND m.status = 'active'
    JOIN public.quests q ON q.id = d.quest_id
    UNION ALL
    SELECT
      'completion', NULL, q.title,
      CASE WHEN p.journey_visibility = 'public'
        THEN COALESCE(p.full_name, p.username) END,
      c.completed_at::date, c.completed_at
    FROM public.quest_completions c
    JOIN public.quests q ON q.id = c.quest_id
    JOIN public.profiles p ON p.id = c.user_id
    WHERE c.is_public = true
    UNION ALL
    SELECT
      'explorer_note', NULL, q.title,
      NULL,
      c.completed_at::date, c.completed_at
    FROM public.quest_completions c
    JOIN public.quests q ON q.id = c.quest_id
    WHERE c.explorer_note IS NOT NULL
  ) activity
  ORDER BY ts DESC
  LIMIT GREATEST(LEAST(p_limit, 50), 1);
$$;

-- Grants — deny-by-default. Postgres grants EXECUTE to PUBLIC on new
-- functions automatically, so every function is first revoked from PUBLIC
-- and anon, then granted only where intended.
REVOKE ALL ON FUNCTION public.count_verified_completions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_verified_completion_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_explorer_milestones() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.place_explorer_marker(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_explorer_marker(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discover_explorer_marker(uuid, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_explorer_marker(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_experience_markers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_keepsakes(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_marker_inventory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_community_metrics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_community_activity(integer) FROM PUBLIC, anon;

-- count_verified_completions(uuid) takes an ARBITRARY user id: internal only
-- (called from the SECURITY DEFINER functions above, which execute as the
-- function owner). Clients get the auth.uid()-scoped variant instead.
GRANT EXECUTE ON FUNCTION public.get_my_verified_completion_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_explorer_milestones() TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_explorer_marker(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_explorer_marker(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discover_explorer_marker(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_explorer_marker(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_experience_markers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_keepsakes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_marker_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_activity(integer) TO authenticated;

-- ============================================================
-- Part I: RLS — deny by default; functions above are the write path
-- ============================================================

ALTER TABLE public.explorer_marker_milestones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Milestone config readable by signed-in explorers"
    ON public.explorer_marker_milestones FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.explorer_marker_awards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Read own awards only. NO insert/update/delete policies: awards are granted
  -- exclusively by claim_explorer_milestones() (SECURITY DEFINER).
  CREATE POLICY "Users read their own marker awards"
    ON public.explorer_marker_awards FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.explorer_markers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- HARDENED: raw rows are OWNER-ONLY. Other explorers' markers are readable
  -- exclusively through the SECURITY DEFINER read RPCs
  -- (get_experience_markers / get_my_keepsakes / get_community_activity),
  -- which apply journey_visibility — raw owner_user_id / note / photo_url of
  -- another user are never selectable by regular authenticated clients.
  -- No INSERT policy: placement goes through place_explorer_marker().
  -- No UPDATE policy for regular users: cancellation goes through
  -- cancel_explorer_marker().
  CREATE POLICY "Users read their own markers"
    ON public.explorer_markers FOR SELECT
    USING (owner_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read all markers"
    ON public.explorer_markers FOR SELECT
    USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can moderate markers"
    ON public.explorer_markers FOR UPDATE
    USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.explorer_marker_discoveries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  -- Read own discoveries only. NO insert policy: discovery eligibility is
  -- verified inside discover_explorer_marker().
  CREATE POLICY "Users read their own marker discoveries"
    ON public.explorer_marker_discoveries FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.explorer_marker_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins review marker reports"
    ON public.explorer_marker_reports FOR SELECT
    USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- End of 027 — Explorer Markers foundation.
