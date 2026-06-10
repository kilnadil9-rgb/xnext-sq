import { useEffect, useRef, useState } from 'react'
import { questService } from '../services/questService'
import type { NearbyQuest } from '../lib/supabase/types'
import type { LatLng } from '../components/map/types'

export interface UseNearbyQuestsOptions {
  radiusKm: number
  limit?: number
  debounceMs?: number
  enabled?: boolean
}

/**
 * Fetches quests within `radiusKm` of `center` via
 * questService.getNearbyQuests (find_quests_nearby RPC).
 * Debounced; stale responses are discarded.
 */
export function useNearbyQuests(
  center: LatLng | null,
  { radiusKm, limit = 100, debounceMs = 400, enabled = true }: UseNearbyQuestsOptions,
) {
  const [quests, setQuests] = useState<NearbyQuest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const lat = center?.lat
  const lng = center?.lng

  useEffect(() => {
    if (!enabled || lat === undefined || lng === undefined) return

    const seq = ++requestSeq.current
    setLoading(true)

    const timer = window.setTimeout(async () => {
      const result = await questService.getNearbyQuests(lat, lng, radiusKm, {
        limit,
      })

      if (seq !== requestSeq.current) return // stale response

      if (result.error) {
        setError(result.error)
      } else {
        setError(null)
        setQuests(result.data ?? [])
      }
      setLoading(false)
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [lat, lng, radiusKm, limit, debounceMs, enabled])

  return { quests, loading, error }
}
