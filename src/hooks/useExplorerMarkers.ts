/**
 * Explorer Marker hooks — thin data-fetching wrappers over markerService /
 * communityService, following the project's existing hook conventions
 * (plain useState/useEffect, no extra state library). Loading flags are
 * derived (loaded-key vs request-key) so effects never set state
 * synchronously.
 */
import { useCallback, useEffect, useState } from 'react'
import { markerService, type MarkerKeepsake } from '../services/markerService'
import { communityService } from '../services/communityService'
import {
  progressionLevelFor,
  nextMilestoneFor,
  type MarkerMilestone,
} from '../lib/explorerMarkers'
import type {
  ExplorerMarker,
  ExperienceMarkerView,
  MarkerInventoryRow,
  CommunityMetrics,
  CommunityActivityItem,
} from '../lib/supabase/types'

// ─── Progression ─────────────────────────────────────────────────────────────

export interface ExplorerProgression {
  loading: boolean
  error: string | null
  verifiedCompletions: number
  milestones: MarkerMilestone[]
  level: MarkerMilestone | null
  nextMilestone: MarkerMilestone | null
  /** Awards newly granted on this load (for a subtle "markers earned" note). */
  newAwardTiers: string[]
  refresh: () => void
}

/**
 * Level + thresholds from verified completions. Also claims any newly
 * qualified milestone awards (idempotent server-side — safe every open).
 */
export function useExplorerProgression(enabled = true): ExplorerProgression {
  const [error, setError] = useState<string | null>(null)
  const [verifiedCompletions, setVerifiedCompletions] = useState(0)
  const [milestones, setMilestones] = useState<MarkerMilestone[]>([])
  const [newAwardTiers, setNewAwardTiers] = useState<string[]>([])
  const [nonce, setNonce] = useState(0)
  const [loadedNonce, setLoadedNonce] = useState(-1)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all([
      markerService.getMilestones(),
      markerService.getMyVerifiedCompletionCount(),
      markerService.claimMilestones(),
    ]).then(([ms, count, claimed]) => {
      if (cancelled) return
      if (ms.data) setMilestones(ms.data)
      if (count.data !== null) setVerifiedCompletions(count.data)
      if (claimed.data && claimed.data.length > 0) {
        setNewAwardTiers(claimed.data.map((a) => a.tier))
      }
      setError(count.error ?? null)
      setLoadedNonce(nonce)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

  return {
    loading: enabled && loadedNonce !== nonce,
    error,
    verifiedCompletions,
    milestones,
    level: progressionLevelFor(verifiedCompletions, milestones.length ? milestones : undefined),
    nextMilestone: nextMilestoneFor(verifiedCompletions, milestones.length ? milestones : undefined),
    newAwardTiers,
    refresh: () => setNonce((n) => n + 1),
  }
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export function useMarkerInventory(enabled = true) {
  const [rows, setRows] = useState<MarkerInventoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [loadedNonce, setLoadedNonce] = useState(-1)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    markerService.getMyInventory().then((res) => {
      if (cancelled) return
      if (res.data) setRows(res.data)
      setError(res.error)
      setLoadedNonce(nonce)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  return { inventory: rows, loading: enabled && loadedNonce !== nonce, error, refresh }
}

// ─── Experience markers ──────────────────────────────────────────────────────

export function useExperienceMarkers(questId: string | null) {
  const [markers, setMarkers] = useState<ExperienceMarkerView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const requestKey = questId ? `${questId}:${nonce}` : null

  useEffect(() => {
    if (!questId) return
    const key = `${questId}:${nonce}`
    let cancelled = false
    markerService.getExperienceMarkers(questId).then((res) => {
      if (cancelled) return
      setMarkers(res.data ?? [])
      setError(res.error)
      setLoadedKey(key)
    })
    return () => {
      cancelled = true
    }
  }, [questId, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  return {
    markers: requestKey !== null && loadedKey === requestKey ? markers : [],
    loading: requestKey !== null && loadedKey !== requestKey,
    error,
    refresh,
  }
}

// ─── My discoveries (keepsakes) + my placed markers ──────────────────────────

export function useMyMarkerDiscoveries(enabled = true) {
  const [keepsakes, setKeepsakes] = useState<MarkerKeepsake[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [loadedNonce, setLoadedNonce] = useState(-1)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    markerService.getMyKeepsakes().then((res) => {
      if (cancelled) return
      if (res.data) setKeepsakes(res.data)
      setError(res.error)
      setLoadedNonce(nonce)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  return { keepsakes, loading: enabled && loadedNonce !== nonce, error, refresh }
}

export function useMyPlacedMarkers(enabled = true) {
  const [placed, setPlaced] = useState<ExplorerMarker[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [loadedNonce, setLoadedNonce] = useState(-1)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    markerService.getMyPlacedMarkers().then((res) => {
      if (cancelled) return
      if (res.data) setPlaced(res.data)
      setError(res.error)
      setLoadedNonce(nonce)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  return { placed, loading: enabled && loadedNonce !== nonce, error, refresh }
}

// ─── Community ───────────────────────────────────────────────────────────────

export function useCommunityMetrics(enabled = true) {
  const [metrics, setMetrics] = useState<CommunityMetrics | null>(null)
  const [activity, setActivity] = useState<CommunityActivityItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all([
      communityService.getMetrics(),
      communityService.getActivity(12),
    ]).then(([m, a]) => {
      if (cancelled) return
      if (m.data) setMetrics(m.data)
      if (a.data) setActivity(a.data)
      setError(m.error && a.error ? m.error : null)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { metrics, activity, loading: enabled && !loaded, error }
}
