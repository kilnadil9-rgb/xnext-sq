# XNEXT — Phase 1 Admin Listings: Final Report

Phase 1 is complete. Admins can create, see, edit, feature, archive, and delete Yard Sale / Local Event / Business listings entirely inside XNEXT. Listings publish immediately, appear on the Home map only while active, and disappear automatically when they expire — verified by a simulation of the exact map query against the five sample listings (5/5 correct). Listing images now flow through to the map preview and detail cards. `tsc -b` and `vite build` both pass clean.

One action is required on your side before images and admin-delete work in the live app: apply migration `020` to the database (`supabase db push`). Everything else works against the already-deployed schema (018 + 019).

---

## What was completed against your 7 tasks

1. **Admin UI — done.** `/dashboard/admin/listings` exposes Listing Type, Title (Business name for businesses), Description, Address/Location Name, Latitude, Longitude (map pin or manual entry, kept in sync), Start, End, Featured, and optional Image. Mobile-friendly, reuses existing form styling.
2. **Map visibility — verified, no SQL change needed for the window logic.** The deployed RPC (migration 019) already enforces `published AND starts_at<=now() AND expires_at>now() AND (is_paid_listing=false OR payment_status='paid')`. Simulation confirms active→shows, future→hidden, expired→gone (see Testing).
3. **Discovery — verified.** Listings return from the same `find_quests_nearby` RPC as normal `NearbyQuest` rows, are ranked by the same `rankQuests`, and render through the same `QuestList` / `QuestPreviewCard`. No admin-only branching exists post-publish; the only listing-specific UI is a friendly badge (`listingBadge`) that gates nothing.
4. **Images — implemented.** This did **not** work before (the RPC didn't return `media_urls` and the cards never rendered an image). Migration 020 surfaces `media_urls`; the compact/map card now shows a thumbnail and the detail sheet a hero image. The admin review queue and the new manager also show thumbnails.
5. **Admin editing — implemented (not deferred).** A "Manage listings" panel under the form lists every listing with inline edit of Title, Description, Start/End, Featured, Status (publish/archive), Image replace, and Delete.
6. **Testing — done** via a non-destructive simulation of the five sample listings (no project is linked to this tool session, so I could not write to your DB; the simulation uses the real predicate). Manual checklist below.
7. **Final report — this document.**

Not touched, as instructed: in-app routing, Garage Sale Adventure, NEXT radial menu.

---

## Files changed

**New**
- `src/pages/dashboard/AdminListingsPage.tsx` — admin create form + "Manage listings" panel (edit/feature/archive/delete/replace-image).
- `supabase/migrations/020_listing_images_and_admin_delete.sql` — RPC returns `media_urls`; admin DELETE policy on `quests`.
- `XNEXT_Phase1_Admin_Listings_FINAL.md` — this report.

**Modified**
- `src/services/listingService.ts` — shared `buildListingInsert` core; `ADMIN_LISTING_TYPES`; `adminCreateListing`; `uploadListingImage`; `listAllListings` / `updateListing` / `deleteListing`; `AdminCreateListingInput` / `UpdateListingInput`. (Paid `createListing` payload unchanged.)
- `src/lib/supabase/types.ts` — added `media_urls` to `NearbyQuest`.
- `src/components/map/QuestPreviewCard.tsx` — thumbnail on compact card, hero image on detail sheet (optional; falls back to the class icon).
- `src/App.tsx` — lazy route `/dashboard/admin/listings`.
- `src/components/layouts/DashboardLayout.tsx` — `is_admin`-gated Admin nav (Create Listing, Review Queue).

(From the prior step, already in place: the shared service refactor and the create form.)

---

## Database migrations

| Migration | Status | Why |
|---|---|---|
| 018 paid listings, 019 seasonal/parking | **Assumed already applied** | Define listing columns + the window-aware RPC the feature depends on. |
| **020 listing images + admin delete** | **NEW — must apply** (`supabase db push`) | Adds `media_urls` to the `find_quests_nearby` return (so images render) and an admin DELETE RLS policy (so admins can remove any listing). Pure additive function replace + one policy; safe to re-run. |

No new columns were added — `media_urls` already exists on `quests`; 020 only surfaces it through the RPC. The window/expiry logic needed no change (it shipped in 019).

The UI degrades gracefully if 020 isn't applied yet: `media_urls` is optional on `NearbyQuest`, so cards simply show the class icon until the migration lands. Admin delete of **other** admins' listings needs 020; deleting your **own** listings already works under the 001 owner policy.

---

## How it works (for the record)

- **Active window enforcement** is entirely server-side in `find_quests_nearby`; the client never time-filters, so every surface is consistent and can't be bypassed.
- **Expiry** is computed at creation by `resolveAdminWindow`: yard sale/event → explicit end, else end of the start day; business → explicit end, else ~30 days from now. After `expires_at`, the RPC stops returning the row.
- **One listing system:** admin and paid listings share `buildListingInsert`; only status/payment/source differ. The future paid form drops onto the same path + Stripe.

---

## Testing checklist

**Automated (already run): visibility contract.** Simulated the RPC predicate + admin expiry rules against the five samples at a fixed clock — 5/5 matched:

| Sample | Type | Window | Result |
|---|---|---|---|
| Friday Yard Sale | yard sale, started 1h ago, no end | → end of day | **Visible** |
| Weekend Community Market | event, starts in 2 days | future | **Hidden** (until start) |
| Coffee Shop Promotion | business, no expiry | → +30 days | **Visible** |
| Live Music Event | event, ended 2 days ago | past | **Hidden** (expired) |
| Restaurant Grand Opening | business, 7-day expiry | active | **Visible** |

**Manual (run in-app after applying migration 020):**

1. Sign in as a non-admin → `/dashboard/admin/listings` redirects to Home; Admin nav hidden. Sign in as `is_admin` → page + nav visible.
2. Create "Friday Yard Sale" (start a few minutes ago, no end) → open Home → it appears on the map + nearby list with a "Yard Sale · Today" badge.
3. Create one with a **future** start → confirm it does **not** appear yet; reload after the start passes → it appears.
4. Create one with an end a couple minutes out → confirm it drops off the map after expiry.
5. Create a **business** with no expiration → confirm it's live and `expires_at ≈ now + 30 days`.
6. Attach an image (≤5 MB JPG/PNG/WebP) → confirm it shows on the map preview card and the detail sheet; invalid/oversized file → inline error.
7. Enter manual lat/lng instead of dropping a pin → confirm the pin moves and the listing lands there.
8. In "Manage listings": Edit title/dates → Save → confirm the map updates; toggle Feature; Archive → confirm it leaves the map; Publish → returns; Replace image → new image shows; Delete → row removed.
9. Regression: `/dashboard/post-event` still creates a `pending_review` paid listing → Stripe; Review Queue still approves/rejects.

---

## Known limitations

- **Migration 020 must be applied** for images and cross-admin delete. Until then, images fall back to the class icon (no errors).
- **No geocoding.** Address is free text; location is set by map pin or manual lat/lng (acceptable for Phase 1, by your spec). Wiring the already-loaded Places library to auto-pin from an address is a clean later add.
- **Manager lists by recency, no pagination/search** (capped at 200). Fine for seeding; add filters if the catalog grows large.
- **No automatic archival of long-expired rows.** Not needed for correctness (they already stop showing); a scheduled `status='archived'` sweep is optional housekeeping.
- **"Manage listings" shows all listing rows,** including any user-submitted paid listings — admins can edit those too (intended for moderation). It is not limited to admin-created rows.
- **Image is single, replace-only** in edit (no multi-image gallery management UI) — the data model supports an array; the UI manages the first image.

---

## APK readiness assessment

**Green for the listings feature itself.** The admin workflow is complete, type-checks, builds, and the visibility/expiry contract is proven. As a content-seeding tool for beta, it's ready once migration 020 is applied and you've created a few real listings.

**Still blocking a real APK (carryover from the routing audit, unchanged by this work):**

- **No native shell exists.** XNEXT is still a Vite SPA — there is no Capacitor/TWA wrapper, so there is nothing to package into an APK yet. This is the single largest gap.
- **External Maps hand-off** on "LET'S GO" still ejects users (Phase 2 routing).
- **Google Maps API key hardening** (referrer restrictions, scoped APIs) before public distribution.
- **In-WebView geolocation permission** wiring once a shell exists.

So: listings are APK-beta-ready; the **app** is not yet packageable until a native shell is added.

---

## What to implement next, before APK (recommended order)

1. **Apply migration 020** and create the real seed listings — confirm the manual checklist on a device/browser.
2. **Add the native shell (Capacitor recommended).** Nothing ships as an APK without it; do this before further feature work so everything is tested in the real container.
3. **Verify production DB is migrated through 020** (the app's rollout-safety only covers seasonal *insert* columns, not the RPC return shape images depend on).
4. **Google Maps key restrictions + geolocation-in-WebView** once the shell is in.
5. Only then start Phase 2 (in-app routing → radial menu → Garage Sale Adventure → multi-stop). They all read the same listing rows and need no further data-model work to begin.
