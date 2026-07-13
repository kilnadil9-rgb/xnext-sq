/**
 * Explorer Markers — pure domain logic (no I/O, unit-testable).
 *
 * Scarce digital markers earned through verified real-world completions and
 * placed permanently at experiences. Symbolic explorer evidence — never a
 * currency: no buy/sell/trade/wallet language anywhere in this system.
 *
 * Thresholds and awards are CONFIGURABLE PRODUCT VALUES. The database table
 * `explorer_marker_milestones` (migration 027) is the runtime source of
 * truth; `DEFAULT_MILESTONES` below mirrors the seed so pure helpers and
 * tests work offline. Never hardcode thresholds in components.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExplorerMarkerTier =
  | 'trail'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'diamond'
  | 'legacy'

export type MarkerStatus = 'active' | 'retired' | 'removed_by_moderation'

export type JourneyVisibility = 'public' | 'community' | 'private'

export interface MarkerMilestone {
  milestone_key: string
  tier: ExplorerMarkerTier
  quantity: number
  required_completions: number
  level_name: string
  sort_order: number
}

export interface MarkerAwardLike {
  tier: ExplorerMarkerTier | string
  quantity: number
}

export interface PlacedMarkerLike {
  tier: ExplorerMarkerTier | string
  status: MarkerStatus | string
  /** false only when a grace-window cancellation returned it to inventory */
  consumed: boolean
}

// ─── Configuration (mirrors migration 027 seed) ──────────────────────────────

export const DEFAULT_MILESTONES: MarkerMilestone[] = [
  { milestone_key: 'first_completion', tier: 'trail',   quantity: 3, required_completions: 1,   level_name: 'Trail Explorer',   sort_order: 1 },
  { milestone_key: 'completions_10',   tier: 'bronze',  quantity: 2, required_completions: 10,  level_name: 'Bronze Explorer',  sort_order: 2 },
  { milestone_key: 'completions_50',   tier: 'silver',  quantity: 2, required_completions: 50,  level_name: 'Silver Explorer',  sort_order: 3 },
  { milestone_key: 'completions_100',  tier: 'gold',    quantity: 2, required_completions: 100, level_name: 'Gold Explorer',    sort_order: 4 },
  { milestone_key: 'completions_250',  tier: 'diamond', quantity: 1, required_completions: 250, level_name: 'Diamond Explorer', sort_order: 5 },
  { milestone_key: 'completions_500',  tier: 'legacy',  quantity: 1, required_completions: 500, level_name: 'Legacy Explorer',  sort_order: 6 },
]

export const MARKER_TIER_ORDER: ExplorerMarkerTier[] = [
  'legacy', 'diamond', 'gold', 'silver', 'bronze', 'trail',
]

/** Symbolic meaning shown alongside icons (text labels, not emoji-final). */
export const MARKER_TIER_MEANING: Record<ExplorerMarkerTier, string> = {
  trail: 'I was here.',
  bronze: 'This place is worth discovering.',
  silver: 'This is one of my favorites.',
  gold: 'This experience stayed with me.',
  diamond: 'This journey is worth making.',
  legacy: 'This is where I leave my legacy.',
}

export const MARKER_TIER_LABEL: Record<ExplorerMarkerTier, string> = {
  trail: 'Trail',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
  legacy: 'Legacy',
}

/** Tier accent colors — always paired with a text label (a11y: never color-only). */
export const MARKER_TIER_COLOR: Record<ExplorerMarkerTier, string> = {
  trail: '#94a3b8',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#fbbf24',
  diamond: '#7dd3fc',
  legacy: '#f97316',
}

export const MARKER_NOTE_MAX_CHARS = 120

/** Grace window (hours) during which a placement can be cancelled. */
export const MARKER_GRACE_HOURS = 24

// ─── Progression ─────────────────────────────────────────────────────────────

/**
 * Current explorer level from verified completions. Returns null below the
 * first milestone (no invented "Level 0" — evidence only).
 */
export function progressionLevelFor(
  verifiedCompletions: number,
  milestones: MarkerMilestone[] = DEFAULT_MILESTONES,
): MarkerMilestone | null {
  if (!Number.isFinite(verifiedCompletions) || verifiedCompletions < 1) return null
  const qualified = milestones
    .filter((m) => m.required_completions <= verifiedCompletions)
    .sort((a, b) => b.required_completions - a.required_completions)
  return qualified[0] ?? null
}

/** The next milestone ahead of the explorer, or null at the top. */
export function nextMilestoneFor(
  verifiedCompletions: number,
  milestones: MarkerMilestone[] = DEFAULT_MILESTONES,
): MarkerMilestone | null {
  const n = Number.isFinite(verifiedCompletions) ? Math.max(verifiedCompletions, 0) : 0
  const ahead = milestones
    .filter((m) => m.required_completions > n)
    .sort((a, b) => a.required_completions - b.required_completions)
  return ahead[0] ?? null
}

/** "Complete 37 more verified experiences to unlock Silver." (null when unlocked) */
export function unlockHintFor(
  tier: ExplorerMarkerTier,
  verifiedCompletions: number,
  milestones: MarkerMilestone[] = DEFAULT_MILESTONES,
): string | null {
  const milestone = milestones.find((m) => m.tier === tier)
  if (!milestone) return null
  const remaining = milestone.required_completions - Math.max(verifiedCompletions, 0)
  if (remaining <= 0) return null
  return `Complete ${remaining} more verified ${remaining === 1 ? 'experience' : 'experiences'} to unlock ${MARKER_TIER_LABEL[tier]}.`
}

// ─── Inventory (ledger-derived; never a client-mutable balance) ──────────────

export interface TierInventory {
  tier: ExplorerMarkerTier
  awarded: number
  available: number
}

/**
 * Available = total awarded − active placements − permanently consumed
 * markers (retired-after-grace or removed by moderation with consumed=true).
 * Grace-window cancellations (consumed=false) return to inventory.
 * Mirrors get_my_marker_inventory() in migration 027.
 */
export function computeInventory(
  awards: MarkerAwardLike[],
  placed: PlacedMarkerLike[],
): TierInventory[] {
  return MARKER_TIER_ORDER.map((tier) => {
    const awarded = awards
      .filter((a) => a.tier === tier)
      .reduce((sum, a) => sum + Math.max(a.quantity, 0), 0)
    const used = placed.filter(
      (m) => m.tier === tier && (m.status === 'active' || m.consumed),
    ).length
    return { tier, awarded, available: Math.max(awarded - used, 0) }
  })
}

// ─── Note validation (shared with the DB CHECK + placement function) ─────────

/** Reject URLs in marker notes (plain text, 120 chars, evidence not spam). */
export function validateMarkerNote(note: string): string | null {
  const trimmed = note.trim()
  if (trimmed.length === 0) return null // empty note is fine (optional)
  if (trimmed.length > MARKER_NOTE_MAX_CHARS) {
    return `Keep your note under ${MARKER_NOTE_MAX_CHARS} characters.`
  }
  if (/(https?:\/\/|www\.)/i.test(trimmed)) {
    return 'Marker notes cannot contain links.'
  }
  return null
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export interface MarkerTierCount {
  tier: ExplorerMarkerTier
  count: number
}

/**
 * Compact experience summary ("1 Diamond · 2 Gold · 6 Silver"), sorted
 * Legacy → Trail. Zero-count tiers are omitted (no fake data).
 */
export function summarizeMarkerTiers(
  markers: { tier: ExplorerMarkerTier | string }[],
): MarkerTierCount[] {
  return MARKER_TIER_ORDER.map((tier) => ({
    tier,
    count: markers.filter((m) => m.tier === tier).length,
  })).filter((entry) => entry.count > 0)
}

/** Sort markers Legacy→Trail, then most recently placed first within a tier. */
export function sortMarkersForDisplay<
  T extends { tier: ExplorerMarkerTier | string; placed_at: string },
>(markers: T[]): T[] {
  const rank = (tier: string) => {
    const i = MARKER_TIER_ORDER.indexOf(tier as ExplorerMarkerTier)
    return i === -1 ? MARKER_TIER_ORDER.length : i
  }
  return [...markers].sort((a, b) => {
    const byTier = rank(a.tier) - rank(b.tier)
    if (byTier !== 0) return byTier
    return Date.parse(b.placed_at) - Date.parse(a.placed_at)
  })
}

/** Whether a placed marker is still inside its cancellation grace window. */
export function isWithinGraceWindow(
  lockedAt: string,
  now: number = Date.now(),
): boolean {
  const t = Date.parse(lockedAt)
  return Number.isFinite(t) && now < t
}
