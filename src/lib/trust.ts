/**
 * Verified Adventure System — social-proof copy helpers.
 * Pure functions, no I/O. Counts come from quests.completed_count
 * (unique completers, migration 022); zero/unknown returns null so the UI
 * renders nothing instead of fake placeholder text.
 */

interface ProofSource {
  verified_location?: boolean
  completed_count?: number
}

/**
 * One-line social proof for a quest:
 *   verified   → "12 explorers verified this location"
 *   in progress→ "2 explorers completed this"
 *   none/unknown → null (render nothing — keep cards clean, no fake data)
 */
export function explorerProofLabel(quest: ProofSource): string | null {
  const n = quest.completed_count ?? 0
  if (n <= 0) return null
  const noun = n === 1 ? 'explorer' : 'explorers'
  return quest.verified_location
    ? `${n} ${noun} verified this location`
    : `${n} ${noun} completed this`
}
