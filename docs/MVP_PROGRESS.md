# XNEXT MVP Progress Report

**Scope:** Core MVP areas identified in VISION.md and implemented code (Quests, Dream Lists, Adventure Radar, SQ Score, Opportunity Discovery, plus supporting auth/orgs/pulse).

Ratings use only: **COMPLETE** | **PARTIAL** | **NOT STARTED**

## Authentication
**COMPLETE**

- Full Supabase email/password flows (Login, Signup, ForgotPassword, ResetPassword pages).
- ProtectedRoute + AuthProvider + useAuth hook (user, session, profile, refreshProfile, loading).
- Session persistence (PKCE), auto refresh.
- Global catch-all redirects and invite route (semi-public).

## User Profiles
**COMPLETE**

- ProfilePage: editable full_name, username, bio, website + avatar upload.
- profileService: updateProfile + uploadAvatar (Supabase Storage `avatars` bucket, public URL, profile row update).
- Integrated with AuthContext refresh.
- Basic validation (file type/size) on client.

## Quest System
**PARTIAL**

**Working:**
- Full read path: listPublishedQuests (filters for class/city/tags, pagination, sq_score + published_at sort), getQuestsByClass, searchQuests, getQuestById (QuestByIdResult).
- QuestsPage: class filter buttons (All/Wonder/Opportunity/Transformation/Connection), responsive grid cards (experience_class pill, SQ score, title, short desc, location, published date), links to detail.
- QuestDetailPage: displays title, description, class, sq_score, location fields, tags, external_url, availability/scoring placeholders. "Save to Dream List" action (checks existing via getDreamListItemByQuestId, calls addToDreamList, updates local state).
- Types: Quest, QuestStatus, ExperienceClass, QuestByIdResult, scoring/availability shapes (as nulls per design).
- Quest service + getNearbyQuests (see Adventure Radar).

**Missing / Partial:**
- No create/edit quest UI or client methods (drafts, pending_review, location_point population, media).
- No authoring flow for organizations.
- Admin review/publish path not present in client.
- Quest chains data layer complete but zero UI.
- No quest completion / story posting UI (schema exists).

## Dream Lists
**COMPLETE**

- dreamListService: getMyDreamList (status/experience_class filters + joined quests data as DreamListItemWithQuest), addToDreamList (defaults 'saved'), updateDreamListItem, removeFromDreamList, getDreamListItemByQuestId, markDreamListItemCompleted.
- DreamListPage: status filter buttons (All/Saved/Planned/Completed/Dismissed), loading/error/empty states, cards with joined quest title/class/sq or fallback, priority, target_date, notes, created/completed dates.
- Full action set wired (Mark Planned/Completed/Dismiss/Remove) with refresh.
- Types + DreamListStatus enum complete.
- Used from QuestDetailPage and HomePage preview.

## Pulse Engine
**COMPLETE**

- pulseService: getMyPulseAlerts (various filters), getActivePulseAlerts (limit/offset, not dismissed + not expired), getPulseAlertById, markPulseAlertRead, dismissPulseAlert, markAllPulseAlertsRead, getUnreadPulseCount.
- PulsePage: header with unread count badge, list of active alerts (triggered_by formatted, sq_score_at_trigger, created_at, expires, quest_id link), Mark Read / Dismiss buttons that refresh list + count.
- LoadingState / ErrorState used.
- Types: PulseAlert, PulseTrigger complete.
- Integrated in HomePage top-3 preview.

## Adventure Radar
**PARTIAL** (strong backend, zero frontend)

**Working:**
- Schema support: `quests.location_point geography`, `location_name`, `city`, `country_code`, `location_radius_m`.
- Migration 014: `find_quests_nearby` RPC (PostGIS ST_DWithin + ST_Distance, published-only, distance_km, sorted, paginated).
- questService.getNearbyQuests(latitude, longitude, radiusKm, options?) — calls RPC, returns `NearbyQuest[]` (clean subset + distance).
- NearbyQuest type + GetNearbyQuestsOptions.
- Explicit "no client Haversine" design + JSDoc.
- location_point typed in Quest interface.

**Missing:**
- No UI page or component (no "Radar", no map, no list of nearby results).
- Not wired into HomePage (Home uses only listPublishedQuests).
- No browser geolocation hook or "Use my location" flow.
- No quest location input during creation (creation doesn't exist).
- No integration with Pulse "proximity" triggers or SQ distance_factor (server-side only).

## Google Maps
**NOT STARTED**

- No Google Maps JavaScript API, no React wrapper (@react-google-maps/api etc.), no Mapbox/Leaflet alternative.
- No API key env var (VITE_GOOGLE_MAPS_* or similar).
- No map components, no script loading in index.html or vite config, no use of google.maps namespace.
- The PostGIS RPC above is generic geospatial (could be used with any map provider or none).
- No quest location picker, no map pins for quests, no "view on map" in detail pages.

## Notifications
**NOT STARTED**

- Pulse table + read/dismiss UI + count exist (see Pulse Engine).
- UserQuestPreference table (pulse_enabled, pulse_min_sq_score, pulse_frequency, preferred_classes/tags, home_location) exists in types.
- No delivery mechanism (email, push, in-app realtime toast, edge function trigger).
- No notification list / preferences UI.
- No use of Supabase Realtime.

## AI Features
**NOT STARTED**

- No OpenAI / LLM calls, no embeddings, no recommendation engine, no "AI companion", no generated summaries or personalized radar.
- sqScoreService is pure math only (no ML).
- VISION references future AI but nothing implemented.

## Payments
**NOT STARTED**

- No Stripe, no subscriptions, no quest sponsorship monetization, no payment tables or services.
- `is_sponsored` + `sponsor_id` fields exist on Quest schema only.

## Admin Tools
**PARTIAL**

**Working:**
- RBAC service + DB functions (has_role etc.).
- auditService (log + get with filters).
- RequireRole / RequirePermission components.
- Admin section in DashboardLayout sidebar (Users, Audit Logs) with icons.
- Some services (org, profile) enforce via RLS + is_org_admin() etc.

**Missing:**
- No routes in App.tsx for `/dashboard/admin/*` (dead nav links).
- No AdminUsersPage, AuditLogPage, or any admin UI components.
- No user impersonation, quest review queue, or moderation tools.

---

**Overall MVP Readiness:** Strong foundation on discovery + personal lists + alerts. Major gaps in authoring, visualization (maps/radar), creation, and admin. See PROJECT_STATUS.md for recommended next sprint.
