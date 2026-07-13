/**
 * Journey Pulse — pure calculation + configuration (no I/O, unit-testable).
 *
 * A PRIVATE, personal indicator of recent real-world exploration momentum.
 * It is not happiness, worth, a ranking, a wellness score, or a streak.
 * "Journey Pulse measures participation in life through XNEXT, not
 * engagement with XNEXT itself."
 *
 * All weights, decay multipliers, caps, and state thresholds are CONFIGURABLE
 * PRODUCT VALUES collected here — never duplicated in components. The
 * calculation consumes activity derived from trusted, RLS-protected records
 * with server timestamps (completions, dream list, notes, markers); it never
 * counts app opens, scrolls, or any passive screen engagement.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type JourneyPulseState =
  | 'quiet'
  | 'awakening'
  | 'steady'
  | 'rising'
  | 'thriving'

export type JourneyPulseTrend = 'rising' | 'steady' | 'cooling'

export type JourneyPulseActivityType =
  | 'verified_completion'
  | 'first_category_completion'
  | 'dream_list_completion'
  | 'marker_placed'
  | 'marker_discovered'
  | 'explorer_note'
  | 'photo_contribution'
  | 'verification_contribution'
  | 'seasonal_completion'

export interface JourneyPulseActivity {
  id: string
  type: JourneyPulseActivityType
  /** Server timestamp (ISO) of the underlying record — never client time. */
  occurredAt: string
  experienceId?: string
  markerId?: string
}

export interface JourneyPulseResult {
  value: number
  state: JourneyPulseState
  trend: JourneyPulseTrend
  explanation: string
  contributingActivityCount: number
  previousPeriodValue?: number
}

// ─── Configuration (initial defaults — tune as product values) ───────────────

export const JOURNEY_PULSE_WEIGHTS: Record<JourneyPulseActivityType, number> = {
  verified_completion: 20,
  first_category_completion: 5, // bonus alongside the completion
  dream_list_completion: 5, // bonus alongside the completion
  marker_placed: 6,
  marker_discovered: 3,
  explorer_note: 3,
  photo_contribution: 2,
  verification_contribution: 2,
  seasonal_completion: 3, // bonus alongside the completion
}

/** Rolling-window decay: recent exploration matters most; >90 days is memory, not momentum. */
export const JOURNEY_PULSE_DECAY = {
  days0to14: 1.0,
  days15to30: 0.65,
  days31to60: 0.3,
  days61to90: 0.1,
  over90Days: 0,
} as const

/** Anti-gaming caps (per experience / per day). */
export const JOURNEY_PULSE_CAPS = {
  photosPerExperience: 1,
  notesPerExperience: 1,
  markerDiscoveriesPerDay: 5,
  verificationContributionsPerDay: 5,
} as const

/** Inclusive value bands per state. */
export const JOURNEY_PULSE_STATES: Record<JourneyPulseState, [number, number]> = {
  quiet: [0, 19],
  awakening: [20, 39],
  steady: [40, 59],
  rising: [60, 79],
  thriving: [80, 100],
}

/** Raw weighted score that maps to a value of 100 (≈5 fresh completions). */
export const JOURNEY_PULSE_NORMALIZATION_MAX_RAW = 100

/** Trend sensitivity: differences below this (0–100 scale) read as steady. */
export const JOURNEY_PULSE_TREND_THRESHOLD = 8

export const JOURNEY_PULSE_WINDOW_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

// ─── State + copy ─────────────────────────────────────────────────────────────

/** Gentle, non-punitive language. Never guilt, urgency, or comparison. */
export const JOURNEY_PULSE_STATE_COPY: Record<JourneyPulseState, string> = {
  quiet: 'Your journey has been quiet lately.',
  awakening: 'Your journey is moving again.',
  steady: 'You are exploring consistently.',
  rising: 'Your exploration momentum is growing.',
  thriving: 'You are building an active journey.',
}

export const JOURNEY_PULSE_COOLING_COPY = 'Your journey has been quieter recently.'

export function pulseStateFor(value: number): JourneyPulseState {
  const v = clamp(value)
  for (const [state, [lo, hi]] of Object.entries(JOURNEY_PULSE_STATES) as [
    JourneyPulseState,
    [number, number],
  ][]) {
    if (v >= lo && v <= hi) return state
  }
  return 'quiet'
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function decayMultiplierFor(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0
  if (ageDays <= 14) return JOURNEY_PULSE_DECAY.days0to14
  if (ageDays <= 30) return JOURNEY_PULSE_DECAY.days15to30
  if (ageDays <= 60) return JOURNEY_PULSE_DECAY.days31to60
  if (ageDays <= 90) return JOURNEY_PULSE_DECAY.days61to90
  return JOURNEY_PULSE_DECAY.over90Days
}

// ─── Caps ─────────────────────────────────────────────────────────────────────

/**
 * Apply anti-gaming caps. Duplicate-prone contribution types are limited per
 * experience or per (server) day; discoveries/placements count once per
 * marker; everything else passes through. Order-stable.
 */
export function applyPulseCaps(
  activity: JourneyPulseActivity[],
): JourneyPulseActivity[] {
  const photoPerExperience = new Map<string, number>()
  const notePerExperience = new Map<string, number>()
  const discoveriesPerDay = new Map<string, number>()
  const verificationsPerDay = new Map<string, number>()
  const seenMarkers = new Set<string>()
  const seenIds = new Set<string>()

  const out: JourneyPulseActivity[] = []
  for (const item of activity) {
    if (seenIds.has(item.id)) continue // exact duplicates never double-count
    seenIds.add(item.id)

    const day = item.occurredAt.slice(0, 10)
    switch (item.type) {
      case 'photo_contribution': {
        const key = item.experienceId ?? item.id
        const n = photoPerExperience.get(key) ?? 0
        if (n >= JOURNEY_PULSE_CAPS.photosPerExperience) continue
        photoPerExperience.set(key, n + 1)
        break
      }
      case 'explorer_note': {
        const key = item.experienceId ?? item.id
        const n = notePerExperience.get(key) ?? 0
        if (n >= JOURNEY_PULSE_CAPS.notesPerExperience) continue
        notePerExperience.set(key, n + 1)
        break
      }
      case 'marker_discovered': {
        if (item.markerId) {
          if (seenMarkers.has(`d:${item.markerId}`)) continue
          seenMarkers.add(`d:${item.markerId}`)
        }
        const n = discoveriesPerDay.get(day) ?? 0
        if (n >= JOURNEY_PULSE_CAPS.markerDiscoveriesPerDay) continue
        discoveriesPerDay.set(day, n + 1)
        break
      }
      case 'marker_placed': {
        if (item.markerId) {
          if (seenMarkers.has(`p:${item.markerId}`)) continue
          seenMarkers.add(`p:${item.markerId}`)
        }
        break
      }
      case 'verification_contribution': {
        const n = verificationsPerDay.get(day) ?? 0
        if (n >= JOURNEY_PULSE_CAPS.verificationContributionsPerDay) continue
        verificationsPerDay.set(day, n + 1)
        break
      }
      default:
        break
    }
    out.push(item)
  }
  return out
}

// ─── Calculation ──────────────────────────────────────────────────────────────

function rawScore(
  activity: JourneyPulseActivity[],
  now: number,
  windowStartDays: number,
  windowEndDays: number,
  applyDecay: boolean,
): { score: number; count: number } {
  let score = 0
  let count = 0
  for (const item of activity) {
    const t = Date.parse(item.occurredAt)
    if (!Number.isFinite(t) || t > now) continue
    const ageDays = (now - t) / DAY_MS
    if (ageDays < windowStartDays || ageDays >= windowEndDays) continue
    const weight = JOURNEY_PULSE_WEIGHTS[item.type] ?? 0
    const multiplier = applyDecay ? decayMultiplierFor(ageDays) : 1
    if (weight * multiplier <= 0) continue
    score += weight * multiplier
    count += 1
  }
  return { score, count }
}

function normalize(raw: number): number {
  return clamp((raw / JOURNEY_PULSE_NORMALIZATION_MAX_RAW) * 100)
}

/**
 * Calculate Journey Pulse from qualifying activity (already derived from
 * trusted records — deleted/invalidated/moderated activity must not be in
 * the input). Client-submitted values are never an input to this function.
 */
export function calculateJourneyPulse(
  activity: JourneyPulseActivity[],
  now: number = Date.now(),
): JourneyPulseResult {
  const capped = applyPulseCaps(activity)

  // Current momentum: full 90-day decayed window.
  const current = rawScore(capped, now, 0, JOURNEY_PULSE_WINDOW_DAYS, true)
  const value = normalize(current.score)
  const state = pulseStateFor(value)

  // Trend: current 30 days vs the previous 30 days (undecayed, like-for-like).
  const period = rawScore(capped, now, 0, 30, false)
  const prevPeriod = rawScore(capped, now, 30, 60, false)
  const periodValue = normalize(period.score)
  const previousPeriodValue = normalize(prevPeriod.score)

  let trend: JourneyPulseTrend = 'steady'
  if (periodValue - previousPeriodValue > JOURNEY_PULSE_TREND_THRESHOLD) {
    trend = 'rising'
  } else if (previousPeriodValue - periodValue > JOURNEY_PULSE_TREND_THRESHOLD) {
    trend = 'cooling'
  }

  const explanation =
    trend === 'cooling' && state !== 'thriving'
      ? JOURNEY_PULSE_COOLING_COPY
      : JOURNEY_PULSE_STATE_COPY[state]

  return {
    value,
    state,
    trend,
    explanation,
    contributingActivityCount: current.count,
    previousPeriodValue,
  }
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export const JOURNEY_PULSE_STATE_LABEL: Record<JourneyPulseState, string> = {
  quiet: 'Quiet',
  awakening: 'Awakening',
  steady: 'Steady',
  rising: 'Rising',
  thriving: 'Thriving',
}

/** Screen-reader description of value, state, and trend. */
export function pulseAriaLabel(result: JourneyPulseResult): string {
  const trendText =
    result.trend === 'rising'
      ? 'trending up'
      : result.trend === 'cooling'
        ? 'quieter than the previous month'
        : 'steady'
  return `Journey Pulse ${result.value} out of 100, ${JOURNEY_PULSE_STATE_LABEL[result.state]}, ${trendText}. Private to you.`
}
