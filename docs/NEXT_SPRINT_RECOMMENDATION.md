# Next Recommended Sprint

**Single highest-value next sprint (not a roadmap — one focused body of work).**

## Title
**Adventure Radar UI + Geolocation Integration (consume the existing backend)**

## Why it should be next
The single biggest "wow" and differentiation in the XNEXT vision (per VISION.md and repeated code comments) is **Adventure Radar / Opportunity Discovery** — "show me high-SQ, time-sensitive, nearby experiences."

We have already invested heavily and correctly in the hard parts:
- PostGIS + `location_point` column support (schema)
- `find_quests_nearby` RPC (migration 014) — correct ST_DWithin + distance calc, published-only filter, proper ordering + pagination
- `questService.getNearbyQuests(...)` + `NearbyQuest` type + options (clean, no client fake math)
- `location_*` fields on Quest type
- SQ scoring already has a `distance_factor`

However, **none of this is visible to a user**. HomePage and QuestsPage ignore it completely. There is no map, no "near me" list, no radius control, and no geolocation flow.

Shipping a minimal but delightful Radar experience gives:
- Immediate user value (the "magic" of personalized nearby high-quality quests).
- Proof that the sophisticated backend investment was real.
- A natural home for future Pulse "proximity" triggers and better Home previews.
- Something impressive to demo that goes beyond "browse a list."

Other candidates (full quest creation, orgs completion, admin tools, tests) are important but do not unlock the core product promise as directly as making the Radar real.

## Estimated effort
**2–4 weeks** for a focused 2–3 person team (or 1 senior + contractor).

Breakdown (minimal viable but polished):
- 3–5 days: Hook + service integration (useGeolocation or similar, permission UX, "Use current location" + manual lat/lng fallback, radius slider 1–100km).
- 5–7 days: New page or Home section ("Radar" or "Near Me") that calls getNearbyQuests and renders results (list + optional simple non-Google map or cards with distance badge). Reuse existing QuestCard patterns.
- 2–3 days: Wire into navigation (DashboardLayout + App.tsx route), add to HomePage as a 4th preview or promoted section.
- 3–5 days: Polish (loading skeletons, empty "no quests within radius — broaden or seed more data", error states, "refresh location", distance formatting, responsive).
- Buffer for edge cases (location denied, no quests, mobile GPS accuracy, rate limiting).

Does **not** require Google Maps SDK yet (can start with list + "distance_km" badges + "View on map" stub that opens external Google Maps link, or a very lightweight Leaflet if desired). Full interactive map can be a follow-up.

## Dependencies
- Existing and working: `questService.getNearbyQuests`, `NearbyQuest` type, the 014 RPC (assumes the live Supabase project has PostGIS + the function + some quests with valid `location_point` values + RLS that allows the call).
- Supabase project must have the geography column + spatial index (referenced in migration comments but the SQL for column creation lives in untracked prior migrations).
- Browser geolocation is native (no extra deps).
- Can reuse all existing UI primitives (LoadingState, ErrorState, card styles, Link to quest detail).

**Blockers if not present:**
- Live DB without the RPC/column → the sprint includes a safe "no data" empty state + seed script or admin tool to add a couple of test quests with points.
- No prior 009-style migration applied → coordinate with whoever owns the Supabase project.

## Risks
- **Data quality / cold start:** If the connected Supabase has zero or very few quests with valid `location_point`, the feature will feel empty. Mitigation: include a "Seed demo data" dev-only button or document how to insert test points.
- **Location permission UX:** Mobile/desktop browsers are strict. Need clear "why we need location" copy and graceful manual entry fallback.
- **Accuracy / privacy:** GPS on mobile can be noisy; we should store/use `home_location` from UserQuestPreference later but not in this sprint. Do not persist precise location without consent.
- **RPC performance:** Assumes the spatial index exists. If missing, queries will be slow on large quest tables. Include a note to verify `EXPLAIN` or add index in the same migration if needed.
- **Scope creep:** Temptation to add full Google Maps rendering, clustering, quest creation with pin drop, etc. in the same sprint. Explicitly out of scope for this focused piece of work.
- **Auth edge:** The RPC is designed to work for both authenticated and anon (like listPublished), but we should verify under the current RLS.

## Expected user impact
**High and visible.**

After this sprint a logged-in user can:
- See "Nearby high-SQ quests" (or "Adventure Radar") as a primary experience.
- Grant location once and immediately get relevant results with real distance numbers.
- Click through to the same rich QuestDetail + Save flow they already know.
- Have a reason to come back ("what's new near me this week?").

This turns the product from "a nice quest browser + todo list" into "a proactive discovery engine" — exactly the promise of XNEXT / SQ.

It also gives the team a concrete, demoable artifact that justifies the sophisticated SQ scoring + Pulse + PostGIS work already done.

---

**Recommendation:** Prioritize this over new authoring or admin tools for the next 2–4 weeks. Once users can *feel* the radar, the value of being able to create quests and manage organizations becomes much clearer and more motivating.
