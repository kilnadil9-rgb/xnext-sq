/**
 * XNEXT Phase 1.8 — Seasonal experience helpers.
 *
 * Pure functions, no I/O. Maps between season tags, calendar months, and the
 * UI badges / "Seasonal Now" labels used across the form, admin, radar list,
 * and preview card. The canonical source of truth for "in season" is
 * active_months (1-12); season_tags are the human labels.
 */

export type SeasonTag = 'spring' | 'summer' | 'fall' | 'winter'

export interface SeasonBadge {
  /** machine key — also used as a CSS modifier */
  key: SeasonTag | 'evergreen'
  emoji: string
  label: string
}

/** Northern-hemisphere month groupings (launch market: Tri-Cities, WA). */
export const SEASON_MONTHS: Record<SeasonTag, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  fall: [9, 10, 11],
  winter: [12, 1, 2],
}

export const SEASON_BADGES: Record<SeasonTag | 'evergreen', SeasonBadge> = {
  spring: { key: 'spring', emoji: '🌼', label: 'Spring' },
  summer: { key: 'summer', emoji: '☀️', label: 'Summer' },
  fall: { key: 'fall', emoji: '🍂', label: 'Fall' },
  winter: { key: 'winter', emoji: '❄️', label: 'Winter' },
  evergreen: { key: 'evergreen', emoji: '⭐', label: 'Year Round' },
}

export const SEASON_TAGS: SeasonTag[] = ['spring', 'summer', 'fall', 'winter']

/** Union of months for the given season tags (sorted, de-duped). */
export function monthsForSeasons(tags: readonly SeasonTag[]): number[] {
  const set = new Set<number>()
  for (const t of tags) for (const m of SEASON_MONTHS[t]) set.add(m)
  return [...set].sort((a, b) => a - b)
}

/** Reverse map: which season tags do these months belong to. */
export function seasonsForMonths(months: readonly number[]): SeasonTag[] {
  return SEASON_TAGS.filter((t) =>
    SEASON_MONTHS[t].some((m) => months.includes(m)),
  )
}

interface SeasonalFields {
  season_tags?: string[] | null
  active_months?: number[] | null
  start_date?: string | null
  end_date?: string | null
  is_evergreen?: boolean | null
}

/** Current month 1-12, with injectable clock for tests. */
function currentMonth(now: number): number {
  return new Date(now).getMonth() + 1
}

/** True when the experience is in its active month or date window right now. */
export function isSeasonallyActive(
  q: SeasonalFields,
  now: number = Date.now(),
): boolean {
  const m = currentMonth(now)
  if (q.active_months && q.active_months.includes(m)) return true
  if (q.start_date && q.end_date) {
    const t = now
    const s = Date.parse(q.start_date)
    const e = Date.parse(q.end_date)
    if (Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e) return true
  }
  return false
}

/**
 * Discovery ranking tier (mirrors the SQL seasonal_rank):
 *   0 active seasonal · 1 active date-based · 2 evergreen · 3 inactive seasonal
 */
export function seasonalRank(
  q: SeasonalFields,
  now: number = Date.now(),
): 0 | 1 | 2 | 3 {
  const m = currentMonth(now)
  if (q.active_months && q.active_months.includes(m)) return 0
  if (q.start_date && q.end_date) {
    const s = Date.parse(q.start_date)
    const e = Date.parse(q.end_date)
    if (Number.isFinite(s) && Number.isFinite(e) && now >= s && now <= e) return 1
  }
  if (q.is_evergreen) return 2
  return 3
}

/** Badges to render for an experience (season tags, or the evergreen star). */
export function seasonBadges(q: SeasonalFields): SeasonBadge[] {
  const tags = (q.season_tags ?? []).filter((t): t is SeasonTag =>
    (SEASON_TAGS as string[]).includes(t),
  )
  if (tags.length > 0) return tags.map((t) => SEASON_BADGES[t])
  // Fall back to deriving tags from active_months if season_tags weren't set.
  if (q.active_months && q.active_months.length > 0) {
    return seasonsForMonths(q.active_months).map((t) => SEASON_BADGES[t])
  }
  if (q.is_evergreen) return [SEASON_BADGES.evergreen]
  return []
}

const DAY_MS = 86_400_000

/**
 * Short status label for the radar/preview:
 *   "Seasonal Now" · "Ending Soon" · "Coming Next Season" · null
 * Only date-windowed or month-windowed experiences produce a label.
 */
export function seasonalStatusLabel(
  q: SeasonalFields,
  now: number = Date.now(),
): string | null {
  // Date-based window takes precedence (most specific).
  if (q.start_date && q.end_date) {
    const s = Date.parse(q.start_date)
    const e = Date.parse(q.end_date)
    if (Number.isFinite(s) && Number.isFinite(e)) {
      if (now < s) return 'Coming Soon'
      if (now > e) return null
      const daysLeft = (e - now) / DAY_MS
      return daysLeft <= 7 ? 'Ending Soon' : 'Happening Now'
    }
  }
  const active = isSeasonallyActive(q, now)
  if (active) {
    // "Ending soon" when we're in the last active month of the run.
    const m = currentMonth(now)
    const months = q.active_months ?? []
    const nextMonth = (m % 12) + 1
    if (months.includes(m) && !months.includes(nextMonth)) return 'Ending Soon'
    return 'Seasonal Now'
  }
  // Not active but seasonal → it's coming back at some point.
  if ((q.active_months?.length ?? 0) > 0 && !q.is_evergreen) {
    return 'Coming Next Season'
  }
  return null
}
