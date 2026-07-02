# XNEXT — Pre-APK Polish & Beta-Readiness Audit

**Date:** 2026-06-27
**Scope:** Beta-readiness punch list before packaging the React/Vite app as a Capacitor Android APK. Findings are grounded in the current codebase; no code was changed for this audit.
**Chosen APK model:** React (Vite) → Capacitor → Android, with web assets **bundled** in the APK plus an **OTA live-update layer** so most frontend releases ship without a Play rebuild.
**Build status at audit time:** `tsc -b` ✅ 0 errors · `vite build` ✅ clean.

Priorities map to the stated goals: finish Stripe, complete paid listings, polish UX/UI, prepare for first beta testers.

---

## P0 — Must fix before beta / packaging

1. **Stripe price IDs are placeholders for 4 of 5 listing tiers.**
   `src/services/listingService.ts` — only `yard_sale` has a real price (`price_1TkEsRLmIJ4bGVIs2MLjvCwD`). The other four are stubs (`price_xnext_localevent_499`, `price_xnext_spotlight_999`, `price_xnext_featured_1999`, `price_xnext_partner_mo_4999`). These flow straight into `createCheckoutSession` (`PostListingPage.tsx:76`), so checkout for Local Event, Business Spotlight, Featured Business, and Monthly Partner will fail at Stripe. Create the real Products/Prices in the live Stripe account and replace all four. This directly blocks "complete paid listings."

2. **No app-level error boundary — a render error anywhere white-screens the whole app.**
   `src/main.tsx` / `src/App.tsx` wrap nothing; only `MapErrorBoundary` exists (map only). On a beta device a single unhandled render error = blank screen with no recovery. Add a top-level `ErrorBoundary` around `<App/>` (or the router) with a friendly "something went wrong / reload" fallback. Cheap, high-impact safety net before real users.

3. **Migration discipline — frontend keeps shipping ahead of the database.**
   Documented twice already (`xnext-paid-listings-schema-audit.md`: 018 missing in prod; and this week's 019 `geography` + `active_months` schema-cache failures). For a bundled+OTA APK this gets *worse*: an OTA JS push can hit users instantly while the DB migration lags, breaking writes in the field. Establish a rule: **apply + verify the migration (and `NOTIFY pgrst, 'reload schema';`) before pushing the matching frontend.** Consider a tiny startup capability check (or keep using the graceful column-fallback pattern already added to `questService`).

---

## P1 — Should fix before / during early beta

4. **Capacitor Android back-button & app-lifecycle handling.**
   With `BrowserRouter` and no `@capacitor/app` listener, the hardware Back button will exit the app instead of navigating. Add `@capacitor/app` `backButton` handling (router back, exit only at root) and handle `appStateChange`/resume (e.g. re-request location, refresh radar).

5. **Status bar & safe-area on Android.**
   Safe-area insets are already used in 3 places (`maps.css`, `DashboardLayout`, `BottomNav`) — good. For the native shell, add `@capacitor/status-bar` to set style/overlay so content doesn't clash with the Android status bar, and verify the bottom nav clears the gesture nav bar on a real device.

6. **Geolocation permission in the native shell.**
   The app relies on `navigator.geolocation` (`useUserLocation.ts`). In the Android WebView this needs the runtime permission + `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` in the manifest (and an in-WebView permission grant). Decide: keep the web API (simplest) vs. adopt `@capacitor/geolocation` for reliable prompts. Either way, test the denied/blocked path on-device — the existing `denied`/`unavailable` UI states are a good base.

7. **App icon & splash screen.**
   `public/` only has `favicon.svg` + `icons.svg`; there's no native icon/splash source. Generate them with `@capacitor/assets` from a high-res master before the first build (this is one of the few things that *requires* an APK rebuild, so get it right early).

8. **OTA update guardrails.**
   For the bundled+OTA model, pick the mechanism (e.g. Capacitor live-updates / Capgo) and define: version/channel strategy, rollback, and a **minimum-native-version gate** so an OTA bundle that needs a newer plugin doesn't load on an old shell. Also keep `vercel.json`'s SPA rewrite logic in mind — Capacitor serves `index.html` locally, so deep links/routing should be re-tested in the shell.

---

## P2 — Polish / can follow after first APK

9. **Verify `clickableIcons` POI behavior on touch (Phase 1.8 Part 3).**
   The new Google POI bottom sheet relies on tap-to-open POIs and Places fetch. Confirm on a real device that POI taps don't conflict with map pan/quest-marker taps, and that the Places-API-disabled fallback reads acceptably.

10. **Seasonal empty-state copy.**
    With seasonal ranking live, off-season experiences sink to the bottom rather than hiding. Confirm the radar empty/low-results copy still makes sense in a season with little active content (e.g. "Nothing in season nearby — here's what's around").

11. **Console noise is clean.** ✅ All 11 `console.*` calls are `import.meta.env.DEV`-guarded — nothing leaks to production. No action; noted for completeness.

12. **Accessibility spot-checks.** ✅ Images checked carry `alt`; `prefers-reduced-motion` is handled in `index.css`; 44px touch targets and iOS zoom-guard were done in the prior polish pass. Re-run a quick contrast/labels pass on the new Phase 1.8 controls (season chips, POI sheet buttons) before beta.

---

## Suggested sequence

1. Real Stripe prices (#1) + app-level error boundary (#2) + migration rule (#3).
2. Capacitor scaffold with back-button, status bar, geolocation, icon/splash, OTA layer (#4–#8).
3. On-device test pass of Phase 1.8 interactions + seasonal copy (#9–#10), then ship to first testers.

**Note on tooling:** I can't apply Stripe or DB changes from here — the connected Supabase MCP is on a different account and has no access to project `genidibsxbowwirucefw`, and there's no Stripe connector attached. These need to be done from your own Stripe dashboard / Supabase project.
