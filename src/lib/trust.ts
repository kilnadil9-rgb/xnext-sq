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

// ── Explorer Notes (026) — pure helpers ──────────────────────────────────────

/** Max words in an Explorer Note — one observation, high signal. */
export const EXPLORER_NOTE_MAX_WORDS = 9

/** Count words the same way everywhere (UI counter + service validation). */
export function explorerNoteWordCount(note: string): number {
  const trimmed = note.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}
