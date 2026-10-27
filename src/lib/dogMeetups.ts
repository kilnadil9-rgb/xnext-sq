/**
 * Dog Meetups — pure helpers (no React, no Supabase): constants, form
 * validation, expiry/visibility rules, copy, and photo sizing math.
 *
 * Dog Meetups are social dog playdates. They are ALWAYS submitted as
 * pending_review and become public only after an admin approves them
 * (enforced in the database — see supabase/migrations/031_dog_meetups.sql).
 */
import type { DogSize, NearbyQuest } from './supabase/types'

// ── Documented rules (keep in sync with migrations 031 + 034) ────────────────
/** An approved meetup is shown up to this many days before it starts. */
export const MEETUP_LEAD_WINDOW_DAYS = 14
/** If no end time is given the meetup ends this long after it starts. */
export const MEETUP_DEFAULT_DURATION_HOURS = 2
/** Longest allowed meetup (DB CHECK: expires_at <= starts_at + 24h). */
export const MEETUP_MAX_DURATION_HOURS = 24
/** Furthest-ahead start a submitter may pick (DB guard). */
export const MEETUP_MAX_ADVANCE_DAYS = 90
/** Grace for clock skew / slow submits when checking "start is in the past". */
export const MEETUP_PAST_GRACE_MINUTES = 5

export const MEETUP_LIMITS = {
  titleMin: 3,
  titleMax: 80,
  descriptionMax: 500,
  locationNameMax: 120,
  infoMax: 160,
} as const

export const DOG_SIZE_OPTIONS: ReadonlyArray<{ value: DogSize; label: string }> = [
  { value: 'small', label: 'Small dogs' },
  { value: 'medium', label: 'Medium dogs' },
  { value: 'large', label: 'Large dogs' },
  { value: 'all', label: 'All sizes' },
]

export const DOG_MEETUPS_EMPTY_STATE = 'No dog meetups nearby yet. Be the first to create one.'

/** Shown before submission (required by the brief). */
export const MEETUP_VISIBILITY_NOTICE =
  'After an admin approves your meetup, its details and photo may be visible to other people. ' +
  'Only share a public meeting place and nothing you want to keep private.'

export const MEETUP_REVIEW_COPY =
  'Thanks! Your meetup was submitted and is waiting for review. It will not appear on the map until an admin approves it.'

/** Map/list badge. Deliberately plain: never "featured", "partner" or "verified". */
export const DOG_MEETUP_BADGE = { label: 'Dog Meetup', kind: 'dog' } as const

export function dogSizeLabel(size: DogSize | null | undefined): string | null {
  return DOG_SIZE_OPTIONS.find((o) => o.value === size)?.label ?? null
}

// ── Photo limits (mirror the bucket limits in migration 032) ─────────────────
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024
export const PHOTO_MAX_EDGE_PX = 1280
export const PHOTO_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Scale (w,h) down so the longest edge is <= max, preserving aspect. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** True for file types the browser can usually decode; HEIC/HEIF handled separately. */
export function isHeicLike(file: { type: string; name: string }): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

// ── Form validation ──────────────────────────────────────────────────────────
export interface MeetupFormInput {
  title: string
  description: string
  locationName: string
  hasLocation: boolean
  /** "YYYY-MM-DD" from <input type=date> (viewer's local date). */
  date: string
  /** "HH:mm" from <input type=time>. */
  startTime: string
  /** Optional "HH:mm"; empty = default duration. */
  endTime: string
  dogSize: DogSize | ''
  leashInfo: string
  parkingInfo: string
  acknowledged: boolean
}

export type MeetupFormErrors = Partial<
  Record<
    | 'title'
    | 'description'
    | 'locationName'
    | 'location'
    | 'date'
    | 'startTime'
    | 'endTime'
    | 'dogSize'
    | 'leashInfo'
    | 'parkingInfo'
    | 'acknowledged',
    string
  >
>

/** Parse local date + time strings into a Date (local time zone). Null if invalid. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [h, mi] = [Number(tm[1]), Number(tm[2])]
  if (h > 23 || mi > 59) return null
  const out = new Date(y, mo - 1, d, h, mi, 0, 0)
  // Reject overflow like 2026-02-31.
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== d) return null
  return out
}

export interface ResolvedMeetupTimes {
  startsAt: Date
  expiresAt: Date
  /** True when the submitter left the end time blank and we applied the default. */
  usedDefaultEnd: boolean
}

/**
 * Resolve start/end instants. An end time earlier than (or equal to) the start
 * time is treated as invalid rather than rolling over to the next day.
 * Returns null when start is unparseable; see validateMeetupForm for messages.
 */
export function resolveMeetupTimes(
  date: string,
  startTime: string,
  endTime: string,
): ResolvedMeetupTimes | null {
  const startsAt = parseLocalDateTime(date, startTime)
  if (!startsAt) return null
  if (!endTime) {
    return {
      startsAt,
      expiresAt: new Date(startsAt.getTime() + MEETUP_DEFAULT_DURATION_HOURS * 3_600_000),
      usedDefaultEnd: true,
    }
  }
  const expiresAt = parseLocalDateTime(date, endTime)
  if (!expiresAt) return null
  return { startsAt, expiresAt, usedDefaultEnd: false }
}

export function validateMeetupForm(input: MeetupFormInput, now: Date = new Date()): MeetupFormErrors {
  const e: MeetupFormErrors = {}
  const title = input.title.trim()
  if (title.length < MEETUP_LIMITS.titleMin) e.title = `Give your meetup a title (at least ${MEETUP_LIMITS.titleMin} characters).`
  else if (title.length > MEETUP_LIMITS.titleMax) e.title = `Keep the title under ${MEETUP_LIMITS.titleMax} characters.`

  const desc = input.description.trim()
  if (!desc) e.description = 'Add a short description.'
  else if (desc.length > MEETUP_LIMITS.descriptionMax) e.description = `Keep the description under ${MEETUP_LIMITS.descriptionMax} characters.`

  const place = input.locationName.trim()
  if (!place) e.locationName = 'Name the public place (for example "Gas Works Dog Park").'
  else if (place.length > MEETUP_LIMITS.locationNameMax) e.locationName = `Keep the place name under ${MEETUP_LIMITS.locationNameMax} characters.`
  if (!input.hasLocation) e.location = 'Pick the meeting spot on the map.'

  if (!input.dogSize) e.dogSize = 'Choose which dog sizes are welcome.'

  if (input.leashInfo.trim().length > MEETUP_LIMITS.infoMax) e.leashInfo = `Keep leash info under ${MEETUP_LIMITS.infoMax} characters.`
  if (input.parkingInfo.trim().length > MEETUP_LIMITS.infoMax) e.parkingInfo = `Keep parking info under ${MEETUP_LIMITS.infoMax} characters.`

  if (!input.acknowledged) e.acknowledged = 'Please confirm you have read the notice above.'

  if (!input.date) e.date = 'Pick a date.'
  if (!input.startTime) e.startTime = 'Pick a start time.'
  if (input.date && input.startTime) {
    const start = parseLocalDateTime(input.date, input.startTime)
    if (!start) {
      e.startTime = 'That date or time is not valid.'
    } else {
      const graceMs = MEETUP_PAST_GRACE_MINUTES * 60_000
      if (start.getTime() < now.getTime() - graceMs) {
        e.startTime = 'The start time is in the past. Pick a time that has not happened yet.'
      } else if (start.getTime() > now.getTime() + MEETUP_MAX_ADVANCE_DAYS * 86_400_000) {
        e.date = `Meetups can be posted up to ${MEETUP_MAX_ADVANCE_DAYS} days ahead.`
      } else if (input.endTime) {
        const end = parseLocalDateTime(input.date, input.endTime)
        if (!end) e.endTime = 'That end time is not valid.'
        else if (end.getTime() <= start.getTime()) e.endTime = 'The end time must be after the start time.'
        else if (end.getTime() - start.getTime() > MEETUP_MAX_DURATION_HOURS * 3_600_000) {
          e.endTime = `A meetup can last at most ${MEETUP_MAX_DURATION_HOURS} hours.`
        }
      }
    }
  }
  return e
}

export function hasErrors(e: MeetupFormErrors): boolean {
  return Object.keys(e).length > 0
}

// ── Visibility / expiry ──────────────────────────────────────────────────────
export function isDogMeetup(q: { listing_type?: string | null }): boolean {
  return q.listing_type === 'dog_meetup'
}

/** Effective end instant (ms) of a meetup: expires_at, else start + 2 hours. */
export function meetupEndMs(q: { starts_at?: string | null; expires_at?: string | null }): number | null {
  if (q.expires_at) {
    const t = Date.parse(q.expires_at)
    if (Number.isFinite(t)) return t
  }
  if (q.starts_at) {
    const t = Date.parse(q.starts_at)
    if (Number.isFinite(t)) return t + MEETUP_DEFAULT_DURATION_HOURS * 3_600_000
  }
  return null
}

/** Has this meetup finished (so it is excluded from active discovery)? */
export function isMeetupExpired(
  q: { starts_at?: string | null; expires_at?: string | null },
  nowMs: number = Date.now(),
): boolean {
  const end = meetupEndMs(q)
  return end !== null && end <= nowMs
}

/** Is the meetup inside the lead window (or already running)? */
export function isWithinLeadWindow(
  q: { starts_at?: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (!q.starts_at) return false
  const start = Date.parse(q.starts_at)
  if (!Number.isFinite(start)) return false
  return start <= nowMs + MEETUP_LEAD_WINDOW_DAYS * 86_400_000
}

/**
 * Client-side counterpart of the RPC rule. The nearby list is cached for 24h in
 * localStorage, so meetups that ended since the fetch must be dropped here.
 * Every non-meetup row is passed through untouched.
 */
export function filterActiveNearby<T extends Pick<NearbyQuest, 'listing_type' | 'starts_at' | 'expires_at'>>(
  quests: T[],
  nowMs: number = Date.now(),
): T[] {
  return quests.filter((q) => {
    if (!isDogMeetup(q)) return true
    return !isMeetupExpired(q, nowMs) && isWithinLeadWindow(q, nowMs)
  })
}

// ── Display ──────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * "Today · 3:30 PM – 5:30 PM", "Tomorrow · …", "Sat, Nov 7 · …", or
 * "Happening now · until 5:30 PM". Times render in the viewer's local time zone
 * (meetups store absolute instants, not a per-meetup time zone).
 */
export function formatMeetupWhen(
  q: { starts_at?: string | null; expires_at?: string | null },
  now: Date = new Date(),
  locale?: string,
): string | null {
  if (!q.starts_at) return null
  const start = new Date(q.starts_at)
  if (Number.isNaN(start.getTime())) return null
  const endMs = meetupEndMs(q)
  const end = endMs === null ? null : new Date(endMs)
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })

  if (end && start.getTime() <= now.getTime() && end.getTime() > now.getTime()) {
    return `Happening now · until ${time(end)}`
  }

  const dayDiff = Math.round((startOfDay(start) - startOfDay(now)) / DAY_MS)
  let day: string
  if (dayDiff === 0) day = 'Today'
  else if (dayDiff === 1) day = 'Tomorrow'
  else
    day = start.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })

  const sameDay = end && startOfDay(end) === startOfDay(start)
  const range = end ? `${time(start)} – ${sameDay ? time(end) : `${end.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} ${time(end)}`}` : time(start)
  return `${day} · ${range}`
}

/** Short chips for the card: size, fenced, leash, parking. */
export function dogInfoChips(q: {
  dog_size?: DogSize | null
  dog_fenced?: boolean | null
  dog_leash_info?: string | null
  dog_parking_info?: string | null
}): string[] {
  const chips: string[] = []
  const size = dogSizeLabel(q.dog_size)
  if (size) chips.push(size)
  if (q.dog_fenced === true) chips.push('Fenced')
  else if (q.dog_fenced === false) chips.push('Not fenced')
  if (q.dog_leash_info?.trim()) chips.push(`Leash: ${q.dog_leash_info.trim()}`)
  if (q.dog_parking_info?.trim()) chips.push(`Parking: ${q.dog_parking_info.trim()}`)
  return chips
}

export type MeetupStatusKey = 'draft' | 'pending_review' | 'published' | 'archived'

/** Honest status wording: never "approved"/"verified" unless it was reviewed. */
export function meetupStatusLabel(status: string, ended = false): string {
  switch (status) {
    case 'pending_review':
      return 'Waiting for review'
    case 'published':
      return ended ? 'Ended' : 'Approved'
    case 'archived':
      return 'Not approved'
    case 'draft':
      return 'Draft'
    default:
      return status
  }
}

/** ISO strings for the DB, from the resolved local date/time. */
export function toIsoRange(times: ResolvedMeetupTimes): { starts_at: string; expires_at: string } {
  return { starts_at: times.startsAt.toISOString(), expires_at: times.expiresAt.toISOString() }
}
