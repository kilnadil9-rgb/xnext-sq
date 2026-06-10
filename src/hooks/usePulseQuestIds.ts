import { useEffect, useState } from 'react'
import { pulseService } from '../services/pulseService'

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Quest ids that currently have an active (non-dismissed, non-expired)
 * Pulse alert for the signed-in user. Fails silently — the radar
 * works without Pulse; this only adds boosts/badges.
 */
export function usePulseQuestIds(enabled = true): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    pulseService
      .getActivePulseAlerts({ limit: 100 })
      .then((result) => {
        if (cancelled || result.error || !result.data) return
        setIds(new Set(result.data.map((a) => a.quest_id)))
      })
      .catch(() => {
        /* non-fatal: no pulse boost */
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return ids
}
