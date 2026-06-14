# Maps Implementation Report

**Audit Date:** Current repository state  
**Context:** Claim of "Google Maps integration completed and merged" — this report documents exactly what exists in the filesystem and source tree. No speculation.

## 1. What was built
Nothing using the Google Maps platform / JavaScript SDK / React wrappers was built.

The only geospatial capability present is **backend preparation for "Adventure Radar" / opportunity discovery**:
- Database column support for `quests.location_point` (typed as `unknown | null`, intended as PostGIS `geography`).
- A single new Supabase RPC: `find_quests_nearby` (see migration 014).
- Client service wrapper `questService.getNearbyQuests(latitude, longitude, radiusKm, options?)` that calls the RPC and returns `NearbyQuest[]` (includes `distance_km`).
- Dedicated TypeScript type `NearbyQuest`.
- `getNearbyQuests` is exported and typed but **never called** from any page or component (HomePage uses `listPublishedQuests` only; QuestsPage uses class filters).

No map rendering, no pins, no "near me" button, no geolocation permission flow, no quest location picker during creation (creation UI does not exist anyway).

## 2. How it works
The RPC (PostGIS):
- Takes `p_lat`, `p_lng`, `p_radius_km`, optional `p_limit`/`p_offset`.
- Filters: `status = 'published'` AND `location_point IS NOT NULL`.
- Uses `ST_DWithin(location_point, ST_MakePoint(p_lng, p_lat)::geography, p_radius_km * 1000)` for radius.
- Computes `ST_Distance(...) / 1000.0 AS distance_km`.
- Orders: `distance_km ASC, sq_score DESC NULLS LAST`.
- Applies pagination.

Service layer returns the projected row set as `NearbyQuest[]` (or error). No client-side distance math or post-filtering (per explicit comments in code).

All other "map" behavior is aspirational (referenced in VISION.md under Adventure Radar + Opportunity Discovery and in older service comments).

## 3. File structure
**Present (geospatial only):**
- `supabase/migrations/014_find_quests_nearby_rpc.sql` (the RPC definition + comments referencing prior PostGIS setup in unpresent migrations 009+)
- `src/lib/supabase/types.ts`:
  - `location_point: unknown | null` on `Quest`
  - `export interface NearbyQuest { ... distance_km: number }`
  - `find_quests_nearby` entry under `Database.public.Functions`
- `src/services/questService.ts`:
  - `export interface GetNearbyQuestsOptions { limit?: number; offset?: number }`
  - `getNearbyQuests(...)` implementation (uses `(supabase.rpc as any)` per project convention for RPCs)
  - Re-export of `NearbyQuest`
  - JSDoc explicitly stating "No client-side distance math"

**Completely absent:**
- Any `components/maps/`, `components/Map.tsx`, `hooks/useGeolocation.ts`, `hooks/useNearbyQuests.ts`, etc.
- No additions to `App.tsx` routes for a radar/map page.
- No entries in `DashboardLayout.tsx` nav for "Radar" or "Map" (Home/Quests/Pulse/Dream List only).
- No Google Maps script loader, no `<GoogleMap>`, no `@googlemaps/js-api-loader`, no react-google-maps, leaflet, maplibre, or vis.gl packages.
- No `VITE_GOOGLE_MAPS_API_KEY` or similar references.

## 4. Data flow
Intended (but not wired):
```
User location (browser or manual) 
  → questService.getNearbyQuests(lat, lng, radius, {limit:20})
  → supabase.rpc('find_quests_nearby', {p_lat, p_lng, p_radius_km, ...})
  → PostGIS on quests table (published + has point + ST_DWithin)
  → return rows + distance_km
  → UI (list or map pins)
```

Actual flow today: The function exists and can be called from dev tools / future components, but no page invokes it. HomePage and QuestsPage use non-geospatial queries only.

## 5. Supabase interactions
- Pure RPC call (no `.from('quests').select(...)` fallback — code explicitly avoids this).
- Uses the same `supabase` client singleton (typed with hand-authored `Database`).
- Relies on RLS + explicit `published` filter in SQL (SECURITY INVOKER, no DEFINER).
- Returns a projected table (not full Quest row) for bandwidth / feed use.
- No Realtime subscriptions for location changes.

## 6. PostGIS interactions
- Assumes PostGIS extension + `geography` column + spatial index already exist on `quests.location_point` (comments say "from prior migrations e.g. 009", but only 014 SQL file is present in repo).
- Correct use of `ST_MakePoint(lng, lat)` (longitude first), `ST_DWithin` (radius in meters), `ST_Distance` for derived km value.
- No client Haversine (good).
- Migration contains safety comments: does not modify tables, does not weaken RLS, explicit published filter.

## 7. Performance optimizations
- Server-side (RPC) does the heavy lifting: spatial index presumed, limit/offset pushed down, minimal selected columns.
- Service supports pagination options (good for "load more").
- No unnecessary joins in the RPC (unlike dream list which does quest join).
- No client-side filtering or sorting of large result sets.

No frontend perf work (virtual lists for pins, clustering, viewport culling, etc.) because no map exists.

## 8. Security considerations
- Explicit `WHERE status = 'published'` + `location_point IS NOT NULL` in SQL — prevents leakage of drafts/private quests even if RLS is bypassed or misconfigured.
- SECURITY INVOKER (default) — RLS policies of the calling user still apply.
- No user-provided SQL or geometry construction from untrusted input beyond the three numeric params (lat/lng/radius) — these are passed as RPC args (Postgres will cast/validate).
- Avatar storage precedent exists (profileService), but no equivalent quest media/location upload path yet.
- No API key exposure issues because no Google Maps client key is used or referenced.

## 9. Mobile considerations
- None implemented. The existing app has a responsive sidebar (lg:static + drawer on mobile) and Tailwind grids, but:
  - No map would be touch-optimized (pin dragging, bottom sheet for details, etc.).
  - No use of `navigator.geolocation` with permission UX or fallback to IP/city.
  - No consideration for high-DPI tiles, battery impact of continuous location, or offline map caching.
- The RPC itself is mobile-friendly (small payload with limit).

## 10. Known limitations
- **No frontend at all** — the "Google Maps integration" does not exist in the repository. The PostGIS RPC is infrastructure only.
- `getNearbyQuests` is dead code until a page calls it and renders results.
- Depends on uncommitted / un-audited prior migrations (PostGIS enablement, geography column + index, RLS policies on quests).
- `location_point: unknown | null` in TS (not a proper GeoJSON or PostGIS type) — any client insert would need manual casting.
- No quest creation flow means no way for users to populate `location_point` values today.
- No error handling or fallback in service for when PostGIS extension / column is missing on the actual Supabase project.
- RPC name and args are now declared in types, but call still uses `as any` (project-wide pattern for RPCs; inference for set-returning functions is fragile).
- No integration with Pulse (e.g. "proximity" trigger) or Dream List or SQ scoring (distance_factor exists in scoring_factors table but is server-side only).

**Summary for this audit:** The maps-related work in the current tree is limited to one migration + supporting types + one service method that is not yet consumed by any UI. A true Google Maps (or equivalent) integration for discovery, creation, or visualization has not been added.
