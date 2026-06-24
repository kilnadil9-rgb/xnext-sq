# XNEXT — Paid-Listings Schema Audit (findings only)

**Date:** 2026-06-22
**Production error:** `column quests.listing_type does not exist` (Discovery Review / Admin Review page)
**Verdict:** ✅ Confirmed — **production is missing migration `018_paid_listings.sql`. The frontend was deployed ahead of the database.** No code or DB changes made.

---

## 0. Verification limitation (read first)

I could **not** directly query the live production schema: the Supabase MCP connection reports **no linked project** (`list_projects` → empty), and `VITE_SUPABASE_URL` / keys are empty on disk (injected by Vercel at deploy time). So the live-schema comparison below is inferred from two authoritative sources rather than a direct `information_schema` dump:

1. **Postgres itself** — the production error `column quests.listing_type does not exist` is the database stating that `quests.listing_type` is absent.
2. **The repo** — migration `018` defines that column (and all the others) and is the only migration that does so.

§5 includes verification SQL to confirm the exact partial/none state once someone runs it in the Supabase SQL editor (or links the MCP project).

---

## 1. Every code reference to the paid-listing fields

**Frontend (deployed to production):**
- `src/pages/dashboard/AdminReviewPage.tsx` — **the failing query.** Line 71 selects: `listing_type, is_paid_listing, payment_status, price_paid, tier, is_featured, business_name, starts_at, expires_at`. Also reads `is_paid_listing`, `payment_status`, `is_featured` in the render and updates `is_featured`.
- `src/services/listingService.ts` — `createListing()` inserts `listing_type, is_paid_listing, tier, price_paid, payment_status, is_featured`; `listingBadge()` reads `listing_type` / `is_featured`.
- `src/pages/dashboard/PostListingPage.tsx` — submits `listing_type`, kicks off Stripe (`payment_status` starts `pending`).
- `src/lib/supabase/types.ts` — TS types for `listing_type`, `is_paid_listing`, `payment_status`, `is_featured`, `tier`.

**Backend / Edge Functions (Supabase):**
- `supabase/functions/stripe-webhook/index.ts` — sets `payment_status='paid'`, filters `is_paid_listing=true`.
- `supabase/functions/create-checkout-session/index.ts` — selects `is_paid_listing, payment_status`; uses `listing_type`.

**Migration that defines them:**
- `supabase/migrations/018_paid_listings.sql` — the single source of these schema objects.

---

## 2. Comparison vs. live production schema

Migrations present on disk: `001, 014, 015, 016, 017, 018`. The production `quests` table predates `018` (the error proves `listing_type` is absent). Everything `018` introduces is therefore missing in production:

**Missing columns on `public.quests` (all 11 from migration 018):**

| Column | Type | Notes |
|---|---|---|
| `listing_type` | `public.listing_type` (enum) | ← the column in the error |
| `is_paid_listing` | `boolean NOT NULL DEFAULT false` | |
| `tier` | `public.listing_tier` (enum) | frontend selects this as `tier` |
| `price_paid` | `numeric(10,2)` | |
| `payment_status` | `public.payment_status NOT NULL DEFAULT 'unpaid'` | |
| `stripe_payment_id` | `text` | |
| `starts_at` | `timestamptz` | time-window start |
| `is_featured` | `boolean NOT NULL DEFAULT false` | |
| `business_name` | `text` | |
| `contact_email` | `text` | |
| `contact_phone` | `text` | |

*(`expires_at`, `created_by`, `location_name`, `status` are pre-existing/reused columns — not part of the gap.)*

**Missing enum types:** `public.listing_type`, `public.listing_tier`, `public.payment_status`.

**Missing index:** `idx_quests_listing_window` (partial index on `status, starts_at, expires_at WHERE listing_type IS NOT NULL`).

**Missing / stale RPC:** `public.find_quests_nearby(...)` — `018` drops and recreates it with the new return columns (`listing_type, is_featured, starts_at, expires_at`) plus the paid/time-window gate. Production almost certainly still has the older `015` version (which is why the **map still works** but shows no listings/featured boost — see §4).

**Missing RLS policies:** `"Admins can view all quests"` and `"Admins can update any quest"`. Even after the column is added, admin review depends on these to read other users' submissions.

---

## 3. Which diagnosis applies?

> **Frontend deployed ahead of database — migration exists but was never applied to production.**

Reasoning:
- `018` adds all 11 columns in a **single atomic** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statement. Postgres applies that statement all-or-nothing, so the missing `listing_type` means the entire `ALTER` never ran → none of the 11 columns exist.
- The enum `CREATE TYPE` blocks and the RLS/RPC sections run before/after the `ALTER` in separate statements, so it is *possible* the run got partway (e.g., enums created, columns not). That only changes which idempotent guards no-op on re-run; it does not change the remediation. §5 confirms the exact state.
- There is no evidence of a different/conflicting migration having added these columns under other names.

---

## 4. Production impact (current, before fix)

- **Admin / Discovery Review** → **broken** (the reported error; query selects `listing_type`).
- **Post Event / Post Listing flow** → will **fail on insert** (`listingService.createListing` writes `listing_type` etc.).
- **Stripe webhook & create-checkout** → would fail (`is_paid_listing` / `payment_status`) — only reachable once listings can be created.
- **Map / Adventure Radar** → **still works.** It calls `find_quests_nearby`; the older prod RPC returns rows without the listing fields, so `listingBadge()` simply returns `null` (no badges), no crash. Featured boost and the paid/time-window gate are simply absent.

---

## 5. Exact SQL required

### 5a. Verification first (read-only — run in Supabase SQL editor)

```sql
-- Which 018 columns already exist on quests?
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='quests'
  AND column_name IN ('listing_type','is_paid_listing','tier','price_paid',
    'payment_status','stripe_payment_id','starts_at','is_featured',
    'business_name','contact_email','contact_phone')
ORDER BY column_name;            -- expect 0 rows if 018 never applied

-- Which 018 enum types exist?
SELECT typname FROM pg_type
WHERE typname IN ('listing_type','listing_tier','payment_status');

-- Admin RLS policies present?
SELECT policyname FROM pg_policies
WHERE schemaname='public' AND tablename='quests'
  AND policyname IN ('Admins can view all quests','Admins can update any quest');

-- Current find_quests_nearby return signature
SELECT pg_get_function_result(oid)
FROM pg_proc WHERE proname='find_quests_nearby';
```

### 5b. The fix

Migration `018_paid_listings.sql` is **fully idempotent and safe to re-run** — every statement is guarded (`CREATE TYPE` in `DO $$ ... duplicate_object` blocks, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP FUNCTION IF EXISTS` + `CREATE`, policies in `duplicate_object` guards). Applying the **entire existing `supabase/migrations/018_paid_listings.sql` file unchanged** is the exact SQL required. No new SQL needs to be authored. The minimal core (columns + enums) is:

```sql
DO $$ BEGIN CREATE TYPE public.listing_type AS ENUM
  ('yard_sale','local_event','business_promo','market_show','community_event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.listing_tier AS ENUM
  ('yard_sale','local_event','business_spotlight','featured_business','monthly_partner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_status AS ENUM
  ('unpaid','pending','paid','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS listing_type      public.listing_type,
  ADD COLUMN IF NOT EXISTS is_paid_listing   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier              public.listing_tier,
  ADD COLUMN IF NOT EXISTS price_paid        numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_status    public.payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS stripe_payment_id text,
  ADD COLUMN IF NOT EXISTS starts_at         timestamptz,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS contact_email     text,
  ADD COLUMN IF NOT EXISTS contact_phone     text;
```
…followed by the index, RLS policies, and the `find_quests_nearby` DROP+CREATE exactly as written in `018`.

---

## 6. Safe remediation plan (proposed — not executed)

1. **Confirm state** — run §5a in the production SQL editor (or link the Supabase MCP project) to see exactly what's missing vs partial.
2. **Back up / branch** — take a snapshot or use a Supabase preview branch; apply `018` there first and load the Admin Review page against it.
3. **Apply `018` to production** — `supabase db push` (preferred, records migration history) **or** paste the full `018_paid_listings.sql` into the SQL editor. Idempotent, additive, non-breaking: organic quests get `listing_type = NULL` and are unaffected.
4. **Record migration history** — ensure `018` is registered in `supabase_migrations.schema_migrations` so this drift can't recur (a `db push` does this automatically; a manual SQL-editor paste does not).
5. **Verify** — re-run §5a (all 11 columns + 3 enums + 2 policies present; RPC returns the new columns), then load Admin Review and the Post Event flow.
6. **Prevent recurrence** — add a deploy gate so frontend ships only after `supabase db push` succeeds (DB migrates before/with the frontend, never after).

**Risk:** low. `018` is additive and idempotent; the only behavioral change beyond unblocking admin review is that `find_quests_nearby` gains the paid/time-window gate and featured boost (intended). No data loss; existing rows default cleanly.

---

### One-line answer
Yes — production is missing the paid-listings migration (`018`). It exists in the repo but was never applied; the frontend shipped ahead of the DB. Re-applying `018` (idempotent) is the fix; no new SQL required.
