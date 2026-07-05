/**
 * Command Center moderation insights (RC6). Pure, read-only heuristics over
 * the rows already loaded by admin_map_listings — no writes, no new RPCs,
 * production data untouched. Unit-tested in tests/moderationInsights.test.ts.
 */

import { haversineMeters } from './distance'

/** Minimal row shape the heuristics need (subset of AdminMapListing). */
export interface InsightRow {
  id: string
  title: string
  status: string
  created_at: string
  created_by: string
  lat: number
  lng: number
}

/** Normalize a title for duplicate comparison. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface DuplicateGroup {
  /** Normalized title shared by the group. */
  key: string
  rows: InsightRow[]
}

/**
 * Possible duplicates: same normalized title within `radiusM` meters.
 * Catches double-submissions and copy-paste spam; moderators decide.
 */
export function findDuplicates(
  rows: InsightRow[],
  radiusM = 300,
): DuplicateGroup[] {
  const byTitle = new Map<string, InsightRow[]>()
  for (const r of rows) {
    const key = normalizeTitle(r.title)
    if (key.length < 3) continue
    const list = byTitle.get(key)
    if (list) list.push(r)
    else byTitle.set(key, [r])
  }

  const groups: DuplicateGroup[] = []
  byTitle.forEach((list, key) => {
    if (list.length < 2) return
    // Same name is only suspicious when the pins are near each other.
    const anchor = list[0]
    const near = list.filter(
      (r) =>
        r.id === anchor.id ||
        haversineMeters(
          { lat: anchor.lat, lng: anchor.lng },
          { lat: r.lat, lng: r.lng },
        ) <= radiusM,
    )
    if (near.length >= 2) groups.push({ key, rows: near })
  })
  return groups.sort((a, b) => b.rows.length - a.rows.length)
}

/** Pending-review rows older than `days` — the forgotten queue. */
export function stalePending(
  rows: InsightRow[],
  days = 7,
  now: number = Date.now(),
): InsightRow[] {
  const cutoff = now - days * 86_400_000
  return rows
    .filter(
      (r) => r.status === 'pending_review' && Date.parse(r.created_at) < cutoff,
    )
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

export interface RapidSubmitter {
  created_by: string
  count: number
  rows: InsightRow[]
}

/**
 * Accounts submitting unusually fast: >= `threshold` rows created within
 * `windowHours`. A common spam/fraud smell; surfaced for human review only.
 */
export function rapidSubmitters(
  rows: InsightRow[],
  threshold = 4,
  windowHours = 24,
  now: number = Date.now(),
): RapidSubmitter[] {
  const cutoff = now - windowHours * 3_600_000
  const byUser = new Map<string, InsightRow[]>()
  for (const r of rows) {
    const t = Date.parse(r.created_at)
    if (!Number.isFinite(t) || t < cutoff) continue
    const list = byUser.get(r.created_by)
    if (list) list.push(r)
    else byUser.set(r.created_by, [r])
  }
  const result: RapidSubmitter[] = []
  byUser.forEach((list, created_by) => {
    if (list.length >= threshold) result.push({ created_by, count: list.length, rows: list })
  })
  return result.sort((a, b) => b.count - a.count)
}
