# profiles privileged columns fix (applied to production 2026-10-27)

- Migration: `supabase/migrations/035_profiles_protect_privileged_columns.sql` (identical SQL to what was applied; sha1 of applied script b17832e9…).
- Applied via the Supabase Management API (`/v1/projects/genidibsxbowwirucefw/database/query`) in one `begin … commit`.
- Pre-apply snapshot (policies, RLS flags, table + column grants, triggers, row fingerprints): `/workspace/xnext-live-schema/fix/snapshot_before.json` (box). After: `snapshot_after.json` — only the trigger + function differ; profiles/quests fingerprints and auth.users count unchanged.

## Rollback (restores exact pre-fix state: no triggers existed on public.profiles)
```sql
begin;
drop trigger if exists trg_profiles_protect_privileged_columns on public.profiles;
drop function if exists public.profiles_protect_privileged_columns();
commit;
```

## Verification (all in one transaction that ROLLS BACK) — `profiles-privileged-columns.verify.sql`
| test | result |
|---|---|
| 1a non-admin sets own is_admin | blocked 42501 |
| 1b non-admin sets own trust_score | blocked 42501 |
| 1c non-admin edits someone else's profile | 0 rows (RLS unchanged) |
| 2a existing admin still is_admin | yes |
| 2b/2c admin sees all 31 quests, updates 13 quests owned by others | pass |
| 2d admin edits own bio | 1 row |
| 3 non-admin edits own bio/full_name | 1 row |
| 4a signup: insert auth.users → handle_new_user creates profile (is_admin false, trust 0) | pass |
| 4b 3 completions by regular users → quest verified, creator trust +5 (nested trigger path) | pass |

Note: admins can no longer change is_admin/trust_score from the app either (the app has no such UI); grant admin via SQL editor / service role.
