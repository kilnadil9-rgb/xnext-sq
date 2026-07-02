# XNEXT — Pre-APK Routing & Admin Listings Audit

**Scope:** Code audit only. No code was modified. This report explains why "LET'S GO" currently leaves the app, identifies every file involved, assesses whether in-app routing is feasible, and recommends an architecture + phased plan. It also covers the two upcoming features (admin manual listings, user yard-sale route mode) and APK-specific concerns.

**Stack as built:** Vite 8 + React 19 + TypeScript, `react-router-dom` 7, `@vis.gl/react-google-maps` 1.5.5, `@googlemaps/markerclusterer` 2.6, Supabase. **There is no native shell yet** — no Capacitor, Cordova, or TWA wrapper anywhere in the repo. XNEXT is currently a single-page web app. This single fact drives most of the APK section below.

---

## 1. The current routing limitation (the core question)

XNEXT *can* keep the map experience inside Home. What it cannot currently do is render an actual **route line / turn-by-turn directions** inside the app. The moment a user wants directions, the app hands off to Google Maps via an external deep link.

The cause is explicit and intentional in the code. `src/components/map/DirectionsLayer.tsx` is the entire "directions" implementation, and its own header comment states the reasoning:

> "XNEXT is not a navigation app. We deliberately do NOT render in-app Google Directions (that required the Directions API to be enabled/billed and was the source of the `DIRECTIONS_ROUTE: REQUEST_DENIED` error). Turn-by-turn is owned by Google Maps via this deep link; XNEXT owns discovery + completion."

So the limitation is **not** a framework limitation. It is the combination of:

1. **A disabled/unbilled Google API.** In-app directions need the **Directions API** (or the newer **Routes API**) enabled and billed on the Google Cloud project tied to `VITE_GOOGLE_MAPS_API_KEY`. It currently returns `REQUEST_DENIED`, so the in-app rendering was pulled.
2. **A product decision made on top of that failure.** Because the API was denied, the team chose to treat Google Maps as the navigation owner and XNEXT as the discovery owner. The route line code was removed and replaced with a deep-link button.
3. **The `'routes'` library is never loaded.** In `MapScreen.tsx` the map is created with `<APIProvider apiKey={...} libraries={['marker', 'places']}>`. There is no `'routes'` entry, so the Directions/Routes client classes aren't even available to the running app.

What the user actually experiences:

- On the compact card, **LET'S GO** (`handleStart`) switches the card to the `route` tier — this stays in-app and is fine.
- Inside the route tier the only navigation action is an `<a href={googleMapsDirectionsUrl(navTarget)} target="_blank" rel="noopener noreferrer">`. `googleMapsDirectionsUrl()` returns `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving`.
- `target="_blank"` to a `google.com/maps` URL opens the external Google Maps app (or a browser tab). In a packaged APK/WebView this is even more jarring — Android fires an external intent and the user is fully ejected from XNEXT.

That hand-off is the behavior that breaks the "one world / one screen" goal.

---

## 2. Exact files & components involved

**Routing / map flow**

| File | Role in the flow |
|---|---|
| `src/components/map/DirectionsLayer.tsx` | The whole "directions" layer today. Only exports `googleMapsDirectionsUrl()` (a deep-link string builder) and the comment documenting why in-app directions were removed. This is where the limitation lives. |
| `src/components/map/QuestPreviewCard.tsx` | The LET'S GO surface. `handleStart()` → `view = 'route'`; the route tier renders the "Open in Google Maps" / "Drive to parking" external link using `googleMapsDirectionsUrl(navTarget)`. Also already supports a `parking_lat/lng` "drive-to-parking" target. |
| `src/components/map/MapScreen.tsx` | The real map engine (`<APIProvider libraries={['marker','places']}>` + `<Map>`). Owns `selectedQuest`, NEXT cycling (`handleNext`), follow-me camera, clustering, Live Mode listeners, and renders `QuestPreviewCard`. This is where an in-app route layer would mount. |
| `src/components/map/GooglePoiSheet.tsx` | Second place that deep-links out via `googleMapsDirectionsUrl()` ("Directions" button on a tapped Google POI). |
| `src/components/map/mapsConfig.ts` | API key, Map ID, fallback/world centers, dark map styles. |
| `src/components/map/QuestClusterer.tsx`, `QuestList.tsx`, `PlaceSearch.tsx` | Pins/clustering, docked nearby list, and the one existing example of `useMapsLibrary('places')` — the same hook pattern a routes layer would use. |
| `src/pages/dashboard/HomePage.tsx` | Home = `<MapScreen cinematic />`. Confirms Home and the map are the same component (the "one screen" intent is already real). |
| `src/components/nav/BottomNav.tsx` | The NEXT button. Tap → `onNext`; **press-and-hold (600 ms)** → dispatches `xnext-live-enter`. This is the only existing long-press affordance and the hook point for the future radial menu. |
| `src/components/layouts/DashboardLayout.tsx` | Wires bottom-nav events (`xnext-next`), hosts the Discover/Timeline/Pulse/People sheets, and the Discover submission flow. |
| `src/App.tsx` | Routes. Note `/dashboard/map` now redirects to `/dashboard` — Home is the single source of truth for the map. |
| `src/hooks/useUserLocation.ts`, `useNearbyQuests.ts` | GPS (gesture-triggered `request()`, `watchPosition`) and the `find_quests_nearby` RPC fetch. |
| `src/lib/distance.ts`, `src/lib/geo.ts` | Haversine distance + EWKT point helpers (used for distance labels; would also seed a route's origin/destination). |

**Listings / admin**

| File | Role |
|---|---|
| `src/services/listingService.ts` | Paid listing model: `LISTING_TYPES`, `LISTING_PACKAGES` (Stripe price IDs, durations), `listingBadge()`, `createListing()` (inserts into `quests` as `pending_review`, `is_paid_listing=true`, `payment_status='pending'`), `createCheckoutSession()`. |
| `src/pages/dashboard/PostListingPage.tsx` | The user-facing paid listing form (lazy route `/dashboard/post-event`). |
| `src/pages/dashboard/AdminReviewPage.tsx` | Admin moderation only: approve→published / reject→archived, plus edit featured flag, expiry, and seasonality on **existing** pending submissions. It cannot **create** a listing. |
| `src/services/questService.ts` | `createQuest()`, `getNearbyQuests()` (calls `find_quests_nearby` RPC), status transitions. The insert path admin-manual-create would reuse. |
| `src/lib/supabase/types.ts` | Schema types. The `quests` table already carries `listing_type`, `tier`, `is_featured`, `starts_at`, `expires_at`, `start_date`, `end_date`, `season_tags`, `active_months`, `is_evergreen`, `parking_point`, etc. (migrations 018/019). The data model for listings largely exists. |

---

## 3. Is in-app routing possible? Yes.

`@vis.gl/react-google-maps` (v1.5.5, already installed) fully supports rendering directions inside the existing `<Map>`. It doesn't ship a drop-in `<Directions>` component, but it exposes the building blocks:

- `useMapsLibrary('routes')` loads `google.maps.DirectionsService` and `google.maps.DirectionsRenderer`.
- `useMap()` gives the live map instance (already used by `LiveRadiusRing` and `PlaceSearch` in this codebase).
- A small component calls `DirectionsService.route({ origin, destination, travelMode })` and binds a `DirectionsRenderer` to the map to draw the polyline. For yard-sale mode, the same call accepts `waypoints[]` plus `optimizeWaypoints: true` to build one optimized multi-stop loop.

The codebase already proves the pattern works: `PlaceSearch.tsx` uses `useMapsLibrary('places')` the exact same way. The "removed/unfinished route sheet logic" referenced in the brief is effectively the `route` tier in `QuestPreviewCard` (still present) minus the renderer that `DirectionsLayer.tsx` used to hold.

**Two real prerequisites, both external to the React code:**

1. **Enable + bill the Directions API (or Routes API)** on the Google Cloud project for the maps key. Without this you get the same `REQUEST_DENIED`. This is a billing/console task, not a code task. (Directions API has usage cost per request; Routes API is the newer replacement Google now steers new projects toward — worth confirming which is enabled.)
2. **Add `'routes'`** to the `APIProvider libraries` array in `MapScreen.tsx`.

Net: in-app routing is feasible with the current dependencies and requires no new mapping library — only an API enablement, a library flag, and a renderer component to replace the deep link.

A note on scope: rendering a **route line + ETA inside XNEXT** is straightforward. Full voice/turn-by-turn *live navigation* is a much larger build and is genuinely better left to Google Maps. The recommendation below keeps that distinction.

---

## 4. Recommended architecture

Keep the map as the hero and add an **in-app route layer** that the existing `route` tier drives, with Google Maps demoted to an optional "hand off to full navigation" escape hatch rather than the default.

**Map layer (new `DirectionsLayer` component, mounted in `MapScreen`):**
- A `RouteLayer` child of `<Map>` that takes `origin` (user GPS), `destination` (selected quest / parking), and optional `waypoints`. It uses `useMapsLibrary('routes')` + `useMap()` to render the polyline and expose `{ distance, duration }` back up to the card.
- Render it only while a route is active (`view === 'route'` or yard-sale mode on), and clear the renderer on close/NEXT so the map returns to discovery cleanly.

**Card layer (`QuestPreviewCard` route tier):**
- Replace the primary action with **"Show route"** (draws the in-app line + ETA, camera fits the bounds). Keep **"Open in Google Maps"** as a smaller secondary link for users who want live turn-by-turn. This preserves one-screen by default while still offering full nav on demand.

**State / events:**
- Reuse the existing `window` custom-event bus (`xnext-next`, `xnext-live-enter/exit`, `xnext-quest-created`). Add `xnext-route-show` / `xnext-route-clear`, and for the new feature a `xnext-mode-yardsales` event from the radial menu.

**Yard-sale route mode:**
- A new `routeMode` state in `RadarScreen` (`'single' | 'yardsales'`). When `'yardsales'`, filter `rankedQuests` to active yard sales for today, feed them as `waypoints` to the same `RouteLayer` with `optimizeWaypoints: true`, and fit the camera to the full loop. No new screen — it all happens on Home.

**Why this shape:** it adds one focused component, reuses the hooks/event patterns already in the app, keeps Google Maps as a fallback (matching "only fall back if absolutely necessary"), and touches the data model minimally.

---

## 5. Step-by-step implementation plan

**Routing (in-app line + ETA)**
1. In Google Cloud, enable the **Directions API** (or Routes API) on the maps key's project and confirm billing. Re-test the previously failing request to clear `REQUEST_DENIED`.
2. Add `'routes'` to `libraries` in `MapScreen.tsx`'s `APIProvider`.
3. Build a `RouteLayer` component (replacing the deep-link-only `DirectionsLayer`) that draws a `DirectionsRenderer` polyline for `origin → destination` and returns `{ distance, duration }`.
4. In `QuestPreviewCard`'s `route` tier, add a **"Show route"** primary action that mounts `RouteLayer`; keep the Google Maps link as a secondary "full navigation" option. Show the returned ETA in the existing `quest-route__stats` slot.
5. Handle camera + cleanup: fit bounds to the route on show; clear the renderer on close, NEXT, or quest change (hook into the existing `useEffect([quest.id])` reset).
6. Keep `parking_point` support: route to parking when present (the card already computes `navTarget`).

**Admin manual listings**
7. Add an admin-only service method (e.g. `listingService.adminCreateListing()`) that inserts into `quests` with `status='published'`, `is_paid_listing=false`, no Stripe/payment requirement, and an `expires_at` derived from type (yard sale = end of its active day; events/businesses = up to ~30 days or an explicit end date).
8. Build an **admin create form** (new page or a "Create listing" panel on `AdminReviewPage`, gated by `profile.is_admin` like the existing review page) capturing: title, description, address (geocode to lat/lng via the Places/Geocoding library already loaded), date/start time, end date or expiration, category/type (`listing_type`), optional image (reuse the `quest-photos` upload path from `DashboardLayout`'s Discover flow), and featured flag.
9. **Verify expiry is actually enforced server-side.** The client `find_quests_nearby` RPC isn't in this repo; confirm the SQL filters out rows past `expires_at` (and respects `starts_at` so a yard sale only appears on its active day). If it doesn't, that filter must be added — otherwise expired yard sales linger on the map.
10. Add an archival/cleanup path for expired yard sales (a scheduled job / Supabase cron that flips expired listings to `archived`, or a `published AND now() BETWEEN starts_at AND expires_at` view). The schema supports it; nothing automates it today.

**User yard-sale route mode (radial menu)**
11. Extend `BottomNav`'s existing 600 ms long-press: instead of immediately dispatching `xnext-live-enter`, open a small **radial/bomb menu** (VHS-Live style) with **Yard Sales** as the default option.
12. On "Yard Sales", dispatch a new `xnext-mode-yardsales` event; in `RadarScreen` set `routeMode='yardsales'`, filter to today's active yard sales, and feed them to `RouteLayer` as optimized `waypoints`.
13. Fit the camera to the whole loop and keep the experience on Home. Only offer the Google Maps multi-stop link as an explicit fallback (Google's `dir/` URL supports waypoints but is the eject path).
14. Add an exit affordance mirroring the current "Exit Live" control.

---

## 6. MVP (before APK) vs. later

**MVP — do before packaging the APK**
- Decide the navigation contract and **enable the Directions/Routes API + billing** (step 1). Even if you ship the deep-link for now, the account work should be done before APK so behavior is consistent in the WebView.
- In-app route line + ETA for the single selected quest (steps 2–6). This is the highest-leverage fix for "one screen" and is small.
- **Admin manual listing create** (steps 7–8) for yard sales, events, businesses — this is net-new capability the product needs, and it reuses existing schema + upload code.
- **Server-side expiry/active-window enforcement** for listings (step 9). This is a correctness/trust issue (stale yard sales) and should not ship to an APK audience unverified.
- **Confirm a native shell strategy and add it** (see APK section) — nothing about APK works without this.

**Later — after APK MVP**
- Yard-sale route mode with the radial menu and optimized multi-stop routing (steps 11–14). Higher effort (UI + waypoint optimization + camera choreography); the single-quest route layer is the prerequisite, so sequence it second.
- Automated archival job for expired listings (step 10) — can start as a manual/admin cleanup, automate later.
- Featured ranking polish, richer route cards (mode toggle walk/drive, alternate routes).
- Full turn-by-turn: keep delegating to Google Maps; only revisit if it becomes a core product pillar.

---

## 7. APK-specific concerns

This is the riskiest area because **the project has no native packaging layer today.** A Vite SPA cannot become an APK without a wrapper. Resolve this first.

**Packaging approach (decide before anything else):**
- **Capacitor (recommended):** wraps the web build in a native Android shell, gives you native geolocation, control over external-link behavior (so a Google Maps link can open a system chooser rather than silently ejecting), push, and a clean path to the Play Store. Best fit for "stay inside XNEXT."
- **TWA / Bubblewrap:** fastest to ship (Chrome-backed), but it *is* a browser tab — less control over intents and native permissions, and it requires Digital Asset Links. Weaker fit for the one-screen goal.
- **PWA only:** no Play Store APK; not what's being asked.

**External intents / the eject problem:** The current `target="_blank"` → `google.com/maps/dir/...` links will, in a WebView/Capacitor app, fire an Android intent that opens the external Google Maps app and leaves XNEXT. Shipping the in-app route layer (Section 4) is what actually keeps users home; the Google link should become an explicit, secondary "open full navigation" action, ideally routed through a controlled intent.

**Location & permissions:** Web geolocation inside an Android WebView needs `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` in the manifest *and* the WebView's `onGeolocationPermissionsShowPrompt` handled — otherwise `useUserLocation` silently fails on device. With Capacitor, prefer the native Geolocation plugin and request runtime permission on a user gesture (the hook already triggers `request()` from gestures, which is the right pattern). Background location is **not** needed for this feature set — avoid requesting it (Play Store review friction).

**API key hardening:** `VITE_GOOGLE_MAPS_API_KEY` ships in the client bundle (normal for Maps JS). It must be locked down: HTTP-referrer restrictions for the web/WebView origin, and the key scoped to only the APIs you use (Maps JS, Places, Directions/Routes, Geocoding). If you ever move to the native Maps SDK you'd need a separate Android-restricted key (SHA-1 + package name). Do this before public APK distribution.

**Billing exposure:** enabling Directions/Routes means per-request cost. Multi-stop yard-sale routing can fan out requests — add basic guardrails (debounce, cap waypoints, cache a computed route) before it's in users' hands.

**Other:** set up Digital Asset Links if you go TWA; verify deep-link handling for Stripe checkout returns (the paid-listing flow redirects to a Stripe-hosted URL and back); and confirm `env(safe-area-inset-*)` usage (already present in the bottom nav) renders correctly under the Android system bars.

---

## Summary

XNEXT already keeps the *map* on one screen — Home literally renders `MapScreen`. What ejects the user is **directions**: in-app route rendering was deliberately removed after the Directions API returned `REQUEST_DENIED`, and replaced with an external Google Maps deep link in `DirectionsLayer.tsx` (used by `QuestPreviewCard` and `GooglePoiSheet`). In-app routing is fully achievable with the already-installed `@vis.gl/react-google-maps` once the Directions/Routes API is enabled+billed and `'routes'` is added to the loaded libraries. Admin manual listings need a new admin create form + service method (the schema already supports listing fields) plus verified server-side expiry. The yard-sale radial route mode builds naturally on the existing NEXT long-press and the same route layer. The biggest pre-APK gap is that **no native shell exists yet** — that, plus API enablement and the in-app route line, are the true MVP before packaging.
