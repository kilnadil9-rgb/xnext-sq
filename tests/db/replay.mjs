/**
 * Replays the repo's Supabase migrations on a plain local Postgres (opt-in DB
 * tests only — never part of `npm test`). PostGIS-only constructs are adapted;
 * everything else runs verbatim. Missing migration numbers (002–013, 028) are
 * simply absent from the repo and therefore from the replay.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/** Rewrite the few PostGIS-specific constructs for the haversine stand-ins. */
export function adaptSql(sql) {
  return sql
    .replace(/^\s*CREATE EXTENSION IF NOT EXISTS (postgis|pgcrypto).*$/gim, '-- (extension shimmed by harness)')
    .replace(/(?:extensions\.)?geography\(Point,\s*4326\)/g, 'public.geography')
    .replace(/extensions\.(geography|geometry|ST_\w+)/g, 'public.$1')
    .replace(/^.*USING GIST \(.*$/gim, '-- (gist index skipped)')
}

export async function resetAndReplay(client, { through = 999 } = {}) {
  await client.query(`DROP SCHEMA IF EXISTS public CASCADE`)
  await client.query(`DROP SCHEMA IF EXISTS auth CASCADE`)
  await client.query(`DROP SCHEMA IF EXISTS storage CASCADE`)
  await client.query(`DROP SCHEMA IF EXISTS extensions CASCADE`)
  await client.query(`CREATE SCHEMA public`)
  await client.query(`GRANT ALL ON SCHEMA public TO public`)
  await client.query(readFileSync(join(ROOT, 'supabase', 'tests', 'replay_shim.sql'), 'utf8'))
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
  const applied = []
  for (const f of files) {
    if (Number(f.slice(0, 3)) > through) continue
    if (f.startsWith('029_')) {
      // Stand-in for the missing 028: 029 redefines get_experience_markers with
      // a different return type, so the old 027 version must be dropped first.
      await client.query(`DROP FUNCTION IF EXISTS public.get_experience_markers(uuid)`)
    }
    // Each file in its own implicit transaction, in numeric order (matches
    // `supabase db push`; required for the 030 enum value).
    try {
      await client.query(adaptSql(readFileSync(join(MIGRATIONS, f), 'utf8')))
    } catch (e) {
      e.message = `[replay ${f}] ${e.message}`
      throw e
    }
    applied.push(f)
    if (f.startsWith('001_')) {
      // Live-DB drift stand-in: profiles.is_admin is used by 018+ policies but
      // is created by no repo migration (it exists in production).
      await client.query(
        `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`,
      )
    }
  }
  return applied
}
