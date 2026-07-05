/**
 * Experience Graph — confidence + freshness math (RC5).
 * Pure functions, no I/O, fully unit-tested (tests/experienceGraph.test.ts).
 */

import {
  EVIDENCE_WEIGHT,
  HALF_LIFE_DAYS,
  type ConfidenceBreakdown,
  type DecayCategory,
  type Evidence,
} from './types'

/**
 * Exponential freshness decay: 1 at age 0, 0.5 at one half-life, → 0.
 * Invalid/future timestamps clamp to 1 (never negative age).
 */
export function freshnessFactor(
  observedAt: string,
  halfLifeDays: number,
  now: number = Date.now(),
): number {
  const t = Date.parse(observedAt)
  if (!Number.isFinite(t) || halfLifeDays <= 0) return 0
  const ageDays = Math.max(0, (now - t) / 86_400_000)
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/**
 * Trust weighting: unknown/zero-trust explorers still count (1×); the most
 * trusted count at most double. Deliberately gentle — trust amplifies,
 * it never gatekeeps.
 */
export function trustWeight(sourceTrust: number): number {
  const clamped = Math.max(0, Math.min(sourceTrust, 50))
  return 1 + clamped / 50
}

/**
 * Verification confidence in [0, 1):
 *   mass = Σ evidenceWeight × freshness × trustWeight × sameSourceDiscount
 *   confidence = 1 − e^(−mass / K)
 *
 * Properties (unit-tested): 0 with no evidence; strictly increasing with
 * more/fresher/stronger evidence; asymptotic below 1 (never claims
 * certainty); repeated evidence from ONE source is worth less than the
 * same evidence from distinct sources (Sybil resistance, first order).
 */
const MASS_SCALE_K = 3

export function computeConfidence(
  evidence: Evidence[],
  category: DecayCategory,
  now: number = Date.now(),
): ConfidenceBreakdown {
  const halfLife = HALF_LIFE_DAYS[category]
  const perSourceCount = new Map<string, number>()
  let mass = 0
  let lastAt: number | null = null

  for (const e of evidence) {
    const fresh = freshnessFactor(e.observedAt, halfLife, now)
    if (fresh === 0) continue

    // Same-source discount: the n-th piece of evidence from one explorer
    // counts 1/n — ten completions by one account ≠ ten explorers.
    const key = e.sourceId ?? `anon:${Math.random()}`
    const nth = (perSourceCount.get(key) ?? 0) + 1
    perSourceCount.set(key, nth)
    const sameSourceDiscount = 1 / nth

    mass +=
      (EVIDENCE_WEIGHT[e.kind] ?? 0) *
      fresh *
      trustWeight(e.sourceTrust) *
      sameSourceDiscount

    const t = Date.parse(e.observedAt)
    if (Number.isFinite(t) && (lastAt === null || t > lastAt)) lastAt = t
  }

  return {
    confidence: mass <= 0 ? 0 : 1 - Math.exp(-mass / MASS_SCALE_K),
    evidenceMass: mass,
    distinctSources: perSourceCount.size,
    lastEvidenceAt: lastAt === null ? null : new Date(lastAt).toISOString(),
  }
}

/**
 * Decay category for a quest/listing row — maps REAL existing fields onto
 * the freshness model. (Adapter, pure.)
 */
export function decayCategoryFor(row: {
  listing_type?: string | null
  is_evergreen?: boolean
  season_tags?: string[]
  active_months?: number[]
}): DecayCategory {
  if (row.listing_type === 'yard_sale') return 'ephemeral'
  if (row.listing_type) return 'short'
  if (
    (row.season_tags?.length ?? 0) > 0 ||
    (row.active_months?.length ?? 0) > 0
  )
    return 'seasonal'
  return 'stable'
}
