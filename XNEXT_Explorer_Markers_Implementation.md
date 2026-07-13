# XNEXT — Explorer Markers Community System + Journey Pulse

Implementation report · staged locally only · no deploy, no push, no production migration executed.

> Explore the world. Leave a trail. Inspire the next explorer.

---

## Files changed

**New — database**

- `supabase/migrations/027_explorer_markers.sql` — full foundation (see below). **Not applied anywhere; staged only.**

**New — domain libs (pure, unit-tested)**

- `src/lib/explorerMarkers.ts` — tiers, milestone config mirror, progression, inventory ledger math, note validation, display sorting, grace window.
- `src/lib/journeyPulse.ts` — Journey Pulse weights/decay/caps/state thresholds (all configurable in one place), `calculateJourneyPulse`, gentle copy, aria label.
- `src/lib/analytics.ts` — first analytics abstraction in the project (dev console + `xnext-analytics` CustomEvent; provider-swappable). No PII, no note text, no coordinates in any payload.

**New — services**

- `src/services/markerService.ts` — milestones, claim awards, inventory, placement, cancellation, experience markers, discovery, keepsakes, reporting. All sensitive ops go through SECURITY DEFINER RPCs.
- `src/services/communityService.ts` — aggregate metrics + privacy-filtered activity.
- `src/services/journeyPulseService.ts` — derives pulse activity from existing trusted records (no duplicate activity log, no snapshot table in v1).

**New — hooks**

- `src/hooks/useExplorerMarkers.ts` — `useExplorerProgression`, `useMarkerInventory`, `useExperienceMarkers`, `useMyMarkerDiscoveries`, `useMyPlacedMarkers`, `useCommunityMetrics`.
- `src/hooks/useJourneyPulse.ts`

**New — components**

- `src/components/people/PeopleSheet.tsx` — 80dvh sheet shell (drag handle, swipe-down dismiss, close button, tabs, session tab memory, safe areas, contained scrolling).
- `src/components/people/JourneyPulsePill.tsx` — pill + expandable detail panel (skeleton while loading, non-blocking failure state).
- `src/components/people/CommunitySection.tsx` — World in Motion, Journey Activity, Explorer Spotlight (empty-state, no invented users), preserved "Share XNEXT".
- `src/components/people/MyJourneySection.tsx` — level card, stats, recent adventures (preserves prior People activity data), member-since.
- `src/components/people/MarkersSection.tsx` — inventory with locked-tier hints, placed markers (+ 24h cancel), keepsake collection.
- `src/components/markers/MarkerTierIcon.tsx` — SVG tier symbols (cairn / summit flags / faceted compass / crowned beacon), text labels always alongside.
- `src/components/markers/MarkerPlacementFlow.tsx` — tier → note/photo → explicit confirmation (Legacy-specific warning).
- `src/components/markers/ExperienceMarkerSummary.tsx` — compact tier summary, "Explorer Marker Nearby" tap-to-reveal, Add to My Journey, report, Leave a Marker.

**Modified**

- `src/lib/supabase/types.ts` — new row types + `Database` tables/functions entries; `journey_visibility` on Profile.
- `src/components/layouts/DashboardLayout.tsx` — People now renders `<PeopleSheet>` (80dvh); old inline 65dvh People block removed; Pulse sheet untouched; Share XNEXT moved into CommunitySection.
- `src/components/map/QuestPreviewCard.tsx` — detail sheet now renders `ExperienceMarkerSummary` alongside (never replacing) verification, Explorer Notes, and photos.

**New — tests**

- `tests/explorerMarkers.test.ts` (20 tests)
- `tests/journeyPulse.test.ts` (16 tests)

---

## Database migration summary (027)

- `profiles.journey_visibility` — `public | community | private`, default `community`.
- `explorer_marker_milestones` — **single source of truth** for progression levels and marker awards (Trail 1 → Legacy 500; award quantities 3/2/2/2/1/1). UI reads this table; `DEFAULT_MILESTONES` in TS mirrors the seed as offline fallback. Nothing hardcodes thresholds.
- `explorer_marker_awards` — append-only ledger; `UNIQUE (user_id, milestone_key)` makes awards idempotent and unclaimable twice; records reason + completion count at award.
- `explorer_markers` — placed markers with `status` (`active | retired | removed_by_moderation`), `consumed` flag (inventory return semantics), `level_name_at_placement`, `placed_at`, `locked_at` (grace end = placement + 24h), `retired_at`. Partial unique index enforces **one active Legacy Marker per explorer at the DB level**.
- `explorer_marker_discoveries` — keepsakes; `UNIQUE (marker_id, user_id)` prevents duplicate discoveries; optional `completion_id` link.
- `explorer_marker_reports` — moderation intake, one report per user per marker.

**SECURITY DEFINER functions (the only write path):**

- `claim_explorer_milestones()` — computes verified completions (`COUNT(DISTINCT quest_id)` of live completion rows — deleted completions stop counting automatically), inserts qualifying awards with `ON CONFLICT DO NOTHING`. Idempotent, auditable, recalculable.
- `place_explorer_marker(quest, tier, note, photo)` — validates auth, tier, note (≤120 chars, no URLs — also a DB CHECK), completion requirement, published experience, ledger-derived inventory, Legacy uniqueness; stamps level-at-placement.
- `cancel_explorer_marker(marker)` — owner-only, active-only, only before `locked_at`; sets `retired + consumed=false` (returns to inventory, record kept — never deleted). After 24h markers are permanent in v1.
- `discover_explorer_marker(marker, lat, lng)` — eligibility = own completion of the experience OR `ST_DWithin` of the quest's real location within `COALESCE(location_radius_m, 500)` meters (same PostGIS geography as `find_quests_nearby` — no second proximity system). Rejects own markers and duplicates. Discovery never removes the marker.
- `report_explorer_marker(marker, reason)` — moderation intake.
- Read RPCs: `get_experience_markers` (privacy applied in-database), `get_my_marker_inventory` (ledger-derived, never client-mutable), `get_community_metrics`, `get_community_activity` (day-granularity, names only for `public` visibility).

## RLS and security summary

- All five new tables have RLS enabled, deny-by-default.
- Awards/discoveries: SELECT own rows only; **no INSERT/UPDATE/DELETE policies exist** — users cannot grant themselves awards, manufacture inventory, forge discoveries, or create multiple Legacy Markers (also DB-unique-indexed).
- Markers: raw SELECT is **owner-only** (hardened — see the hardening section below); other users' markers are readable only through the visibility-applying RPCs. No user INSERT/UPDATE policies (placement/cancel via functions); admin SELECT + UPDATE policies (matching the project's `profiles.is_admin` pattern) for moderation.
- Reports: INSERT via function; SELECT admin-only.
- Milestone config: SELECT for authenticated.
- Private profiles: `get_experience_markers` returns "An explorer" with note/photo withheld; the owner always sees their own complete record. Raw `explorer_markers` rows expose only `owner_user_id` (a UUID — profiles of other users are unreadable under existing RLS, consistent with `quests.created_by`).
- Function grants: `authenticated` only; write functions revoked from `anon`.
- Disabled buttons are UX only — every rule is re-validated server-side.
- **Known limitation (pre-existing architecture):** discovery coordinates come from client GPS, like the rest of the app (completion itself has no proximity requirement today). The server enforces the radius against the quest's true location, but coordinates are client-reported. Flagged under product decisions.

## Marker award / placement / discovery logic

Covered above; inventory is always `awarded − active − permanently consumed`, computed server-side (`get_my_marker_inventory`) with an identical pure TS mirror (`computeInventory`) that is unit-tested. Moderation removal is **consuming** (does not return inventory) — explicit policy, documented in the migration header, changeable via the `consumed` flag.

## Journey Pulse

- Private momentum indicator (0–100) at the top of the People sheet, visible across all three tabs; never in community activity, never ranked, never public.
- Calculated from trusted records only: completions (+first-category, Dream List, seasonal bonuses), Explorer Notes, photo-bearing completions, marker placements (cancelled/moderated excluded), discoveries. Nothing for app opens/scrolling/screen time; client can't submit a value.
- Config in one place (`lib/journeyPulse.ts`): weights (20/5/5/6/3/3/2/2/3), decay (1.0 / 0.65 / 0.3 / 0.1 / 0 across 14/30/60/90 days), caps (1 photo + 1 note per experience, 5 discoveries per day, once per marker), states (quiet/awakening/steady/rising/thriving), trend threshold.
- Trend compares current vs previous 30 days; cooling copy is gentle ("Your journey has been quieter recently."). Low pulse never touches levels, markers, or history (unit-tested).
- Loading = skeleton (never a fake 0); failure = "Journey Pulse unavailable / Your Journey history is still safe." without blocking tabs.
- `verification_contribution` is wired in config but not fed in v1 (completing a quest *is* today's verification signal — counting both would double-count). No snapshot table in v1 (optional per spec); add one with `calculation_version` if performance requires.

## Analytics events

`people_sheet_opened`, `people_tab_selected`, `marker_inventory_viewed`, `marker_placement_started/confirmed/cancelled`, `legacy_marker_started/confirmed`, `marker_discovered`, `marker_added_to_journey`, `marker_reported`, `journey_pulse_viewed`, `journey_pulse_details_opened`, `journey_pulse_discover_nearby_selected`. Payloads carry tier/tab/state/trend only — no notes, no coordinates, no ledgers.

## Tests added (36 new; full suite 54)

Explorer Markers: threshold boundaries (0 / exactly-at / above-several / NaN), configurable thresholds honored, unlock hints ("Complete 37 more…"), inventory ledger math (cancellation returns, moderation consumes, never negative, zero-completion users), note validation (empty/limit/URLs), summary sorting + tier order, grace window (including invalid dates).

Journey Pulse: zero activity, first completion, accumulation, all decay boundaries, >90-day exclusion, future timestamps ignored, duplicate-id exclusion, once-per-marker discovery, per-experience photo/note caps, per-day discovery caps, 0–100 clamping, inclusive state bands (+ config tiles 0–100 with no gaps), rising/steady/cooling trends, gentle cooling copy (asserts no "dropped/behind/failed/streak"), pulse-never-touches-progression, aria label.

DB-enforced behavior (RLS, award idempotency under concurrency, placement/discovery eligibility, Legacy uniqueness, cross-user edit rejection) lives in SECURITY DEFINER functions + constraints and can't run in the pure-node harness — covered by the QA checklist below and enforced structurally (unique constraints/indexes make double-claims and duplicate discoveries impossible even under concurrent requests).

## Commands run and results

- `npm test` — **54/54 pass** (node:test via the existing RC5 harness).
- `npx tsc -b` — **clean**.
- `npx eslint .` — repo-wide **63 problems, all pre-existing** (baseline before this work: 70; the new code introduces zero lint errors and removed 7 with the replaced People block). Every new file lints clean.
- `npm run build` — `tsc -b` passes; vite transform of all 171 modules succeeds. The final `dist/` emptying step fails **in this sandbox only** (`EPERM: unlink dist/assets/…` — the mount forbids deleting pre-existing files). Verified end-to-end with `npx vite build --outDir /tmp/xnext-dist-verify` → **✓ built in 298ms**. Expect `npm run build` to pass normally on your machine.
- No migration was applied; no deploy, no push, no production data touched.

## Remaining product decisions

1. **Discovery coordinate trust** — server checks radius, but coordinates are client-reported (same as the whole app). If completion later gains proximity verification, discovery inherits it automatically (shared rule).
2. **Moderation return policy** — currently: removal consumes the marker. Flip `consumed` in moderation tooling to change.
3. **Legacy relocation** — v1 has no post-grace retirement; a future "retire + re-place" flow needs product definition (history is already auditable to support it).
4. **`journey_visibility` UI** — the column + enforcement exist; a settings control (`JourneyVisibilitySettings`) wasn't added since Trust & Privacy page placement is a product call. Default is `community`.
5. **Journey Pulse sharing opt-in** — explicitly out of scope per spec.
6. **Marker photo uploads** — v1 attaches existing experience photos only; fresh uploads (with image moderation hooks) are a follow-up.
7. **Milestone tuning** — all values live in `explorer_marker_milestones` + `lib/journeyPulse.ts`; changing them requires no UI edits.

## Final screens (description)

- **People sheet**: 80dvh rounded-top dark sheet over the radar; drag handle; "PEOPLE / EXPLORER COMMUNITY" header with 44px close; Journey Pulse pill (value · trend chip · one-line explanation), tap → detail panel with "What moved your pulse", privacy note, "Discover Something Nearby"; segmented Community | My Journey | Markers; content scrolls internally; safe-area padded; swipe-down or ✕ dismisses; map + selection preserved.
- **Community**: World in Motion 2-col stat cards (only real non-zero metrics; growth empty-state otherwise); Journey Activity evidence rows with day-granularity dates; Explorer Spotlight empty-state; Share XNEXT card.
- **My Journey**: level card with next-milestone line + member-since; 3-col stats (completions, Dream List, Explorer Score, markers earned/placed/discovered); recent adventures with Memories link.
- **Markers**: six tier rows (icon + label + meaning + "N available" or "Locked" with the exact unlock hint); "On the trail" placements with Cancel (during grace) / Permanent; Keepsakes list with empty state.
- **Experience detail**: "Explorer Markers" block under the completed banner — tier summary sorted Legacy→Trail, "🧭 Explorer Marker Nearby — tap to reveal" when eligible, expanded cards (tier, name-or-"An explorer", level at placement, note, photo, date, journey count, Report, Add to My Journey), "⛳ Leave a Marker" when completed.
- **Placement flow**: bottom modal — tier picker with live counts → note (120-char counter, URL rejection) + photo strip → confirmation ("You are leaving one of your limited Gold Markers here…"; Legacy: "You only receive one Legacy Marker. Choose a place that represents your journey." + 24h note).

## Security & concurrency hardening pass (pre-apply, v2)

Applied directly to the staged 027 (it has never been applied anywhere, so no follow-up migration was needed).

**1. Raw marker privacy.** The old policy exposed all active rows (`owner_user_id`, `note`, `photo_url`) to any authenticated user. Replaced with owner-only SELECT plus an admin read policy:

```sql
CREATE POLICY "Users read their own markers"
  ON public.explorer_markers FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "Admins read all markers"
  ON public.explorer_markers FOR SELECT
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
```

Other users' markers are now readable **only** via `get_experience_markers()` / `get_my_keepsakes()` / `get_community_activity()`, all of which apply `journey_visibility`. Because the keepsake view previously relied on a client-side join into `explorer_markers`, a new `get_my_keepsakes(p_limit)` RPC was added (discovery + marker preview + quest title, with a private owner's note withheld) and `markerService.getMyKeepsakes()` now calls it. Frontend audit: every remaining direct table read is owner-scoped (`getMyPlacedMarkers`, journey-pulse queries) or reads the config table — confirmed by grep and by DB test.

**2. Completion-count restriction.** `count_verified_completions(uuid)` accepted an arbitrary user id. It is now internal-only, with a no-arg client variant:

```sql
CREATE OR REPLACE FUNCTION public.get_my_verified_completion_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.count_verified_completions(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.count_verified_completions(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_verified_completion_count() TO authenticated;
```

Additionally, **every** marker function now gets `REVOKE ALL ... FROM PUBLIC, anon` before its grant — Postgres grants EXECUTE to PUBLIC on new functions by default, which the original grants block did not neutralize. `markerService.getMyVerifiedCompletionCount()` now calls the no-arg RPC.

**3. Placement concurrency.** `place_explorer_marker` had a read-then-insert race on inventory. A transaction-scoped advisory lock keyed by (user, tier) now serializes competing placements before the inventory calculation:

```sql
PERFORM pg_advisory_xact_lock(
  hashtextextended('explorer_marker_place:' || v_user::text || ':' || p_tier, 0)
);
```

Different users and different tiers never contend; the lock releases at COMMIT/ROLLBACK. A real two-connection race test proves exactly one of two concurrent placements succeeds when one marker remains.

**4. Completion validity audit.** `quest_completions` (001 + 026) has **no** soft-delete, invalidation, moderation, verification, or status column — invalid completions are hard-deleted, so live rows are valid by definition under the current schema. This is now documented on `count_verified_completions`, which is the single choke point for progression, awards, placement, and discovery eligibility: if a validity column is ever added, the filter goes there once.

**5. Coordinate trust (documented, unchanged behavior).** Discovery keeps PostGIS radius validation for this phase. The migration and this report now state explicitly: `p_lat/p_lng` are client-reported GPS, spoofable, and **not** proof of physical presence — discovery is not tamper-proof. It matches the trust level of the existing completion flow and inherits any future presence hardening through the completion-based eligibility path.

**Also fixed by the DB test run:** `get_community_activity` selected six columns (including the internal `ts` sort key) against a five-column `RETURNS TABLE` declaration — a `42P13` error that would have failed on first call in production. The outer SELECT now lists the five declared columns explicitly.

**New DB test harness.**

- `supabase/tests/harness_shim.sql` — local-only scaffolding (auth.uid() GUC shim, anon/authenticated roles with Supabase-style grants, haversine `ST_DWithin` stand-in, minimal parent tables). Never apply to a Supabase project.
- `tests/db/markerDb.test.mjs` — 14 tests: performs a full schema reset + fresh 027 application, then verifies: internal function not executable by authenticated (cross-user count blocked); own-count RPC correct per user; anon blocked from claim/place; award idempotency + forgery blocked + cross-user award reads empty; placement rejected without completion / long note / URL note / empty inventory; inventory depletes exactly to zero; B cannot SELECT/UPDATE/DELETE A's raw marker rows while the owner sees all; community-name vs private-anonymization in `get_experience_markers` (owner still sees own record); discovery remote-rejected / nearby-accepted / duplicate-rejected / own-marker-rejected, keepsakes RPC withholds a private owner's note, marker never removed; Legacy uniqueness; grace-window cancellation returns inventory and preserves the audit row; post-grace cancellation rejected; and the two-connection concurrency race (exactly one success, ledger shows 3 active, never 4).
- Opt-in by design (needs a database): `DATABASE_URL=postgres://... node --test tests/db/markerDb.test.mjs`. Requires the new devDependency `pg`. The run resets the target DB's schemas — point it only at a disposable local database.

**Hardening validation results:** migration applied to a fresh local Postgres (full reset, twice); DB tests **14/14 pass** (including RLS, inventory, and the concurrent-placement race); unit tests **54/54 pass**; `tsc -b` clean; lint — zero errors in all new/changed files, repo-wide count unchanged at 63 pre-existing; production build **✓** (fresh out-dir; `dist/` deletion still blocked by this sandbox only). Nothing deployed, pushed, or applied to production.

## Dev-environment validation (v3 — real Supabase, 2026-07-12)

**Environment.** No remote environment existed anywhere (the connected Supabase org had zero projects; the repo's env files are empty/placeholder), which confirms 027 was never applied to any shared or remote environment — and also means no parent project existed to branch from. A **disposable dev project** was created instead (the functional equivalent): `xnext-markers-dev-disposable`, ref `vyipvsrmxirpdkbkfpsp`, us-west-1, $0/month, deletable at any time. **No production exists; nothing was merged, pushed, or deployed.**

**Migration application result.** The full real chain was applied in order — `000_enable_postgis`, `001` … `026`, then **`027_explorer_markers` verbatim (md5 3b217267a3eb06b7ab91574cb9059341): success**. All 15 entries are in the project's migration history. Two findings from applying the real chain: (1) **`profiles.is_admin` is referenced by 018+ policies but never created by any migration** — it must have been added manually in the original project; the dev application adds it explicitly and the repo's 018 (or a new migration) should too. (2) `001`'s `geography(Point,4326)` needed `extensions.`-qualification on hosted Supabase (PostGIS lives in the `extensions` schema); 019+ already do this.

**Regenerated types.** `supabase gen types typescript` output saved verbatim to `src/lib/supabase/types.generated.ts`. All 12 marker/community function signatures match the frontend RPC calls exactly (names, args incl. optionality, return shapes) — `get_my_verified_completion_count: { Args: never; Returns: number }`, `place_explorer_marker { p_quest_id, p_tier, p_note?, p_photo_url? }`, etc. `count_verified_completions(uuid)` appears in the types (it exists in the schema) but is not client-executable. One caveat: typegen marks `RETURNS TABLE` columns non-nullable (e.g. `note: string`), while the hand-authored types the app imports say `string | null` — the hand types are the safer contract; migrating the app onto the generated file is a separate refactor decision.

**QA results on the real stack — 32/32 pass**, run against real PostGIS/auth/RLS with the two seeded accounts via role impersonation (the same mechanism as the dashboard): anon denial (claim + place), arbitrary-user count denied / no-arg count correct per user (A=2, B=0), claim idempotency (1 then 0), award forgery blocked by RLS, cross-user award reads empty, placement guards (no completion / 121 chars / URL note / no inventory), inventory depletes 3→0 with 4th rejected, **B sees zero raw marker rows via table AND via REST** (anon REST `GET /rest/v1/explorer_markers` → `[]` with 4 active markers present), B cannot UPDATE A's markers, full **visibility matrix** (community: name shown in experience view but NOT in community activity; public: name shown in both; private: "An explorer" + note withheld; private owner still sees own record), discovery (remote and far-coords rejected, within-500 m accepted by real `ST_DWithin`, duplicate rejected, own-marker rejected, marker never removed), keepsake privacy (private owner's note withheld through `get_my_keepsakes`), Legacy uniqueness, grace cancellation (inventory returned, audit row kept), post-grace cancellation rejected.

**service_role audit.** `has_function_privilege` on all 12 functions: service_role **already has EXECUTE everywhere** via Supabase's default privileges (granted independently of PUBLIC, so the `REVOKE … FROM PUBLIC, anon` does not touch it) — including the internal `count_verified_completions(uuid)`, which is correct for a trusted backend role. **No explicit service_role grants are needed**; anon has EXECUTE nowhere; authenticated matches the intended surface exactly.

**Differences: local harness vs real Supabase.** (1) Harness had no `service_role`/default-privilege machinery — the real project confirms service_role access implicitly, which the harness could not. (2) Harness shimmed `ST_DWithin` with haversine; the real PostGIS accepted the same calls and distances (both accepted ~15 m offsets, rejected far coordinates). (3) `auth.uid()` GUC shim behaved identically to real GoTrue claims. (4) The real chain surfaced the `is_admin` migration gap and the `geography` schema-qualification issue, which the minimal harness could not. No behavioral differences were found in 027 itself — every harness test outcome reproduced on real Supabase.

**Test accounts (dev project only):** `explorer.a@xnext.dev` and `explorer.b@xnext.dev`, password `XnextDev!2026` (real GoTrue rows; A has 2 completions, placed markers incl. a permanent Legacy at Hidden Falls; B has 1 keepsake). Point the app at it with `VITE_SUPABASE_URL=https://vyipvsrmxirpdkbkfpsp.supabase.co` and `VITE_SUPABASE_ANON_KEY=sb_publishable_rfI0JU0AUbzxTFnc3F0msg_x2PyfXfs`.

**Screenshots — not produced (environment limitation).** This session has no browser that can reach a dev server, and no deployed frontend exists. Producing them: put the two env values above in `.env.local`, `npm run dev`, sign in as each account, capture People (80% sheet + Journey Pulse pill), Markers tab (inventory with Trail available=0, Legacy permanent), pulse detail panel, Leave a Marker flow at Valley of Fire, and the Explorer Marker Nearby reveal as Explorer B. The seeded data makes every screen non-empty.

**Repo revalidation after adding generated types:** `tsc` clean, 54/54 unit tests, generated file lints clean, production build ✓.

**Production-readiness blockers (final list).**

1. **No production/staging Supabase project or env config exists at all** — the app has never run against a real backend (env files are empty). Standing up the real project (or promoting/keeping this dev one) is the largest outstanding step.
2. **`profiles.is_admin` migration gap** — add it to the repo's migration chain before any fresh-environment deploy.
3. **App-level (browser) QA + screenshots** — one human pass with the two seeded accounts (instructions above); includes Journey Pulse loading/failure/low-activity visual states, which are unit-tested but not yet observed in a browser.
4. **Authenticated-JWT REST spot-check** — anon REST verified; repeating the raw-table read with a signed-in user's token is part of the browser pass (SQL-level equivalent already passes).
5. **Concurrent placement on hosted infra** — the advisory-lock race was proven with true parallel connections locally; the hosted project ran the same function code, but a two-client race wasn't reproducible through the single-connection MCP tool. Low risk; re-runnable with `tests/db/markerDb.test.mjs` pointed at the dev project's connection string.
6. Previously listed product decisions (coordinate trust, moderation return policy, Legacy relocation, `journey_visibility` settings UI, marker photo uploads) remain open but non-blocking.

## Manual QA checklist

1. Apply 027 to a **dev** Supabase project (`supabase db push`); confirm `explorer_marker_milestones` has 6 rows.
2. New user → People: pulse "begins with your first experience"; Community shows growth empty state; Markers shows all tiers Locked with unlock hints ("Complete 1 more verified experience to unlock Trail.").
3. Complete an experience → reopen People → Markers: 3 Trail Markers available; re-open repeatedly → still 3 (idempotent). My Journey shows Trail Explorer; pulse ≈ 20 Awakening.
4. Experience detail (completed) → Leave a Marker → Trail → note with a URL rejected; 121 chars rejected; valid note → confirmation → place. Summary shows "1 Trail"; inventory 2.
5. Within 24h: Markers tab → Cancel → inventory back to 3; record retired (not deleted) in DB.
6. Second account: attempt `insert into explorer_marker_awards` / `explorer_markers` / update another user's marker via API — all rejected by RLS. `place_explorer_marker` at an uncompleted experience → "Complete this experience before leaving a marker".
7. Second account at the experience (or with a completion): detail shows "Explorer Marker Nearby" → reveal → Add to My Journey → appears in Keepsakes; second attempt → "Already part of your journey"; marker still visible to everyone.
8. `discover_explorer_marker` with far-away/no coords and no completion → rejected.
9. Set profile `journey_visibility='private'` → other users see "An explorer", no note/photo; owner still sees everything.
10. SQL: try to insert a second active Legacy marker for one user → unique index violation.
11. Sheet UX on mobile viewport: ~80% height, radar visible above, drag-down dismisses, tab scroll doesn't scroll the page, tab choice survives close/reopen (session), reduced-motion disables skeleton pulse/transitions, bottom nav unobstructed after close.
12. Kill network → open People: pulse shows unavailable message; tabs still open with their own loading/error states.
