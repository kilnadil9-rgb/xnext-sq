# 036 — quests: no self-publish, admin fields protected (PROPOSED, not applied)

Live gap: `"quests: update own"` lets an owner set `status='published'` and any column (payment_status, tier, is_featured, priority_boost, paid-listing window, verified_location…).

## What 036 does (trigger `trg_quests_protect_admin_fields`)
Non-admin, non-moderator end users:
- INSERT only `draft` / `pending_review`; `published_at`, `price_paid`, `stripe_payment_id`, sponsor fields, `priority_boost`, `verified_location`, `completed_count`, `sq_score*` must be default; `payment_status` only `unpaid`/`pending`.
- UPDATE cannot move into `published`; cannot change payment_status, is_paid_listing, tier, price_paid, stripe_payment_id, published_at, is_featured, is_sponsored, sponsor_id, priority_boost, verified_location, completed_count, sq_score*, created_by, organization_id; paid listings also cannot change listing_type / starts_at / expires_at.
- Editing an already-published quest silently demotes it to `pending_review` (re-review). Unpublish (→draft) and archive remain allowed.
- Exempt: service role / no JWT (stripe-webhook), nested triggers (completions → verified/trust), `profiles.is_admin`, `has_permission('moderation.manage')`.

## Flow compatibility (b3b4595)
| Flow | Today | With 036 | Client change |
|---|---|---|---|
| Discover sheet (DashboardLayout) | `DISCOVERY_AUTO_PUBLISH=true` inserts `published` | would be rejected (42501) | **Set `DISCOVERY_AUTO_PUBLISH=false`** (done on this branch) → lands `pending_review`, existing "submitted for review" copy shows |
| PostListingPage → listingService.createListing | inserts pending_review, is_paid_listing, payment_status 'pending', tier, is_featured, starts/expires | allowed (tested) | none |
| create-checkout-session (user JWT) | reads listing only | unaffected | none |
| stripe-webhook (service role) | sets payment_status='paid', stripe id | exempt (tested) | none |
| CreateQuestPage/QuestForm | createQuest default `draft` | allowed | none |
| EditQuestPage updateQuest | edits any own quest | drafts/pending fine; editing a published quest → pending_review | consider a UI note "edits to a live quest are re-reviewed" |
| MyQuestsPage "Publish" → setQuestStatus('published') | self-publish | rejected | **Button now "Submit for review" → `pending_review`, only for drafts** (done) |
| setQuestStatus 'draft'/'archived' | ok | ok | none |
| AdminReviewPage / AdminDiscoveryMapPage approve/archive (+published_at) | admin | admin exempt (tested) | none |
| Admin listings/featured edits | admin | exempt | none |

Behaviour change for Aaron to accept: Discover submissions and regular quests are no longer instantly live; they appear in AdminReviewPage's pending queue.

Tests: `DB_REPLAY_SKIP=027,029 node --test tests/db/questSelfPublishDb.test.mjs` → 7/7 (also 7/7 with full chain; fails as expected without 035/036).

## Apply (after approval)
Backup: `select * from public.quests` export (31 rows) + `pg_get_triggerdef` of quests triggers. Apply 036 in one transaction. Deploy client (DISCOVERY_AUTO_PUBLISH=false, MyQuests button) **at the same time or before**, otherwise Discover submits error.
Rollback:
```sql
begin;
drop trigger if exists trg_quests_protect_admin_fields on public.quests;
drop function if exists public.quests_protect_admin_fields();
commit;
```
Verify (rolled-back txn as a regular user): insert published → 42501; update own to published → 42501; set payment_status → 42501; draft insert + title edit succeed; admin approve succeeds; webhook-style (no JWT) payment update succeeds.
