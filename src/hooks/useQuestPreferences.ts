import { useEffect, useState } from 'react'
import { userQuestPreferencesService } from '../services/userQuestPreferencesService'
import type { UserQuestPreference } from '../lib/supabase/types'

/**
 * Loads the current user's quest preferences once.
 * `preferences` stays null while loading, on error, or when the user
 * has never saved preferences — callers fall back to defaults.
 */
export function useQuestPreferences(enabled = true) {
  const [preferences, setPreferences] = useState<UserQuestPreference | null>(
    null,
  )
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)

    userQuestPreferencesService.getMyPreferences().then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else {
        setPreferences(result.data)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { preferences, loading, error }
}
