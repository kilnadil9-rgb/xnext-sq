# XNEXT — Phase 1 Admin Listings: Implementation Summary

Admins can now manually create Yard Sale, Local Event, and Business listings directly inside XNEXT. They publish immediately (no Stripe, no checkout, no moderation) and appear on the Home map the moment their active window opens, disappearing automatically when they expire. The implementation is built as the shared foundation for the future public paid flow — admin and paid listings are now one system that differ only in publication mode.

`tsc -b` and `vite build` both complete cleanly (verified). No existing flow was changed in behavior: quest discovery, admin review, the paid listing workflow, and the map all still compile and run as before.

---

## 1. Summary of changes

- Refactored `listingService` so every listing — admin-seeded or user-paid — is created through **one shared insert builder** (`buildListingInsert`). The paid `createListing` now routes through it with a byte-identical payload; the new admin path reuses the same core.
- Added an **admin listing catalog** (`ADMIN_LISTING_TYPES`) describing the three Phase-1 categories and their expiry behavior — the single source of truth the future user form will also read.
- Added `listingService.adminCreateListing()` — free, immediately-published listings with per-type active windows.
- Added `listingService.uploadListingImage()` — optional image upload reusing the existing public photo bucket.
- Built `AdminListingsPage` — a mobile-friendly, admin-gated form for the three categories (map pin + manual lat/lng, dates, featured, image).
- Wired the route (`/dashboard/admin/listings`) and an `is_admin`-gated sidebar link (plus a shortcut to the existing Review Queue).
- **No database migration was required** (explained in §4–§5).

---

## 2. Files modified

| File | Change |
|---|---|
| `src/services/listingService.ts` | Added shared `buildListingInsert` core, `ADMIN_LISTING_TYPES` catalog + `adminListingConfig()`, active-window resolver (`resolveAdminWindow`), `adminCreateListing()`, `uploadListingImage()`, and `AdminCreateListingInput`. Refactored paid `createListing` to use the shared builder (payload unchanged). `createCheckoutSession` untouched. |
| `src/App.tsx` | Lazy-imported `AdminListingsPage`; added protected route `/dashboard/admin/listings`. |
| `src/components/layouts/DashboardLayout.tsx` | Added an `is_admin`-gated Admin nav group with "Create Listing" and "Review Queue". |

## 3. New files created

| File | Purpose |
|---|---|
| `src/pages/dashboard/AdminListingsPage.tsx` | The admin listing-creation form (gated on `profiles.is_admin`). |

## 4. Database migrations added

**None.** The schema and SQL already support everything Phase 1 needs:

- The `quests` table already carries every column used (`listing_type`, `tier`, `is_featured`, `starts_at`, `expires_at`, `is_paid_listing`, `payment_status`, `media_urls`, `location_name`, `location_point`, `published_at`) — added by migrations 018 and 019.
- The map RPC `find_quests_nearby` (latest definition in **migration 019**) already enforces the exact active-window + free/paid logic this feature relies on.
- Row-level security already permits admin inserts (see §5).
- Image upload reuses the existing `quest-photos` bucket and its permitted `discoveries/{uid}/` path (migration 017), so no storage policy change was needed.

Per the brief ("Only add database columns if absolutely necessary" / "If this logic is missing… create a migration"), nothing was missing, so nothing was added.

## 5. SQL explanation — why no migration is needed

The live `find_quests_nearby` function (migration 019) filters with:

```sql
WHERE q.status = 'published'
  AND q.location_point IS NOT NULL
  AND (q.starts_at  IS NULL OR q.starts_at  <= now())   -- future listings hidden
  AND (q.expires_at IS NULL OR q.expires_at >  now())   -- expired listings auto-disappear
  AND (q.is_paid_listing = false OR q.payment_status = 'paid')  -- paid gate
  AND ST_DWithin(...)
```

An admin listing is inserted with `status='published'`, `is_paid_listing=false`, and concrete `starts_at`/`expires_at`. Because `is_paid_listing=false`, it passes the paid gate immediately; because `starts_at`/`expires_at` are set, it appears only inside its window and vanishes after. This is exactly the behavior the task specified — already implemented in SQL.

**RLS:** `quests` has `CREATE POLICY "Users can manage their own quests" … FOR ALL USING (created_by = auth.uid())` (migration 001). For an INSERT with no separate `WITH CHECK`, Postgres applies the `USING` expression as the check, so an admin inserting a row with `created_by = auth.uid()` is allowed. No admin-specific INSERT policy is required. (Migrations 018 already added the admin SELECT/UPDATE policies used by the Review Queue.)

## 6. How active windows are enforced

Server-side, in the `find_quests_nearby` RPC (shown above). The client never filters by time — it just renders whatever the RPC returns. This means the window is enforced consistently for every caller (map, radar, future surfaces) and can't be bypassed from the client. The Home map already refetches via the `xnext-quest-created` event the form dispatches on success, so a new listing pops in as soon as it's live.

## 7. How expiration works

`expires_at` is computed at creation time by `resolveAdminWindow()` from the form values:

- **Yard Sale** — explicit end if given; otherwise **end of the start day** (23:59:59 local).
- **Local Event** — explicit end if given; otherwise end of the start day.
- **Business** — explicit expiration if given; otherwise **≈30 days** from now (businesses start immediately, so `starts_at = now()`).

After `expires_at`, the RPC's `expires_at > now()` clause stops returning the row, so it disappears from the map automatically — no cron job needed for visibility. (An optional housekeeping job to flip long-expired rows to `archived` is noted as a Phase-2 nicety in §10; it is not required for correct behavior.)

## 8. How administrators create each type

Open the sidebar → **Admin › Create Listing** (`/dashboard/admin/listings`; visible only to `is_admin` users). Pick the type at the top; the form adapts:

- **Yard Sale** — Title, Description, Address, Location (map pin or lat/lng), **Start (required)**, End (optional → end of day), Featured, optional Image → Publish. Live during its window, gone after.
- **Local Event** — same fields as Yard Sale (classified as a "connection" experience for ranking). Start required, End optional.
- **Business** — **Business name** (used as the title), Description, Address, Location, **Expiration (optional → ~30 days)**, Featured, optional Image → Publish. Goes live now.

On submit the listing publishes and the Home map is told to refetch immediately.

## 9. Testing instructions

1. **Build:** `npm run build` → `tsc -b` and `vite build` both succeed. (If the local `dist/` was created on macOS and the sandbox can't delete it, build to a temp dir: `npx vite build --outDir /tmp/check --emptyOutDir`.)
2. **Access control:** sign in as a non-admin → `/dashboard/admin/listings` redirects to `/dashboard`, and the Admin nav group is hidden. Sign in as `is_admin` → the group and page are visible.
3. **Yard sale, active now:** create one with Start = a few minutes ago, no End. Open Home → it appears on the map and in the nearby list with the "Yard Sale · Today" badge.
4. **Expiry:** create a yard sale with End a couple minutes out (or Start yesterday). Confirm it is absent from the map (the RPC filters it). Re-check after expiry to confirm it drops off.
5. **Future start:** create one with Start in the future → confirm it does **not** appear yet, then appears once the start passes (reload/refetch).
6. **Business default window:** create a business with no expiration → confirm it's live and that `expires_at ≈ now + 30 days` in the row.
7. **Featured:** toggle Featured → confirm it ranks higher (the RPC pulls featured rows ~500 m closer in ordering) and shows the "Featured Nearby" badge.
8. **Image:** attach a ≤5 MB JPG/PNG/WebP → confirm it uploads and shows on the card; attach an oversized/invalid file → confirm the inline error.
9. **Manual coordinates:** type lat/lng instead of dropping a pin → confirm the pin moves and the listing lands at those coordinates.
10. **Regression:** confirm the paid flow (`/dashboard/post-event`) still creates a `pending_review` listing and redirects to Stripe, and the Review Queue still approves/rejects.

## 10. Recommendations before Phase 2

- **Confirm the live DB is migrated through 019.** Everything here assumes migrations 018 + 019 are applied in production (they define the listing columns and the window-aware RPC). `questService` already has rollout-safety fallbacks for the 019 seasonal columns, but admin listings depend on the 019 RPC for window filtering — verify `find_quests_nearby` in prod matches migration 019.
- **Optional archival job (housekeeping, not correctness).** Expired listings already stop showing. If you want them out of the table/analytics, add a scheduled Supabase function to set `status='archived'` where `expires_at < now()`. Defer until needed.
- **Geocoding (deferred intentionally).** Address is free-text today and location is set by pin/coords. When convenient, wire the already-loaded Places/Geocoding library to turn the address into a pin automatically — the form is structured to drop this in without changes elsewhere.
- **Future paid form reuses this core.** The public user form should call the same `buildListingInsert` path with `status='pending_review'`, `is_paid_listing=true`, then Stripe — i.e. exactly what `createListing` already does. Keep new fields flowing through `ListingInsertCore` so the two paths never diverge.
- **A dedicated `listings/` storage prefix** would be tidier than reusing `discoveries/`; it needs a one-line storage-policy migration. Cosmetic — fine to leave for Phase 2.
- **Phase 2 hooks are in place:** listings are normal `quests` rows with real `location_point`, `starts_at`, and `expires_at`, so the upcoming in-app routing, the press-and-hold radial menu defaulting to Yard Sales, and multi-stop "Garage Sale Adventure" routing can query the same RPC and build routes directly — no data-model work required to start them.
