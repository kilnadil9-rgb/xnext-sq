/**
 * Discovery Communities — The Chase (Community Evolution).
 *
 * Pure domain logic (no I/O, unit-testable):
 *  - the community catalog (interest worlds, not friend graphs)
 *  - the Community Intelligence Engine: behavior → community affinity.
 *    No onboarding, no profile editing — what you COMPLETE decides where
 *    you belong.
 *  - marker contribution types (Explorer Marker System 2.0)
 *  - rarity presentation derived from the existing tier ledger (027)
 *  - chase-feed helpers (teaser distances, reputation ordering)
 *
 * Design constraints (enforced by NOT building them): no likes, no
 * followers, no comments, no endless feeds. Every helper here exists to
 * point a human at a real place in the physical world.
 */

// ─── Communities ─────────────────────────────────────────────────────────────

export type CommunityId =
  | 'photography'
  | 'rockhounds'
  | 'hiking'
  | 'waterfalls'
  | 'sunsets'
  | 'coffee'
  | 'scenic_drives'
  | 'urbex'
  | 'wildflowers'
  | 'fishing'
  | 'kayaking'
  | 'family'

export interface DiscoveryCommunity {
  id: CommunityId
  label: string
  icon: string
  /** Lowercase keywords matched against quest tags + title words. */
  keywords: string[]
  /** Adjacent worlds occasionally surfaced to encourage cross-exploration. */
  adjacent: CommunityId[]
}

export const DISCOVERY_COMMUNITIES: DiscoveryCommunity[] = [
  { id: 'photography', label: 'Photography Explorers', icon: '📸', adjacent: ['sunsets', 'waterfalls'], keywords: ['photo', 'photography', 'photogenic', 'viewpoint', 'view', 'overlook', 'lookout', 'panorama', 'mural', 'instagram'] },
  { id: 'rockhounds', label: 'Rockhound Community', icon: '🪨', adjacent: ['hiking', 'urbex'], keywords: ['rock', 'rocks', 'mineral', 'geode', 'agate', 'fossil', 'crystal', 'basalt', 'geology', 'lava'] },
  { id: 'hiking', label: 'Hiking', icon: '🥾', adjacent: ['waterfalls', 'wildflowers'], keywords: ['hike', 'hiking', 'trail', 'trailhead', 'summit', 'ridge', 'canyon', 'backpacking', 'loop'] },
  { id: 'waterfalls', label: 'Hidden Waterfalls', icon: '🌊', adjacent: ['hiking', 'photography'], keywords: ['waterfall', 'falls', 'cascade', 'creek', 'gorge', 'spring'] },
  { id: 'sunsets', label: 'Sunset Hunters', icon: '🌅', adjacent: ['photography', 'scenic_drives'], keywords: ['sunset', 'sunrise', 'golden hour', 'dusk', 'skyline', 'horizon', 'stargazing'] },
  { id: 'coffee', label: 'Coffee Adventures', icon: '☕', adjacent: ['family', 'scenic_drives'], keywords: ['coffee', 'espresso', 'cafe', 'café', 'roaster', 'roastery', 'latte', 'bakery'] },
  { id: 'scenic_drives', label: 'Scenic Drives', icon: '🚗', adjacent: ['sunsets', 'photography'], keywords: ['drive', 'scenic', 'byway', 'route', 'road trip', 'highway', 'loop drive'] },
  { id: 'urbex', label: 'Urban Exploration', icon: '🏚️', adjacent: ['photography', 'rockhounds'], keywords: ['abandoned', 'urbex', 'ruins', 'historic', 'ghost town', 'industrial', 'tunnel', 'bridge'] },
  { id: 'wildflowers', label: 'Wildflower Network', icon: '🌸', adjacent: ['hiking', 'photography'], keywords: ['wildflower', 'flower', 'bloom', 'blossom', 'lupine', 'balsamroot', 'meadow', 'garden', 'botanical'] },
  { id: 'fishing', label: 'Fishing', icon: '🎣', adjacent: ['kayaking', 'scenic_drives'], keywords: ['fish', 'fishing', 'angler', 'bass', 'trout', 'salmon', 'steelhead', 'fly fishing'] },
  { id: 'kayaking', label: 'Kayaking', icon: '🛶', adjacent: ['fishing', 'waterfalls'], keywords: ['kayak', 'kayaking', 'paddle', 'canoe', 'raft', 'river access', 'launch', 'boat'] },
  { id: 'family', label: 'Family Adventures', icon: '👨‍👩‍👧', adjacent: ['coffee', 'hiking'], keywords: ['family', 'kids', 'playground', 'park', 'picnic', 'zoo', 'museum', 'splash'] },
]

const COMMUNITY_BY_ID = new Map(DISCOVERY_COMMUNITIES.map((c) => [c.id, c]))

export function communityById(id: string | null | undefined): DiscoveryCommunity | null {
  return (id && COMMUNITY_BY_ID.get(id as CommunityId)) || null
}

// ─── Quest → community classification ────────────────────────────────────────

export interface QuestSignal {
  title?: string | null
  description?: string | null
  tags?: string[] | null
  experience_class?: string | null
}

/**
 * Which communities does an experience belong to? Keyword match over tags
 * (strong signal) + title/description words (weak signal). An experience can
 * belong to several worlds (a waterfall hike is Hiking AND Hidden Waterfalls).
 * Returns [] when nothing matches — unclassified experiences stay universal.
 */
export function classifyQuest(quest: QuestSignal): CommunityId[] {
  const tagText = (quest.tags ?? []).join(' ').toLowerCase()
  const bodyText = `${quest.title ?? ''} ${quest.description ?? ''}`.toLowerCase()
  const matched: CommunityId[] = []
  for (const c of DISCOVERY_COMMUNITIES) {
    const hit = c.keywords.some(
      (k) => tagText.includes(k) || bodyText.includes(k),
    )
    if (hit) matched.push(c.id)
  }
  return matched
}

// ─── Community Intelligence Engine ───────────────────────────────────────────

export interface CommunityAffinity {
  community: DiscoveryCommunity
  /** How many completed experiences fed this world. */
  completions: number
  /** 0..1 share of the explorer's classified activity. */
  share: number
}

/**
 * Behavior → belonging. Feed it the explorer's completed experiences; it
 * returns their communities strongest-first. 15 photo spots + 2 trails +
 * 1 coffee shop → Photography Explorers, no setup required.
 */
export function computeCommunityAffinity(completedQuests: QuestSignal[]): CommunityAffinity[] {
  const counts = new Map<CommunityId, number>()
  let classified = 0
  for (const q of completedQuests) {
    const communities = classifyQuest(q)
    if (communities.length === 0) continue
    classified += 1
    for (const id of communities) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, completions]) => ({
      community: COMMUNITY_BY_ID.get(id)!,
      completions,
      share: classified > 0 ? completions / classified : 0,
    }))
    .sort((a, b) => b.completions - a.completions || a.community.label.localeCompare(b.community.label))
}

/** The explorer's home world (null until behavior says something). */
export function strongestCommunity(affinities: CommunityAffinity[]): DiscoveryCommunity | null {
  return affinities[0]?.community ?? null
}

/**
 * Occasionally surface an ADJACENT world (photography → hidden waterfalls)
 * to encourage cross-exploration. Deterministic per day so the suggestion is
 * stable within a session but rotates over time. Null when the explorer has
 * no affinities yet or already inhabits every adjacent world.
 */
export function adjacentSuggestion(
  affinities: CommunityAffinity[],
  now: number = Date.now(),
): DiscoveryCommunity | null {
  const top = affinities[0]
  if (!top) return null
  const inhabited = new Set(affinities.map((a) => a.community.id))
  const candidates = top.community.adjacent.filter((id) => !inhabited.has(id))
  if (candidates.length === 0) return null
  const dayIndex = Math.floor(now / 86_400_000)
  return COMMUNITY_BY_ID.get(candidates[dayIndex % candidates.length]) ?? null
}

// ─── Marker contribution types (Explorer Marker System 2.0) ──────────────────

export type MarkerContributionType =
  | 'hidden_photo'
  | 'secret_tip'
  | 'warning'
  | 'best_time'
  | 'shortcut'
  | 'hidden_discovery'
  | 'favorite_spot'
  | 'mini_challenge'
  | 'personal_memory'

export interface MarkerTypeConfig {
  type: MarkerContributionType
  icon: string
  label: string
  /** Give-back flow prompt — one meaningful contribution, not a comment box. */
  prompt: string
  /** Communities this contribution type leans toward (feed placement hint). */
  leansToward: CommunityId[]
}

export const MARKER_CONTRIBUTION_TYPES: MarkerTypeConfig[] = [
  { type: 'hidden_photo', icon: '📸', label: 'Hidden Photo', prompt: 'Leave a photo only visitors will ever see.', leansToward: ['photography', 'sunsets'] },
  { type: 'secret_tip', icon: '💡', label: 'Secret Tip', prompt: 'Share the thing you wish you had known.', leansToward: [] },
  { type: 'warning', icon: '⚠️', label: 'Warning', prompt: 'Warn the next explorer about something real.', leansToward: [] },
  { type: 'best_time', icon: '🌅', label: 'Best Time', prompt: 'When is this place at its best?', leansToward: ['sunsets', 'wildflowers'] },
  { type: 'shortcut', icon: '🧭', label: 'Shortcut', prompt: 'Reveal a better way in or out.', leansToward: ['hiking', 'scenic_drives'] },
  { type: 'hidden_discovery', icon: '🎁', label: 'Hidden Discovery', prompt: 'Point at something most visitors miss.', leansToward: ['urbex', 'rockhounds'] },
  { type: 'favorite_spot', icon: '⭐', label: 'Favorite Spot', prompt: 'Mark the exact spot that made this worth it.', leansToward: [] },
  { type: 'mini_challenge', icon: '🎯', label: 'Mini Challenge', prompt: 'Set a small challenge for whoever comes next.', leansToward: ['family', 'hiking'] },
  { type: 'personal_memory', icon: '❤️', label: 'Personal Memory', prompt: 'Leave a moment of yours at this place.', leansToward: ['family'] },
]

const MARKER_TYPE_BY_KEY = new Map(MARKER_CONTRIBUTION_TYPES.map((t) => [t.type, t]))

export function markerTypeConfig(type: string | null | undefined): MarkerTypeConfig {
  return MARKER_TYPE_BY_KEY.get(type as MarkerContributionType) ?? MARKER_TYPE_BY_KEY.get('favorite_spot')!
}

/**
 * The community a marker lives in: explicit quest communities first, then the
 * contribution type's lean, else null (universal — visible to everyone).
 */
export function markerCommunity(
  quest: QuestSignal,
  type: MarkerContributionType,
): CommunityId | null {
  const fromQuest = classifyQuest(quest)
  if (fromQuest.length > 0) return fromQuest[0]
  return markerTypeConfig(type).leansToward[0] ?? null
}

// ─── Rarity (presentation layer over the existing 027 tier ledger) ───────────

export type MarkerRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'legacy'

/** Rarity derives from the earned tier — scarcity already lives in the ledger. */
export function rarityForTier(tier: string): MarkerRarity {
  switch (tier) {
    case 'legacy':
      return 'legacy'
    case 'diamond':
      return 'legendary'
    case 'gold':
      return 'epic'
    case 'silver':
    case 'bronze':
      return 'rare'
    default:
      return 'common'
  }
}

export const RARITY_LABEL: Record<MarkerRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  legacy: 'Legacy',
}

export const RARITY_COLOR: Record<MarkerRarity, string> = {
  common: '#94a3b8',
  rare: '#38bdf8',
  epic: '#a78bfa',
  legendary: '#fbbf24',
  legacy: '#f97316',
}

// ─── Reputation (usefulness, not vanity) ─────────────────────────────────────

export type MarkerSignalKind =
  | 'helpful'
  | 'inspired_me'
  | 'beautiful'
  | 'accurate'
  | 'worth_the_trip'

export const MARKER_SIGNALS: { kind: MarkerSignalKind; label: string; icon: string }[] = [
  { kind: 'helpful', label: 'Helpful', icon: '🤝' },
  { kind: 'inspired_me', label: 'Inspired Me', icon: '✨' },
  { kind: 'beautiful', label: 'Beautiful', icon: '🌄' },
  { kind: 'accurate', label: 'Accurate', icon: '🎯' },
  { kind: 'worth_the_trip', label: 'Worth The Trip', icon: '🚗' },
]

/**
 * Discoverability score for feed ordering: unlocks prove the chase works,
 * signals prove the payoff was real, freshness keeps the world alive.
 */
export function markerReputationScore(
  unlockCount: number,
  signalCount: number,
  placedAt: string,
  now: number = Date.now(),
): number {
  const ageDays = Math.max(0, (now - Date.parse(placedAt)) / 86_400_000)
  const freshness = Math.exp(-ageDays / 30) // half-life ≈ 3 weeks
  return signalCount * 3 + unlockCount + freshness * 5
}

// ─── Chase-feed presentation ─────────────────────────────────────────────────

/**
 * Teaser distance for the chase feed: intentionally coarse. The exact spot is
 * the reward — "0.6 miles away" is the invitation.
 */
export function chaseDistanceLabel(distanceKm: number): string {
  const miles = distanceKm * 0.621371
  if (miles < 0.1) return 'right here'
  if (miles < 10) return `${miles.toFixed(1)} miles away`
  return `${Math.round(miles)} miles away`
}
