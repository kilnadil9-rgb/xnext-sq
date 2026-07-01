/**
 * XNEXT Share Phase — reusable native-share helper.
 *
 * Goal: let users share any experience/adventure to other apps via the
 * device's native share sheet, with a clean clipboard fallback when
 * `navigator.share` isn't available. Keeps users inside XNEXT — no
 * separate social platform integrations.
 *
 * Defensive by design: quests may be missing `location_name`, `starts_at`,
 * or `start_date` (not every quest/listing has scheduled time data yet).
 */

/** Minimal shape shareQuest needs — works with RankedQuest, NearbyQuest, Quest. */
export interface QuestLike {
  title: string
  location_name?: string | null
  /** ISO datetime for time-sensitive listings (e.g. events). */
  starts_at?: string | null
  /** ISO date-only for seasonal/date-based experiences. */
  start_date?: string | null
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

const XNEXT_URL = 'https://xnext.app'

/** Best-effort human-readable date/time — returns null if nothing usable. */
function formatQuestWhen(quest: QuestLike): string | null {
  const raw = quest.starts_at ?? quest.start_date
  if (!raw) return null

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null

  const hasTimeComponent = Boolean(quest.starts_at)
  try {
    return hasTimeComponent
      ? date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
  } catch {
    return null
  }
}

/** Builds the readable share message described in the XNEXT Share Phase spec. */
export function buildShareText(quest: QuestLike): string {
  const lines: string[] = ['I found this on XNEXT:', quest.title || 'An XNEXT adventure']

  if (quest.location_name) lines.push(quest.location_name)

  const when = formatQuestWhen(quest)
  if (when) lines.push(when)

  lines.push('', 'Discover local adventures with XNEXT:', XNEXT_URL)
  return lines.join('\n')
}

/**
 * Share a quest/experience using the device native share sheet when
 * available, falling back to copying the share text to the clipboard.
 * Never throws — cancellations and failures resolve to a status instead,
 * so callers can show lightweight UI feedback without try/catch.
 */
export async function shareQuest(quest: QuestLike): Promise<ShareResult> {
  const safeQuest: QuestLike = {
    title: quest?.title || 'An XNEXT adventure',
    location_name: quest?.location_name ?? null,
    starts_at: quest?.starts_at ?? null,
    start_date: quest?.start_date ?? null,
  }

  const title = safeQuest.title
  const text = buildShareText(safeQuest)

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  if (canNativeShare) {
    try {
      await navigator.share({ title, text, url: XNEXT_URL })
      return 'shared'
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name
      const message = (err as { message?: string })?.message ?? ''
      if (name === 'AbortError' || /abort|cancel/i.test(message)) {
        return 'cancelled'
      }
      // Any other native-share failure falls through to the clipboard below
      // rather than surfacing an error to the user.
    }
  }

  const canCopy =
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard !== 'undefined' &&
    typeof navigator.clipboard.writeText === 'function'

  if (canCopy) {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  return 'failed'
}
