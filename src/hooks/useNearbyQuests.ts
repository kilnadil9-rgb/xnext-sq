import { useEffect, useRef, useState } from 'react'
import { questService } from '../services/questService'
import type { NearbyQuest } from '../lib/supabase/types'
import type { LatLng } from '../components/map/types'
import { haversineMeters } from '../lib/distance'

export interface UseNearbyQuestsOptions {
  radiusKm: number
  limit?: number
  debounceMs?: number
  enabled?: boolean
  /** Bump to force a refetch (e.g. retry button) */
  refreshKey?: number
}

// ── Offline cache (RC3) ───────────────────────────────────────────────────────
// Stale-while-unreachable: the LAST successful radar result is kept in
// localStorage. When a fetch fails (dead zone, airplane mode, flaky beta
// network) and the cached result is recent + geographically close to the
// request, we serve it instead of an empty error screen. Real data only —
// it's yesterday's truth, clearly flagged `stale`, never fabricated.

interface NearbyCache {
  lat: number
  lng: number
  radiusKm: number
  ts: number
  quests: NearbyQuest[]
}

const CACHE_KEY = 'xnext-nearby-cache'
const CACHE_MAX_AGE_MS = 24 * 3_600_000 // a day — listings decay fast
const CACHE_MAX_DRIFT_M = 10_000 // request must be within 10 km of the cache

function readCache(): NearbyCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as NearbyCache
    return Array.isArray(parsed.quests) ? parsed : null
  } catch {
    return null
  }
}

function writeCache(entry: NearbyCache): void {
  try {
    // Keep it bounded: one entry, capped rows.
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...entry, quests: entry.quests.slice(0, 100) }),
    )
  } catch {
    /* storage full — cache is best-effort */
  }
}

function usableCache(lat: number, lng: number): NearbyCache | null {
  const cache = readCache()
  if (!cache) return null
  if (Date.now() - cache.ts > CACHE_MAX_AGE_MS) return null
  const drift = haversineMeters({ lat, lng }, { lat: cache.lat, lng: cache.lng })
  return drift <= CACHE_MAX_DRIFT_M ? cache : null
}

/**
 * Fetches quests within `radiusKm` of `center` via
 * questService.getNearbyQuests (find_quests_nearby RPC).
 * Debounced; stale responses are discarded. Falls back to the last cached
 * result when the network fails (`stale: true`).
 */
export function useNearbyQuests(
  center: LatLng | null,
  {
    radiusKm,
    limit = 100,
    debounceMs = 400,
    enabled = true,
    refreshKey = 0,
  }: UseNearbyQuestsOptions,
) {
  const [quests, setQuests] = useState<NearbyQuest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** True when showing cached results because the network was unreachable. */
  const [stale, setStale] = useState(false)
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
        // Network/API failure: serve the recent nearby cache when we have
        // one, so a dead zone doesn't blank the radar.
        const cache = usableCache(lat, lng)
        if (cache) {
          setQuests(cache.quests)
          setStale(true)
          setError(null)
        } else {
          setError(result.error)
        }
      } else {
        setError(null)
        setStale(false)
        setQuests(result.data ?? [])
        writeCache({
          lat,
          lng,
          radiusKm,
          ts: Date.now(),
          quests: result.data ?? [],
        })
      }
      setLoading(false)
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [lat, lng, radiusKm, limit, debounceMs, enabled, refreshKey])

  return { quests, loading, error, stale }
}
