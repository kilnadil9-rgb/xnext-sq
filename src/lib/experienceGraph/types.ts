/**
 * Experience Graph — core interfaces (RC5, Priority 3/4).
 *
 * Architecture-only: these types define how XNEXT represents Evidence,
 * Observations, Confidence, and Freshness so later phases (summaries,
 * agent APIs, AI ranking) build on a stable vocabulary. Nothing here touches
 * the current UX; everything is pure and unit-tested.
 *
 * Model:  Place → Experience → Visit → Evidence → Outcome
 *   - a CLAIM is what a creator says about an experience
 *   - EVIDENCE is what verified explorer activity says happened
 *   - CONFIDENCE is the decayed, trust-weighted agreement between them
 */

/** What kind of proof a piece of evidence is. Order ≈ increasing strength. */
export type EvidenceKind =
  | 'view' // impression only — weakest
  | 'save' // added to Dream List
  | 'explorer_note' // 9-word observation (026)
  | 'quick_tags' // structured one-tap tags (026)
  | 'completion' // recorded completion (021/022)
  | 'gps_completion' // completion with a location fix at the site (future)
  | 'repeat_visit' // same explorer returned (future)
  | 'photo' // media attached to a completion (future)

/** Relative strength of each evidence kind (pure heuristic, unit-tested). */
export const EVIDENCE_WEIGHT: Record<EvidenceKind, number> = {
  view: 0.05,
  save: 0.15,
  explorer_note: 0.5,
  quick_tags: 0.4,
  completion: 1,
  gps_completion: 1.6,
  repeat_visit: 1.4,
  photo: 0.8,
}

/** One piece of evidence about one experience. */
export interface Evidence {
  kind: EvidenceKind
  /** ISO timestamp of when the underlying activity happened. */
  observedAt: string
  /** The observing explorer's trust score (profiles.trust_score); 0 if unknown. */
  sourceTrust: number
  /** Distinct source id (user) — used to discount same-source repetition. */
  sourceId?: string
}

/** A structured observation extracted from notes/tags (Outcome layer). */
export interface Observation {
  questId: string
  /** e.g. 'parking', 'difficulty', 'dog_friendly', 'crowds', 'worth_returning' */
  attribute: string
  /** e.g. 'limited', 'easy', true, 'absolutely' */
  value: string | boolean
  observedAt: string
  sourceTrust: number
}

/** Freshness category — how fast this experience's truth decays. */
export type DecayCategory =
  | 'ephemeral' // yard sales, one-day events
  | 'short' // multi-day events, promos
  | 'seasonal' // seasonal experiences
  | 'stable' // trails, landmarks, evergreen quests

/** Evidence half-life in days, per decay category. */
export const HALF_LIFE_DAYS: Record<DecayCategory, number> = {
  ephemeral: 1,
  short: 7,
  seasonal: 60,
  stable: 240,
}

export interface ConfidenceBreakdown {
  /** 0..1 — the headline verification confidence. */
  confidence: number
  /** Decayed, trust-weighted evidence mass that produced it. */
  evidenceMass: number
  /** Number of distinct sources contributing. */
  distinctSources: number
  /** ISO timestamp of the newest contributing evidence, or null. */
  lastEvidenceAt: string | null
}
