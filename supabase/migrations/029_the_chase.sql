-- 029_the_chase.sql
-- Community Evolution: "The Chase" — Explorer Marker System 2.0.
-- Additive on 027_explorer_markers.sql. Safe to re-run.
--
-- What this adds:
--   A. Contribution types + community tags on explorer_markers, and the
--      one-active-contribution-per-explorer-per-experience rule.
--   B. Marker usefulness signals (Helpful / Inspired Me / Beautiful /
--      Accurate / Worth The Trip) — discoverers only, never public comments.
--   C. The Chase feed RPC: nearby marker TEASERS. Content (note/photo) is
--      NEVER returned remotely — unlocking still goes through
--      discover_explorer_marker's proximity/completion gate (027).
--   D. Remote-viewing lockdown: get_experience_markers now hides note/photo
--      until the caller has discovered the marker (or owns it).
--   E. Explorer impact RPC: real-world influence, no vanity metrics.
--   F. place_explorer_marker gains p_marker_type (old signature dropped).

-- ============================================================
-- Part A: marker contribution types + community + one-per-experience
-- ============================================================
ALTER TABLE public.explorer_markers
  ADD COLUMN IF NOT EXISTS marker_type text NOT NULL DEFAULT 'favorite_spot',
  ADD COLUMN IF NOT EXISTS community text;

DO $$ BEGIN
  ALTER TABLE public.explorer_markers
    ADD CONSTRAINT explorer_markers_marker_type_check CHECK (marker_type IN (
      'hidden_photo','secret_tip','warning','best_time','shortcut',
      'hidden_discovery','favorite_spot','mini_challenge','personal_memory'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Exactly ONE meaningful contribution per explorer per experience.
-- (Existing dev data with duplicates must be resolved before this applies;
-- the guarded DO block surfaces a clear error instead of half-applying.)
DO $$ BEGIN
  CREATE UNIQUE INDEX uniq_active_marker_per_experience
    ON public.explorer_markers (owner_user_id, quest_id)
    WHERE status = 'active';
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_explorer_markers_community
  ON public.explorer_markers (community) WHERE status = 'active';

-- ============================================================
-- Part B: usefulness signals (evidence, not applause)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.explorer_marker_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_id uuid NOT NULL REFERENCES public.explorer_markers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal text NOT NULL CHECK (signal IN (
    'helpful','inspired_me','beautiful','accurate','worth_the_trip'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marker_id, user_id, signal)
);

CREATE INDEX IF NOT EXISTS idx_marker_signals_marker
  ON public.explorer_marker_signals (marker_id);

-- Locked down: all access flows through SECURITY DEFINER functions.
ALTER TABLE public.explorer_marker_signals ENABLE ROW LEVEL SECURITY;

-- Signal a marker's usefulness — only explorers who actually UNLOCKED it.
CREATE OR REPLACE FUNCTION public.signal_explorer_marker(
  p_marker_id uuid,
  p_signal text
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
  IF p_signal NOT IN ('helpful','inspired_me','beautiful','accurate','worth_the_trip') THEN
    RAISE EXCEPTION 'Unknown signal';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.explorer_marker_discoveries
    WHERE marker_id = p_marker_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unlock this marker in the real world before rating it';
  END IF;
  INSERT INTO public.explorer_marker_signals (marker_id, user_id, signal)
  VALUES (p_marker_id, auth.uid(), p_signal)
  ON CONFLICT (marker_id, user_id, signal) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.signal_explorer_marker(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signal_explorer_marker(uuid, text) TO authenticated;

-- ============================================================
-- Part C: the Chase feed — nearby marker teasers, content withheld
-- ============================================================
-- Returns everything needed to CHASE a marker (type, community, rarity tier,
-- where to go, how alive it is) and nothing that spoils it (no note, no
-- photo, no owner identity). Reward: Unknown — by design.
CREATE OR REPLACE FUNCTION public.get_chase_feed(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 40,
  p_limit integer DEFAULT 60
)
RETURNS TABLE (
  marker_id uuid,
  marker_type text,
  community text,
  tier text,
  quest_id uuid,
  quest_title text,
  lat double precision,
  lng double precision,
  distance_km double precision,
  placed_at timestamptz,
  unlock_count bigint,
  unlocks_today bigint,
  signal_count bigint,
  seasonal_active boolean,
  verified_location boolean,
  discovered_by_me boolean,
  is_mine boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS marker_id,
    m.marker_type,
    m.community,
    m.tier,
    q.id AS quest_id,
    q.title AS quest_title,
    extensions.ST_Y(q.location_point::extensions.geometry) AS lat,
    extensions.ST_X(q.location_point::extensions.geometry) AS lng,
    extensions.ST_Distance(
      q.location_point,
      extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography
    ) / 1000.0 AS distance_km,
    m.placed_at,
    (SELECT COUNT(*) FROM public.explorer_marker_discoveries d
      WHERE d.marker_id = m.id) AS unlock_count,
    (SELECT COUNT(*) FROM public.explorer_marker_discoveries d
      WHERE d.marker_id = m.id AND d.discovered_at >= date_trunc('day', now())) AS unlocks_today,
    (SELECT COUNT(*) FROM public.explorer_marker_signals s
      WHERE s.marker_id = m.id) AS signal_count,
    COALESCE(
      (q.start_date IS NOT NULL AND q.end_date IS NOT NULL
        AND now()::date BETWEEN q.start_date AND q.end_date),
      false
    ) AS seasonal_active,
    COALESCE(q.verified_location, false) AS verified_location,
    EXISTS (
      SELECT 1 FROM public.explorer_marker_discoveries d
      WHERE d.marker_id = m.id AND d.user_id = auth.uid()
    ) AS discovered_by_me,
    (m.owner_user_id = auth.uid()) AS is_mine
  FROM public.explorer_markers m
  JOIN public.quests q ON q.id = m.quest_id
  WHERE m.status = 'active'
    AND q.status = 'published'
    AND q.location_point IS NOT NULL
    AND extensions.ST_DWithin(
      q.location_point,
      extensions.ST_MakePoint(p_lng, p_lat)::extensions.geography,
      p_radius_km * 1000.0
    )
  ORDER BY distance_km ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.get_chase_feed(double precision, double precision, double precision, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chase_feed(double precision, double precision, double precision, integer) TO authenticated;

-- ============================================================
-- Part D: remote-viewing lockdown for marker content
-- ============================================================
-- 2.0 rule: "Markers cannot be viewed remotely." note/photo now reveal only
-- to the owner or an explorer who has UNLOCKED the marker (discovery row —
-- which discover_explorer_marker only grants on-site or after completion).
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
  discovery_count bigint,
  marker_type text,
  community text
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
      WHEN EXISTS (
        SELECT 1 FROM public.explorer_marker_discoveries d
        WHERE d.marker_id = m.id AND d.user_id = auth.uid()
      ) AND p.journey_visibility <> 'private' THEN m.note
      ELSE NULL
    END AS note,
    CASE
      WHEN m.owner_user_id = auth.uid() THEN m.photo_url
      WHEN EXISTS (
        SELECT 1 FROM public.explorer_marker_discoveries d
        WHERE d.marker_id = m.id AND d.user_id = auth.uid()
      ) AND p.journey_visibility <> 'private' THEN m.photo_url
      ELSE NULL
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
      WHERE d.marker_id = m.id) AS discovery_count,
    m.marker_type,
    m.community
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

-- ============================================================
-- Part E: explorer impact — real-world influence, zero vanity
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_explorer_impact()
RETURNS TABLE (
  markers_placed bigint,
  explorers_reached bigint,
  total_unlocks bigint,
  unlocks_today bigint,
  unlocks_this_week bigint,
  signals_received jsonb,
  verified_locations_touched bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_markers AS (
    SELECT id, quest_id FROM public.explorer_markers
    WHERE owner_user_id = auth.uid() AND status = 'active'
  ),
  unlocks AS (
    SELECT d.* FROM public.explorer_marker_discoveries d
    JOIN my_markers mm ON mm.id = d.marker_id
  )
  SELECT
    (SELECT COUNT(*) FROM my_markers) AS markers_placed,
    (SELECT COUNT(DISTINCT user_id) FROM unlocks) AS explorers_reached,
    (SELECT COUNT(*) FROM unlocks) AS total_unlocks,
    (SELECT COUNT(*) FROM unlocks
      WHERE discovered_at >= date_trunc('day', now())) AS unlocks_today,
    (SELECT COUNT(*) FROM unlocks
      WHERE discovered_at >= now() - interval '7 days') AS unlocks_this_week,
    COALESCE(
      (SELECT jsonb_object_agg(t.signal, t.n)
        FROM (
          SELECT s.signal, COUNT(*) AS n
          FROM public.explorer_marker_signals s
          JOIN my_markers mm ON mm.id = s.marker_id
          GROUP BY s.signal
        ) t),
      '{}'::jsonb
    ) AS signals_received,
    (SELECT COUNT(DISTINCT q.id)
      FROM my_markers mm
      JOIN public.quests q ON q.id = mm.quest_id
      WHERE COALESCE(q.verified_location, false)) AS verified_locations_touched;
$$;

REVOKE ALL ON FUNCTION public.get_my_explorer_impact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_explorer_impact() TO authenticated;

-- ============================================================
-- Part F: placement accepts the contribution type + community
-- ============================================================
DROP FUNCTION IF EXISTS public.place_explorer_marker(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.place_explorer_marker(
  p_quest_id uuid,
  p_tier text,
  p_note text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_marker_type text DEFAULT 'favorite_spot',
  p_community text DEFAULT NULL
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
  IF p_marker_type NOT IN (
    'hidden_photo','secret_tip','warning','best_time','shortcut',
    'hidden_discovery','favorite_spot','mini_challenge','personal_memory'
  ) THEN
    RAISE EXCEPTION 'Unknown contribution type';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 120 THEN
    RAISE EXCEPTION 'Marker notes are limited to 120 characters';
  END IF;
  IF v_note IS NOT NULL AND v_note ~* '(https?://|www\.)' THEN
    RAISE EXCEPTION 'Marker notes cannot contain links';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quest_completions
    WHERE user_id = v_user AND quest_id = p_quest_id
  ) THEN
    RAISE EXCEPTION 'Complete this experience before leaving a marker';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quests WHERE id = p_quest_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Experience not found';
  END IF;

  -- 2.0: exactly ONE contribution per explorer per experience (also enforced
  -- by uniq_active_marker_per_experience — this gives the friendly error).
  IF EXISTS (
    SELECT 1 FROM public.explorer_markers
    WHERE owner_user_id = v_user AND quest_id = p_quest_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already left your contribution here — one per experience';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('explorer_marker_place:' || v_user::text || ':' || p_tier, 0)
  );

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

  IF p_tier = 'legacy' AND EXISTS (
    SELECT 1 FROM public.explorer_markers
    WHERE owner_user_id = v_user AND tier = 'legacy' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have an active Legacy Marker';
  END IF;

  SELECT m.level_name INTO v_level
  FROM public.explorer_marker_milestones m
  WHERE m.required_completions <= public.count_verified_completions(v_user)
  ORDER BY m.required_completions DESC
  LIMIT 1;

  INSERT INTO public.explorer_markers
    (owner_user_id, quest_id, tier, note, photo_url, level_name_at_placement,
     marker_type, community)
  VALUES (v_user, p_quest_id, p_tier, v_note, p_photo_url, v_level,
     p_marker_type, NULLIF(trim(coalesce(p_community, '')), ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.place_explorer_marker(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_explorer_marker(uuid, text, text, text, text, text) TO authenticated;
