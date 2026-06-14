# XNEXT Project Status

**Generated:** Lead Engineer audit — current repository state (no assumptions about unmerged or future work).

## Current Completion Percentage
**~40% overall toward core MVP** (Quests + Dream Lists + Pulse + basic Orgs + Auth foundation + Adventure Radar backend).

This is an estimate based on implemented services, pages, data models, and routes versus the documented MVP scope in VISION.md and code comments. Auth + discovery flows are the strongest areas. Authoring, maps visualization, notifications, and admin are weak or absent.

## Working Systems
- **Authentication & Authorization**: Full Supabase auth (email/password, password reset, session persistence with PKCE). Protected routes, role/permission guards (RequireRole, RequirePermission), RBAC service + DB functions (has_role, has_permission, is_org_member, is_org_admin). Audit logging service.
- **User Profiles**: Read + update profile fields. Avatar upload to Supabase Storage (avatars bucket) with public URL + profile update. Integrated with AuthContext.
- **Quest Discovery (read-only)**: 
  - listPublishedQuests + getQuestsByClass + searchQuests (with filters, pagination, sq_score ordering).
  - getQuestById (returns QuestByIdResult shape).
  - Full QuestsPage (class filters, responsive cards with title/desc/class/sq/location, links to detail).
  - QuestDetailPage (full field display including tags, external_url, availability placeholders, scoring placeholders; "Save to Dream List" action wired to dreamListService).
- **Dream Lists**: Complete CRUD + status transitions.
  - getMyDreamList (with status filter, joined quest data via DreamListItemWithQuest).
  - addToDreamList, update, remove, markCompleted.
  - DreamListPage with status filters, cards showing joined title/class/score or fallback quest_id, priority, dates, full action buttons.
- **Pulse Engine (alerts)**: 
  - getActivePulseAlerts, getUnreadPulseCount, markRead, dismiss, markAll.
  - PulsePage with header count badge, cards (triggered_by, sq_score_at_trigger, created_at, expires, quest link), actions that refresh.
- **Home Dashboard Previews**: Real data (top-3) from pulse + dreamList (saved) + quests. Loading state, per-section error tolerance + retry, empty states, "View all" links. Graceful partial failure.
- **Organizations (core membership)**: Service with create (via DB RPC), getUserOrganizations, getById, update. Basic OrganizationsPage (list + "New organization" trigger). Invite accept page exists.
- **SQ Scoring**: Pure client-side calculateSQScore (9 weighted factors, 0-100 scale, correct normalization for 0-100 vs 0-1 fields). Shared SCORE_WEIGHTS. Service stubs for upsert/breakdown/high-SQ (server-only JSDoc notes).
- **Quest Chains (data layer only)**: Full service (list public, get with steps, create/update/delete, add/update/remove steps with ownership + max step_order logic). Dedicated QuestChainWithSteps type. No UI/routes.
- **Data Layer**: ServiceResult<T> + extractMessage centralized. All services use supabase client with user ownership checks where appropriate. Hand-authored Database types matching schema (enums, tables for profiles/orgs/quests/dream_list/pulse_alerts/quest_chains/etc + relationships).
- **UI Primitives**: LoadingState, ErrorState, consistent Tailwind card/grid patterns, responsive sidebar (mobile drawer), NavLink active states.
- **Geospatial Backend Prep (Adventure Radar foundation)**: location_point (geography) + PostGIS support in Quest type. find_quests_nearby RPC (migration 014) + getNearbyQuests service method (calls RPC, returns NearbyQuest[] with distance_km, no client Haversine).

## Partially Completed Systems
- **Organizations / Multi-tenancy**: Service mostly complete. Page has list + create button but full create form/modal and member management incomplete in current tree. Admin nav items present in layout but routes not registered in App.tsx.
- **Settings & Profile Polish**: Profile functional (edit + avatar). SettingsPage exists in routes but minimal implementation.
- **Quest Authoring / Management**: No create/edit quest UI or service methods for drafts/pending_review flow (only published read paths + admin-ish RPCs assumed server-side).
- **Adventure Radar / Discovery Map**: Backend RPC + service + type (NearbyQuest) + location fields ready. **No frontend integration** — not called from HomePage/QuestsPage, no map component, no geolocation hook, no "near me" UI.
- **RBAC / Admin Surface**: Services + guards exist and used in some places. Admin nav items (Users, Audit Logs) in DashboardLayout but no corresponding routes/pages/components implemented.
- **Error/Loading/Empty States**: Consistently applied in working pages but not universal.
- **Service Utils**: Centralized after extraction (used by most services).

## Missing Systems
- **Google Maps / Frontend Mapping**: Zero presence. No @react-google-maps/api, @vis.gl/react-google-maps, leaflet, mapbox-gl or similar in package.json. No Map components, no script tags, no VITE_GOOGLE_MAPS_API_KEY or equivalent. No browser geolocation (navigator.geolocation) usage.
- **Quest Creation & Full Lifecycle**: No UI or client methods to create quests, set scoring_factors, availability_windows, location_point (geography insert). No draft → review → publish flow in client.
- **Adventure Radar UI**: No map view, no "near me" using getNearbyQuests + user location, no radius slider or quest pins.
- **Notifications / Pulse Delivery**: Pulse table + read/dismiss UI exist, but no actual delivery mechanism, email/push, or preference UI (UserQuestPreference type exists in schema).
- **AI Features**: None (no OpenAI calls, embeddings, recommendations, or companion).
- **Payments / Monetization**: None.
- **Tests**: No unit, integration, or e2e tests in the main project (clones in odysseus/openhuman have their own unrelated test suites).
- **Quest Chains UI**: Full backend, zero frontend (no pages, no components, no routes).
- **Admin Tools**: Stubs only (nav + some Require* components).
- **Full Migrations**: Only 014_find_quests_nearby_rpc.sql present in repo. References to 001-013 exist in comments/types but the SQL files are not in the filesystem.
- **Storage / Media for Quests**: Profile avatar storage works; quest media_urls (Json) and completions have schema but no upload UI/service helpers visible.
- **Mobile / PWA specifics**: Basic responsive layout only. No dedicated mobile considerations or Capacitor/Tauri setup in main project.
- **Real-time**: No use of Supabase Realtime subscriptions (only REST via JS client).

## Technical Debt
- Heavy reliance on hand-authored types.ts (commented note to eventually replace with `supabase gen types`). Risk of drift from actual DB.
- Widespread use of `(supabase.rpc as any)` and `as never` for updates/inserts (necessary because of hand types + RLS-protected tables; not ideal).
- ServiceResult sometimes uses `data: null` on error vs `data: []`; callers must handle consistently (mostly do via ??).
- Admin routes declared in layout but missing from App.tsx router (dead links).
- No input validation / optimistic UI in forms beyond basic.
- Quest getById returns phantom scoring_factors/availability_windows as null (per design).
- RPC call in questService still uses "as any" even after adding to Database types (inference limitations with array-returning functions in current @supabase/supabase-js + hand schema).
- .env.local committed in tree with empty values (should be in .gitignore only).
- Many services duplicate the old extractMessage helper (some were updated to import from serviceUtils, others still inline).
- No loading states on all action buttons (e.g. in DreamList/Pulse actions).

## Launch Blockers
1. **No quest authoring** — users/orgs cannot create experiences.
2. **No Adventure Radar / map experience** — core "nearby high-SQ opportunities" promise from vision + Pulse is backend-only.
3. **Incomplete orgs + admin surface** — multi-user workspaces and oversight not shippable.
4. **Zero test coverage** on critical paths (auth flows, quest save, pulse actions).
5. **Missing production env / Supabase project wiring** for full migrations, storage buckets (avatars), RLS policies, the 014 RPC, and any prior 001-013.
6. **No real-time or notification delivery** for Pulse.
7. **Security surface**: Avatar uploads have size/type checks client-side only; no server-side enforcement visible.

## Recommended Next Priorities
1. **Implement Adventure Radar UI** (highest leverage given existing RPC/service/type investment) — e.g. add "Radar" nav item + page that calls getNearbyQuests (with user geolocation or manual lat/lng + radius), render list or simple map placeholder.
2. **Quest creation flow** (minimal viable: form for title/desc/class/location/tags, call to insert as draft or published).
3. **Wire + implement missing admin routes** + basic audit log viewer.
4. **Add basic test harness** (vitest + React Testing Library for at least the 3 main pages/services).
5. **Polish orgs page** to full create + member list (using existing service).
6. **Stabilize types + remove duplicate code** (finish serviceUtils migration, consider lightweight codegen or stricter manual sync process).
7. **Add .env.example + update .gitignore** if not already perfect.

Focus on shipping a coherent "discover + save + pulse + radar preview" loop before expanding authoring or chains.
