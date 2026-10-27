# Dog Meetups

Social dog playdates, created by users, shown on the map after admin review.
Not breeding, not dog sales, no payments, DMs, contact details, tracking or dog profiles.

## How it works

| Step | Behaviour |
| --- | --- |
| Create | `/dashboard/dog-meetups/new`. Required: title, date, start time, public location (map pin + place text), short description, dog size (small / medium / large / all). Optional: end time, fenced, leash info, parking info, **one** photo. A notice says details and photos may be visible to others after approval and must be acknowledged. |
| Submit | Row is inserted `status = 'pending_review'`, `listing_type = 'dog_meetup'`. The photo (if any) goes to the **private** bucket `meetup-photos-pending/{uid}/{uuid}.jpg`. |
| Review | `/dashboard/admin/meetups` (admin only). Shows details and the photo via a 10-minute signed URL. Approve copies the photo to the public `meetup-photos` bucket, then calls `approve_dog_meetup`. Reject calls `reject_dog_meetup` (archives the row) and removes the pending photo. |
| Discover | `find_quests_nearby` returns approved meetups only, inside the normal radius, from 14 days before the start until the end. |
| Report | "Report this meetup" on the detail sheet writes to `quest_reports`. Admins see open reports on the same admin page and can take the listing down, mark it reviewed or dismiss it. |

Meetups are never labelled approved/verified before review. After approval they are shown as "Dog Meetup" only.
The verified-location badge and the explorer proof label are hidden for meetups, and the "I went to this meetup"
action records a visit **without** claiming verified attendance.

## Timing rules (documented defaults)

* **Lead window: 14 days** (`MEETUP_LEAD_WINDOW_DAYS`, and `interval '14 days'` in migration 034). An approved meetup is discoverable from `starts_at - 14 days`.
* **Default duration: 2 hours.** With no end time, `expires_at = starts_at + 2 hours`. Max duration 24 h, start at most 90 days ahead, start may not be more than 5 minutes in the past. Enforced in the DB trigger and mirrored in `validateMeetupForm`.
* **After the end:** rows stay `published` (completion history is kept) and are excluded from active discovery by the RPC (`expires_at > now()`). Because `useNearbyQuests` caches for 24 h, the client also applies `filterActiveNearby` with a 60 s tick.
* Other listing types keep the 023 timing; the RPC branch is meetup-only.
* There is no per-meetup timezone. Times are stored as `timestamptz` and shown in the viewer's local time.

## Server-side enforcement (not just UI)

* `quests_dog_meetup_guard` trigger plus RESTRICTIVE RLS policies: non-admins can only write `draft` / `pending_review` for `dog_meetup` rows. Published/archived meetups are frozen to non-admins. Privileged fields (status, featured, trust, verification, external url, expiry beyond the allowed range) are forced to safe values. Service role and admins are exempt.
* Pending rows are invisible to public discovery: the RPC filters `status = 'published'`, and the public SELECT policy only exposes published rows.
* Storage: `meetup-photos-pending` is private (3 MB, jpeg/png/webp via `allowed_mime_types` / `file_size_limit`), users may only insert into their own `{uid}/` folder and read their own, no UPDATE policy; admins read via signed URL. `meetup-photos` is public but admin-write only. A pending image never has a public URL.
* `approve_dog_meetup` / `reject_dog_meetup`: admin-checked SECURITY DEFINER RPCs, EXECUTE revoked from PUBLIC/anon.
* `quest_reports`: one report per user per quest (`UNIQUE (quest_id, reporter_user_id)`), reason enum + optional text ≤ 500, written only through `report_quest` (sign-in required, 20 reports/24 h). Authenticated users can insert their own; only admins select/update.

## Migrations: apply order

Apply in this order, one at a time. **030 must be applied and committed alone first** (Postgres cannot use a new enum value in the same transaction that adds it).

1. `030_dog_meetup_enum.sql` – `ALTER TYPE listing_type ADD VALUE 'dog_meetup'`
2. `031_dog_meetups.sql` – typed columns, CHECK, `is_admin_user()`, guard trigger, restrictive policies, approve/reject RPCs
3. `032_dog_meetup_storage.sql` – buckets and `storage.objects` policies
4. `033_quest_reports.sql` – reports table, RLS, `report_quest`
5. `034_dog_meetup_discovery.sql` – new `find_quests_nearby` (meetup window, no verified/trust for meetups) and `refresh_quest_verified_location` (ignores meetups)

Nothing in this branch has been applied to production. The deployed client is safe against an unmigrated DB:
a meetup submit fails with a friendly error, and existing screens still call the old RPC.
Client code that lists quests directly (`listPublishedQuests`, `searchQuests`, `getQuestsByClass`) excludes meetups client-side, so a meetup row can never appear in a non-meetup list.

## Verification status

Verified locally (Postgres 18 via `embedded-postgres`, repo migrations + 030–034, `tests/db/dogMeetupDb.test.mjs`, 22 tests): pending not publicly readable, non-admin cannot self-publish or edit reviewed rows, approve/reject flow, reports policies and rate limit, expiry/lead window in the RPC, storage policies at the SQL level.

**Not** verified: against real Supabase (PostGIS is shimmed with haversine; the Storage HTTP API, MIME and size limits were not exercised; `supabase` CLI and docker are not available on the box), and against the live schema (see below).

## Needed from the owner before production

* A read-only look at the live schema: migrations 002–013 and 028 appear missing from the repo; `profiles.is_admin` and its policies/triggers; the live `find_quests_nearby` and `refresh_quest_verified_location` definitions (031 and 034 replace them); existing storage policies.
* Approval to apply 030 to 034 and to create the two buckets (production Supabase).

## Security finding: `profiles.is_admin` self-escalation (outside this feature)

On the repo schema a signed-in user can update their own `profiles` row, including `is_admin` and `trust_score`.
That defeats every admin gate, including this feature's. Unverified on the live DB. A **proposed, unapplied** fix is in
`docs/proposed/profiles_protect_privileged_columns.sql` (not part of the migration chain). Check the live policies and triggers first.

## Proposed (not implemented): close self-publish for all quests

Today non-meetup quests created through Discover can auto-publish by design, and this feature does not change that.
If you want the same protection for all types, extend the guard trigger to all `listing_type` values (non-admin writes limited to
draft/pending_review) and add the same RESTRICTIVE policies. This would change Discover behaviour, so it should be a separate,
explicitly approved change.

## Known limitations

* Taking down a published meetup clears `media_urls` but does not delete the object in the public `meetup-photos` bucket.
* The per-user upload quota is not enforced (size/type limits are).
* HEIC photos are not decoded by every browser; users get a friendly hint to pick JPEG/PNG. Resized photos are re-encoded as JPEG (≤1280 px, EXIF stripped).
* The Dog Meetups filter pill is on the Home (cinematic) map only.
* Dog fields are typed columns on `quests` (not JSON) to allow CHECKs and keep queries simple.
