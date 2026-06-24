# XNEXT — Polish Pass (stability + first impression)

**Date:** 2026-06-22 · **Scope:** polish & stability only — no reverts, no rearchitecture, no routing/auth/payment/map-provider changes.
**Build:** `tsc -b` ✅ zero type errors · `vite build` ✅ 141 modules, clean bundle.

The app was already in good shape (safe-area insets, 44px touch targets, iOS zoom-guard on inputs, real empty/location states). These changes are surgical refinements, not a redesign.

---

## 1. Audit findings

**A. Mobile experience**
- Root shell used `h-screen` (`100vh`). On iOS Safari `100vh` ignores the dynamic URL bar, so the fixed bottom nav and last rows can sit under the toolbar / get clipped — the exact "bottom nav overlaps content" symptom.
- No `prefers-reduced-motion` handling despite several always-on animations (glow-breathe, pulse-wave, radar sweep, ping rings).
- No global guard against horizontal overflow from a long unbroken title.

**B. Location confidence**
- "Locating" and "Approximate" states existed, but there was **no explicit "Location found"** confirmation — success was implied only by the quest count.
- The "Using approximate location" badge could flash during the active GPS handshake (shown whenever `!isLive`, including while locating).

**C. Quest card polish**
- Compact card hierarchy was slightly flat: 14px title, low-contrast (0.55) meta, no accent on the experience-class label.

**D. Empty states** — already solid (clear copy + "Widen radius" / "Add a discovery" CTAs). Left as-is.

**E. Performance** — main win available via reduced-motion (cuts constant compositing/battery use). No layout-shift sources found in the polished areas.

**F. Trust**
- **Broken contact links:** placeholder `@xnext.example` addresses (the `.example` TLD is reserved and undeliverable) in the footer + 4 legal/trust pages.
- On the **map Home** (the first screen most users see) Privacy/Terms were **not reachable** — footer is hidden there and the sidebar had no trust link.
- Missing `theme-color` / description / Apple web-app meta tags.

---

## 2. Recommended & implemented changes

| Area | Change | File(s) |
|---|---|---|
| A | `h-screen` → `h-dvh` (dynamic viewport — fixes iOS bottom-nav overlap) | `DashboardLayout.tsx` |
| A/E | `@media (prefers-reduced-motion: reduce)` disables ambient animation loops | `index.css` |
| A | `overflow-x: hidden` guard + `overflow-wrap: anywhere` on sheet titles | `index.css`, `maps.css` |
| B | Explicit **"✓ Location found"** vs **"Approximate · ±Xm"** confidence line (driven by GPS accuracy) | `AdventureRadarCapsule.tsx`, `MapScreen.tsx` |
| B | "Approximate" badge no longer flashes while actively locating | `MapScreen.tsx` |
| C | Stronger compact-card hierarchy: 15px tighter title, higher-contrast meta, amber class accent (mirrored in list rows) | `maps.css` |
| F | Fixed all broken `@xnext.example` → `@xnext.app` contact links | `DashboardLayout.tsx`, `TrustPrivacyPage.tsx`, `PrivacyPolicyPage.tsx`, `TermsOfServicePage.tsx`, `DataRequestsPage.tsx` |
| F | Added reachable **Trust & Privacy** item to the sidebar nav | `DashboardLayout.tsx` |
| F | Added `theme-color`, description, and Apple web-app meta tags | `index.html` |

10 files changed, ~83 insertions. No routes, schema, auth, payment, or map-provider code touched.

---

## 3. Before / after (the visible changes)

- **Bottom nav (mobile):** previously could hide under Safari's toolbar at certain scroll positions → now anchored to the dynamic viewport, always clear of content.
- **Location HUD:** `Finding your location…` → on success now reads **"✓ Location found"** (green), or **"Approximate location · ±850m"** (amber) when the fix is coarse — three unambiguous states.
- **Quest card:** title now larger/tighter with an amber experience-class accent and higher-contrast distance — stronger glance hierarchy over the map.
- **Trust:** "Contact Support" and legal-page emails now resolve to a real domain; Privacy/Terms reachable from the main screen via the sidebar.

> Note: live pixel screenshots require the Google Maps + Supabase keys and a rendered browser session, which aren't available in this environment. To capture real before/after: `npm run dev`, open in mobile Safari (or DevTools device mode), and screenshot the Home map, the locating→found transition, and the quest card.

---

## 4. Build verification

```
npx tsc -b           → OK (no type errors)
npx vite build       → ✓ built, 141 modules, index ~333 kB (98.6 kB gzip)
```

---

## 5. Follow-up (your call — not changed)

- Confirm the real support/privacy mailbox. I standardized to `@xnext.app`; ensure those inboxes exist (or tell me the correct address and I'll update).
- Optional: surface a compact Privacy/Terms link on the map Home itself (kept out for now to avoid clutter near the bottom nav).
