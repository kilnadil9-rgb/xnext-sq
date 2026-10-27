# Production apply plans (NOT applied — awaiting Aaron)
Project genidibsxbowwirucefw. Live state 2026-10-27: migrations 001, 014–026 applied (+035 fix applied today). 027, 028, 029, 030–034, 036 NOT applied.
General backup step for every plan: (1) schema dump: `supabase db dump --linked -f pre_<plan>.sql` (schema only) and `--data-only` for the affected tables; (2) re-run the read-only catalog snapshot (policies/grants/triggers/functions) into `/workspace/xnext-live-schema/`. Apply each file in its own transaction (`supabase db push` semantics), never in one batch with an enum addition.

## (a) Dog meetups 030–034 (branch feature/dog-meetups)
- Depends on: 035 (applied) — without it the admin gates are bypassable. Recommended after 036. Independent of 027/029 (verified: replay without 027/029 → 22/22).
- Backup: quests (all rows), storage.buckets, storage.objects policies, find_quests_nearby + refresh_quest_verified_location definitions (already saved: `/workspace/xnext-live-schema/*.sql`).
- Steps: 030 alone (enum `dog_meetup`, must commit first) → 031 (dog columns, is_admin_user, guard trigger, restrictive policies, approve/reject RPCs) → 032 (private `dog-meetup-pending` + public meetup bucket, policies) → 033 (quest_reports + report_quest) → 034 (find_quests_nearby DROP+CREATE with dog columns, refresh_quest_verified_location with dog branch). Then deploy the branch client.
- Rollback (reverse order):
  - 034: re-create live find_quests_nearby and refresh_quest_verified_location from the saved definitions (DROP FUNCTION find_quests_nearby(double precision,double precision,double precision,integer,integer) first).
  - 033: `drop function report_quest(uuid, quest_report_reason, text); drop table quest_reports; drop type quest_report_reason;`
  - 032: drop the 5 "Meetup …" storage.objects policies; delete the two buckets (only if empty).
  - 031: drop policies "Dog meetups need admin to publish/update", trigger trg_quests_dog_meetup_guard + function, approve_/reject_dog_meetup, is_admin_user; `alter table quests drop column dog_size, dog_fenced, dog_leash_info, dog_parking_info` (only after deleting dog_meetup rows).
  - 030: enum values cannot be dropped; harmless if unused (leave).
- Verify: read-only catalog check; rolled-back txn: regular user inserts a meetup → pending_review, cannot publish, anon/other users cannot see it via find_quests_nearby; admin approve_dog_meetup → visible within 14-day window; photo in pending bucket only via signed URL. Preview smoke test.

## (b) 027 explorer markers / 029 The Chase
- Production client (b3b4595) already calls these objects → those features currently error live. 028 is missing from the repo; the local replay needs `DROP FUNCTION get_experience_markers(uuid)` before 029 (stand-in for 028). **Get 028 from wherever 029 was developed before applying**, or apply 029 with that explicit drop.
- Depends on: 001–026 (present). Independent of 030–036.
- Backup: schema dump; list of existing functions with the same names (none live today).
- Steps: 027 → (028 or the drop) → 029, each in its own transaction. Then re-check the client screens that use markers/Chase.
- Rollback: drop the tables/functions/policies created by 029 then 027 (generate the exact DROP list from `git show b3b4595:supabase/migrations/02{7,9}_*.sql` before applying; new tables carry no pre-existing data so drop is lossless at apply time — later it loses user marker/Chase data).
- Verify: objects exist, RLS on new tables, a rolled-back txn as a regular user exercises a marker insert/read and a Chase RPC; client pages load without RPC errors.

## (c) Restore logged-out public map safely
Today quests has no anon SELECT policy → find_quests_nearby (SECURITY INVOKER) returns nothing to logged-out visitors.
Recommended: a SECURITY DEFINER RPC `public_quests_nearby(lat,lng,radius_km,limit,offset)` that returns ONLY safe columns (id, title, short description, experience_class, listing_type, lat/lng rounded, city, media_urls, starts_at, expires_at, verified_location) WHERE status='published' AND (expires_at is null or expires_at > now()) AND starts_at <= now() AND (not is_paid_listing or payment_status='paid'); excludes contact_email/phone, created_by, metadata, stripe fields; caps limit at 100. `GRANT EXECUTE … TO anon`; client calls it when no session. Avoid a raw anon SELECT policy on quests because it exposes every column (contact_email/phone, created_by, metadata) via PostgREST.
Also proposed separately: replace profiles' public `SELECT true` with a narrow view/RPC (username, avatar_url, trust_score) so is_admin and deletion fields are not public.
Rollback: `drop function public_quests_nearby(...)`. Verify: anon call returns only published/paid/in-window rows and no sensitive columns; pending rows never returned.

## (d) Storage bucket size/MIME limits (all buckets have none today)
| bucket | public | proposed file_size_limit | allowed_mime_types | impact |
|---|---|---|---|---|
| avatars | yes | 2 MB | image/jpeg, image/png, image/webp | check avatar upload compresses; larger existing files unaffected |
| quest-photos | yes | 8 MB | image/jpeg, image/png, image/webp, image/heic | Discover/QuestForm photos from phones (HEIC) — confirm client converts or keep heic |
| quests | no | 8 MB | images as above | listing photos |
| organizations | yes | 2 MB | images + image/svg+xml? (prefer no SVG: XSS risk) | org logos |
| uploads | no | 10 MB | images + application/pdf | confirm actual uses first |
| ai-assets | no | 20 MB | images (+ audio/video if used) | confirm usage first |
Also: tighten the bucket-wide authenticated INSERT policies on avatars/organizations/quests/uploads/ai-assets to `(storage.foldername(name))[1] = auth.uid()::text` — check client upload paths before doing so.
SQL: `update storage.buckets set file_size_limit=…, allowed_mime_types=array[…] where id='…';`. Backup: `select id,public,file_size_limit,allowed_mime_types from storage.buckets` (saved: out/buckets.json). Rollback: set both back to NULL. Limits only affect new uploads. Verify: upload over limit / wrong type rejected (413/415) on preview; normal photo upload works.
