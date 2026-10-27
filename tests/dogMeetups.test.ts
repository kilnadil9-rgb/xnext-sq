/**
 * Dog Meetups — pure-logic tests: form validation, default expiry, lead window,
 * client-side active filtering (24h cache), formatting, photo sizing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOG_MEETUP_BADGE,
  MEETUP_LEAD_WINDOW_DAYS,
  dogInfoChips,
  filterActiveNearby,
  fitWithin,
  formatMeetupWhen,
  hasErrors,
  isDogMeetup,
  isHeicLike,
  isMeetupExpired,
  isWithinLeadWindow,
  meetupEndMs,
  meetupStatusLabel,
  parseLocalDateTime,
  resolveMeetupTimes,
  validateMeetupForm,
  type MeetupFormInput,
} from '../src/lib/dogMeetups'
import type { NearbyQuest } from '../src/lib/supabase/types'

const NOW = new Date(2026, 9, 27, 12, 0, 0) // Oct 27, 2026 12:00 local
const H = 3_600_000
const D = 86_400_000

function form(over: Partial<MeetupFormInput> = {}): MeetupFormInput {
  return {
    title: 'Sunday sniff walk',
    description: 'Relaxed playdate',
    locationName: 'Gas Works Dog Park',
    hasLocation: true,
    date: '2026-10-28',
    startTime: '10:00',
    endTime: '',
    dogSize: 'all',
    leashInfo: '',
    parkingInfo: '',
    acknowledged: true,
    ...over,
  }
}

// ── validation ───────────────────────────────────────────────────────────────
test('valid form has no errors; end time is optional', () => {
  assert.equal(hasErrors(validateMeetupForm(form(), NOW)), false)
  assert.equal(hasErrors(validateMeetupForm(form({ endTime: '11:30' }), NOW)), false)
})

test('start in the past is rejected; just now (within grace) is allowed', () => {
  const past = validateMeetupForm(form({ date: '2026-10-27', startTime: '09:00' }), NOW)
  assert.match(past.startTime ?? '', /past/)
  const justNow = validateMeetupForm(form({ date: '2026-10-27', startTime: '11:57' }), NOW)
  assert.equal(justNow.startTime, undefined)
  const earlier = validateMeetupForm(form({ date: '2026-10-26', startTime: '23:00' }), NOW)
  assert.match(earlier.startTime ?? '', /past/)
})

test('end must be after start (equal and earlier are rejected)', () => {
  assert.match(validateMeetupForm(form({ endTime: '10:00' }), NOW).endTime ?? '', /after the start/)
  assert.match(validateMeetupForm(form({ endTime: '09:00' }), NOW).endTime ?? '', /after the start/)
  assert.equal(validateMeetupForm(form({ endTime: '10:01' }), NOW).endTime, undefined)
})

test('duration over 24h cannot happen on one day; far-future start is rejected', () => {
  assert.match(validateMeetupForm(form({ date: '2027-03-01' }), NOW).date ?? '', /90 days/)
})

test('required fields are enforced', () => {
  const e = validateMeetupForm(
    form({ title: 'ab', description: '  ', locationName: '', hasLocation: false, dogSize: '', acknowledged: false, date: '', startTime: '' }),
    NOW,
  )
  for (const k of ['title', 'description', 'locationName', 'location', 'dogSize', 'acknowledged', 'date', 'startTime'] as const) {
    assert.ok(e[k], `expected an error for ${k}`)
  }
})

test('length limits (description 500, info 160, title 80)', () => {
  const e = validateMeetupForm(
    form({ description: 'x'.repeat(501), leashInfo: 'x'.repeat(161), parkingInfo: 'x'.repeat(161), title: 'x'.repeat(81) }),
    NOW,
  )
  assert.ok(e.description && e.leashInfo && e.parkingInfo && e.title)
})

test('parseLocalDateTime rejects overflow dates and bad times', () => {
  assert.equal(parseLocalDateTime('2026-02-31', '10:00'), null)
  assert.equal(parseLocalDateTime('2026-10-27', '25:00'), null)
  assert.equal(parseLocalDateTime('nope', '10:00'), null)
  assert.ok(parseLocalDateTime('2026-10-27', '10:00'))
})

// ── default expiry ───────────────────────────────────────────────────────────
test('no end time → ends 2 hours after start (documented default)', () => {
  const r = resolveMeetupTimes('2026-10-28', '10:00', '')!
  assert.equal(r.usedDefaultEnd, true)
  assert.equal(r.expiresAt.getTime() - r.startsAt.getTime(), 2 * H)
  const explicit = resolveMeetupTimes('2026-10-28', '10:00', '10:45')!
  assert.equal(explicit.usedDefaultEnd, false)
  assert.equal(explicit.expiresAt.getTime() - explicit.startsAt.getTime(), 45 * 60_000)
})

test('meetupEndMs: expires_at wins, else start + 2h, else null', () => {
  const start = new Date(NOW.getTime() + D).toISOString()
  const end = new Date(NOW.getTime() + D + 3 * H).toISOString()
  assert.equal(meetupEndMs({ starts_at: start, expires_at: end }), Date.parse(end))
  assert.equal(meetupEndMs({ starts_at: start }), Date.parse(start) + 2 * H)
  assert.equal(meetupEndMs({}), null)
})

// ── expiry + lead window ─────────────────────────────────────────────────────
test('isMeetupExpired: hidden at/after end, visible during', () => {
  const start = new Date(NOW.getTime() - H).toISOString()
  const endFuture = new Date(NOW.getTime() + H).toISOString()
  const endPast = new Date(NOW.getTime() - 1).toISOString()
  assert.equal(isMeetupExpired({ starts_at: start, expires_at: endFuture }, NOW.getTime()), false)
  assert.equal(isMeetupExpired({ starts_at: start, expires_at: endPast }, NOW.getTime()), true)
  assert.equal(isMeetupExpired({ starts_at: start, expires_at: new Date(NOW.getTime()).toISOString() }, NOW.getTime()), true)
  // no end time stored → start + 2h
  assert.equal(isMeetupExpired({ starts_at: new Date(NOW.getTime() - 3 * H).toISOString() }, NOW.getTime()), true)
  assert.equal(isMeetupExpired({ starts_at: new Date(NOW.getTime() - H).toISOString() }, NOW.getTime()), false)
})

test(`lead window is ${MEETUP_LEAD_WINDOW_DAYS} days`, () => {
  assert.equal(MEETUP_LEAD_WINDOW_DAYS, 14)
  const at = (days: number) => ({ starts_at: new Date(NOW.getTime() + days * D).toISOString() })
  assert.equal(isWithinLeadWindow(at(13), NOW.getTime()), true)
  assert.equal(isWithinLeadWindow(at(14), NOW.getTime()), true)
  assert.equal(isWithinLeadWindow(at(15), NOW.getTime()), false)
  assert.equal(isWithinLeadWindow(at(-1), NOW.getTime()), true)
  assert.equal(isWithinLeadWindow({}, NOW.getTime()), false)
})

// ── filters (24h localStorage cache) ─────────────────────────────────────────
function nq(over: Partial<NearbyQuest>): NearbyQuest {
  return {
    id: Math.random().toString(36).slice(2), title: 't', slug: 't', description: null,
    experience_class: 'connection', status: 'published', location_name: null, city: null,
    country_code: null, sq_score: null, published_at: null, distance_km: 1, lat: 0, lng: 0,
    ...over,
  } as NearbyQuest
}

test('filterActiveNearby drops ended / too-far meetups, keeps everything else untouched', () => {
  const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
  const running = nq({ id: 'running', listing_type: 'dog_meetup', starts_at: iso(-H), expires_at: iso(H) })
  const soon = nq({ id: 'soon', listing_type: 'dog_meetup', starts_at: iso(2 * D), expires_at: iso(2 * D + 2 * H) })
  const ended = nq({ id: 'ended', listing_type: 'dog_meetup', starts_at: iso(-4 * H), expires_at: iso(-2 * H) })
  const far = nq({ id: 'far', listing_type: 'dog_meetup', starts_at: iso(20 * D), expires_at: iso(20 * D + 2 * H) })
  const other = nq({ id: 'other', listing_type: 'yard_sale', starts_at: iso(-5 * D), expires_at: iso(-4 * D) })
  const plain = nq({ id: 'plain' })
  const out = filterActiveNearby([running, soon, ended, far, other, plain], NOW.getTime()).map((q) => q.id)
  assert.deepEqual(out, ['running', 'soon', 'other', 'plain'])
})

test('isDogMeetup', () => {
  assert.equal(isDogMeetup({ listing_type: 'dog_meetup' }), true)
  assert.equal(isDogMeetup({ listing_type: 'yard_sale' }), false)
  assert.equal(isDogMeetup({}), false)
})

// ── display ──────────────────────────────────────────────────────────────────
test('formatMeetupWhen: today / tomorrow / later / now', () => {
  const at = (d: Date) => d.toISOString()
  const today = formatMeetupWhen({ starts_at: at(new Date(2026, 9, 27, 15, 30)), expires_at: at(new Date(2026, 9, 27, 17, 0)) }, NOW, 'en-US')!
  assert.match(today, /^Today · 3:30 PM – 5:00 PM$/)
  const tomorrow = formatMeetupWhen({ starts_at: at(new Date(2026, 9, 28, 9, 0)) }, NOW, 'en-US')!
  assert.match(tomorrow, /^Tomorrow · 9:00 AM – 11:00 AM$/)
  const later = formatMeetupWhen({ starts_at: at(new Date(2026, 10, 7, 9, 0)), expires_at: at(new Date(2026, 10, 7, 10, 0)) }, NOW, 'en-US')!
  assert.match(later, /^Sat, Nov 7 · 9:00 AM – 10:00 AM$/)
  const now = formatMeetupWhen({ starts_at: at(new Date(2026, 9, 27, 11, 0)), expires_at: at(new Date(2026, 9, 27, 13, 0)) }, NOW, 'en-US')!
  assert.match(now, /^Happening now · until 1:00 PM$/)
  assert.equal(formatMeetupWhen({}, NOW), null)
})

test('dogInfoChips and badge never claim verified/featured', () => {
  assert.deepEqual(
    dogInfoChips({ dog_size: 'small', dog_fenced: true, dog_leash_info: ' on leash ', dog_parking_info: null }),
    ['Small dogs', 'Fenced', 'Leash: on leash'],
  )
  assert.deepEqual(dogInfoChips({ dog_fenced: false }), ['Not fenced'])
  assert.deepEqual(DOG_MEETUP_BADGE, { label: 'Dog Meetup', kind: 'dog' })
  assert.doesNotMatch(JSON.stringify(DOG_MEETUP_BADGE), /verified|featured|partner/i)
})

test('status labels are honest', () => {
  assert.equal(meetupStatusLabel('pending_review'), 'Waiting for review')
  assert.equal(meetupStatusLabel('published'), 'Approved')
  assert.equal(meetupStatusLabel('published', true), 'Ended')
  assert.equal(meetupStatusLabel('archived'), 'Not approved')
})

// ── photo math ───────────────────────────────────────────────────────────────
test('fitWithin scales the longest edge, preserves aspect, never upscales', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1280, height: 960 })
  assert.deepEqual(fitWithin(3000, 4000), { width: 960, height: 1280 })
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(0, 10), { width: 0, height: 0 })
  assert.deepEqual(fitWithin(10000, 1), { width: 1280, height: 1 })
})

test('isHeicLike detects HEIC/HEIF by type or extension', () => {
  assert.equal(isHeicLike({ type: 'image/heic', name: 'a' }), true)
  assert.equal(isHeicLike({ type: '', name: 'IMG_1.HEIC' }), true)
  assert.equal(isHeicLike({ type: 'image/jpeg', name: 'a.jpg' }), false)
})
