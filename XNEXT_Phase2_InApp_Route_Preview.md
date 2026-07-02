# XNEXT — Phase 2: In-App Route Preview (single destination)

Tapping **LET'S GO** now keeps the user on the Home map and draws the route line from their location to the selected quest (or its parking coordinate), with distance + driving ETA on the card. Google Maps is demoted to a small secondary "Open full navigation in Google Maps" link. The same pattern applies to tapped Google POIs. No multi-stop, no radial menu, no turn-by-turn — preview only, exactly as scoped.

`tsc -b` and `vite build` both pass clean.

---

## Files changed

| File | Change |
|---|---|
| `src/components/map/DirectionsLayer.tsx` | Added `RouteLayer` (renders the in-app polyline + reports distance/ETA/status via `useMap` + `useMapsLibrary('routes')` + `DirectionsService`/`DirectionsRenderer`). Kept `googleMapsDirectionsUrl` as the secondary fallback. Exposes `RouteStatus` + `RouteResult` types. |
| `src/components/map/MapScreen.tsx` | Added `'routes'` to `APIProvider` libraries; added route state (`routeDest` / `routeStatus` / `routeResult`); `handleRequestRoute` + `clearRoute`; mounts `RouteLayer` only when a preview is active and a GPS fix exists; clears the route on close, NEXT, quest change, and POI-sheet close; passes route props to the card + POI sheet. |
| `src/components/map/QuestPreviewCard.tsx` | LET'S GO now triggers the in-app preview (primary) instead of opening Google Maps. The route tier shows distance + ETA with loading / denied / error / no-location states. Google Maps is a small secondary link. |
| `src/components/map/GooglePoiSheet.tsx` | "Directions" (external, primary) replaced with **Preview route** (in-app, primary) + a secondary Google Maps link, matching the card. |

No changes to admin listings, services, database, or env files.

---

## Does the Directions API need to be enabled in Google Cloud?

**Yes.** In-app route rendering calls Google's **Directions API**, which must be **enabled and billed** on the project tied to `VITE_GOOGLE_MAPS_API_KEY`. This is the API that previously returned `DIRECTIONS_ROUTE: REQUEST_DENIED`, which is why in-app directions had been removed.

The app handles the not-enabled case gracefully: if the service returns `REQUEST_DENIED`, the card shows **"Route preview needs Google Directions enabled."** plus the straight-line distance, and the Google Maps fallback link still works. Nothing crashes. So you can ship this before enabling the API — the preview simply won't draw until the API is on.

When you enable it, also confirm the API key's restrictions allow Directions (and keep referrer restrictions for web/WebView).

---

## Environment / config changes

- **Code:** `'routes'` added to the `APIProvider` `libraries` array in `MapScreen.tsx`. (The location-picker map has its own provider and doesn't need it.)
- **Env vars:** none added. Same `VITE_GOOGLE_MAPS_API_KEY`.
- **Google Cloud:** enable + bill the **Directions API** on that key's project (the only external prerequisite).

---

## How the route preview works

1. User taps **LET'S GO** on a quest's card. The card calls `onRequestRoute(navTarget)` and switches to its route tier.
2. `navTarget` is the **parking coordinate when one exists**, otherwise the quest's own point.
3. MapScreen sets `routeDest`, turns off camera-follow, and mounts `RouteLayer` inside the existing `<Map>` (only if there's a GPS fix).
4. `RouteLayer` calls `DirectionsService.route({ origin: userLocation, destination, travelMode: DRIVING })`, renders the result as an orange polyline via `DirectionsRenderer`, and fits the map to the route.
5. The leg's distance + duration flow back up (`routeStatus='ok'`, `routeResult`), and the card shows **"🚗 12 min · 5.4 km."**
6. Closing the route (the X or "Not Today"), advancing with **NEXT**, selecting a different experience, or closing the POI sheet all call `clearRoute()` → `RouteLayer` unmounts → the line is removed and the map returns to normal discovery.

The route line is drawn on the **same Home map** — the user never leaves XNEXT.

## How the fallback works

- **Secondary, always available:** a small "Open full navigation in Google Maps ↗" link (the old deep link) for users who want real turn-by-turn. It's visually de-emphasized, never the primary action.
- **No GPS fix:** the card shows "📍 Enable location to preview your route" with an **Enable location** button (calls the existing `requestLocation`); the Google Maps link still works; no crash.
- **Directions API denied/unavailable:** clear message + straight-line distance (when a fix exists) + the Google fallback. No crash.
- **POI sheet:** same — **Preview route** (or **Enable location**) is primary; Google Maps is the secondary link.

---

## Testing (against the requirement list)

Build verified: `tsc -b` → exit 0; `vite build` → exit 0. Behavior to confirm in-app once the Directions API is enabled:

- LET'S GO keeps the user in XNEXT (no navigation away) — ✅ by design (primary action is in-app).
- Route line renders from user → destination — ✅ via `RouteLayer`.
- ETA + distance appear on the card — ✅ from the route leg.
- Route clears on close — ✅ (`clearRoute` on X / "Not Today").
- Route clears on NEXT — ✅ (NEXT → `handleSelectQuest` → `clearRoute`).
- Google Maps opens only when explicitly tapped — ✅ (secondary link only).
- No regressions to admin listings — ✅ (no listing/service/DB files touched; build clean).
- `tsc -b` passes — ✅. `vite build` passes — ✅.

Manual matrix worth running on device: (a) quest with parking coordinate routes to parking; (b) denied-API message shows if Directions isn't enabled; (c) no-GPS prompt + enable flow; (d) POI preview; (e) selecting a new pin clears the prior route.

---

## Known limitations

- **Directions API must be enabled/billed** or the preview shows the "needs Google Directions" message (by design).
- **Camera fit is best-effort.** The Home `<Map>` keeps a fixed `zoom={14}`; the route centers and renders fully, but very long routes may not zoom out to show both endpoints until the user pinch-zooms. Can be improved later by making zoom state-driven.
- **Driving mode only.** No walking/transit toggle yet (parking → experience "walk leg" is future work).
- **One request per destination** (snapshot); the route doesn't live-update as the user moves. Correct for a preview and keeps Directions billing low.
- **Preview only** — no turn-by-turn, no alternate routes (intentional; full nav stays in Google Maps).

---

## What should come next for Yard Sale Adventure mode

The foundation is now in place; Yard Sale Adventure is the multi-stop extension of exactly this layer:

1. **Generalize `RouteLayer` to accept `waypoints[]`** and pass `optimizeWaypoints: true` to `DirectionsService` — it already renders a multi-leg result without changes to the renderer.
2. **Add a `routeMode` to MapScreen** (`'single' | 'yardsales'`). In yard-sale mode, filter `rankedQuests` to today's active yard sales (the Phase-1 listings, already time-windowed by the RPC) and feed them as waypoints.
3. **Sum the legs** for total distance/ETA + stop count on the card; fit bounds to the whole loop.
4. **Trigger** it from the press-and-hold NEXT radial menu (separate Phase-2 task) with "Yard Sales" as the default option.
5. **Guardrails** before it ships to users: cap the number of stops, debounce, and cache the computed route (multi-stop Directions requests are billable and fan out).

None of that requires data-model work — yard-sale listings are already normal, time-filtered rows with coordinates. Recommended order: enable the Directions API and validate this single-destination preview first, then build the radial menu, then multi-stop on top of the generalized `RouteLayer`.
