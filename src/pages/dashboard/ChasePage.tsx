import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserLocation } from '../../hooks/useUserLocation'
import { questCompletionService } from '../../services/questCompletionService'
import { chaseService, type ChaseTeaser, type ExplorerImpact } from '../../services/chaseService'
import { FALLBACK_CENTER } from '../../components/map/mapsConfig'
import { ChaseUnlockSheet } from '../../components/chase/ChaseUnlockSheet'
import { LoadingState } from '../../components/ui/LoadingState'
import {
  MARKER_SIGNALS,
  adjacentSuggestion,
  chaseDistanceLabel,
  communityById,
  computeCommunityAffinity,
  markerReputationScore,
  markerTypeConfig,
  strongestCommunity,
} from '../../lib/discoveryCommunities'
import '../../components/chase/chase.css'

/**
 * The Chase — XNEXT's discovery community screen.
 *
 * Not a social network: no posts, no likes, no followers, no endless feed.
 * Every card is an invitation to physically go somewhere, because another
 * explorer left something there. Communities are inferred from what the
 * explorer actually completes (Community Intelligence) — zero setup.
 */

const LAST_SEEN_KEY = 'xnext-chase-last-seen'

export function ChasePage() {
  const navigate = useNavigate()
  const { position, status: locationStatus, request } = useUserLocation(false)

  const [teasers, setTeasers] = useState<ChaseTeaser[] | null>(null)
  const [impact, setImpact] = useState<ExplorerImpact | null>(null)
  const [affinityInput, setAffinityInput] = useState<
    { title: string; tags?: string[] | null; description?: string | null; experience_class?: string }[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ChaseTeaser | null>(null)
  const [newSinceLastVisit, setNewSinceLastVisit] = useState(0)

  // Ask for a fix once (page open = user intent); fall back to the region.
  useEffect(() => {
    if (locationStatus === 'idle') request()
  }, [locationStatus, request])

  const center = position ?? FALLBACK_CENTER

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [feed, myImpact, completions] = await Promise.all([
        chaseService.getFeed(center, 60),
        chaseService.getMyImpact(),
        questCompletionService.getMyCompletions({ limit: 100 }),
      ])
      if (cancelled) return
      if (feed.error) setError(feed.error)
      setTeasers(feed.data ?? [])
      setImpact(myImpact.data)
      setAffinityInput(
        (completions.data ?? [])
          .map((c) => c.quests)
          .filter((q): q is NonNullable<typeof q> => q !== null),
      )
      // Discovery notification: how many drops appeared since the last visit?
      try {
        const last = Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0)
        const fresh = (feed.data ?? []).filter(
          (t) => !t.is_mine && Date.parse(t.placed_at) > last,
        ).length
        if (last > 0) setNewSinceLastVisit(fresh)
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()))
      } catch {
        /* localStorage unavailable — banner simply doesn't show */
      }
    })()
    return () => {
      cancelled = true
    }
    // One load per meaningful location change (not every GPS tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position === null])

  // ── Community Intelligence: behavior → belonging ───────────────────────────
  const affinities = useMemo(() => computeCommunityAffinity(affinityInput), [affinityInput])
  const home = strongestCommunity(affinities)
  const adjacent = useMemo(() => adjacentSuggestion(affinities), [affinities])

  // ── Feed sections (all bounded — never endless) ────────────────────────────
  const chaseable = useMemo(
    () => (teasers ?? []).filter((t) => !t.is_mine),
    [teasers],
  )

  /** Drops grouped by community, ordered: my communities first, then size. */
  const communityGroups = useMemo(() => {
    const groups = new Map<string, ChaseTeaser[]>()
    for (const t of chaseable.filter((t) => !t.discovered_by_me)) {
      const key = t.community ?? 'everyone'
      const list = groups.get(key) ?? []
      list.push(t)
      groups.set(key, list)
    }
    const affinityRank = new Map(affinities.map((a, i) => [a.community.id as string, i]))
    return [...groups.entries()]
      .map(([communityId, drops]) => ({
        communityId,
        community: communityById(communityId),
        drops: drops.sort((a, b) => a.distance_km - b.distance_km),
      }))
      .sort((a, b) => {
        const ra = affinityRank.get(a.communityId) ?? 99
        const rb = affinityRank.get(b.communityId) ?? 99
        return ra - rb || b.drops.length - a.drops.length
      })
      .slice(0, 6)
  }, [chaseable, affinities])

  const popularToday = useMemo(
    () =>
      [...chaseable]
        .filter((t) => t.unlocks_today > 0)
        .sort((a, b) => b.unlocks_today - a.unlocks_today)
        .slice(0, 5),
    [chaseable],
  )

  const highestRated = useMemo(
    () =>
      [...chaseable]
        .filter((t) => t.signal_count > 0)
        .sort(
          (a, b) =>
            markerReputationScore(b.unlock_count, b.signal_count, b.placed_at) -
            markerReputationScore(a.unlock_count, a.signal_count, a.placed_at),
        )
        .slice(0, 5),
    [chaseable],
  )

  const seasonal = useMemo(
    () => chaseable.filter((t) => t.seasonal_active).slice(0, 5),
    [chaseable],
  )

  const verified = useMemo(
    () => chaseable.filter((t) => t.verified_location).slice(0, 5),
    [chaseable],
  )

  // ── Actions ────────────────────────────────────────────────────────────────
  const openOnMap = useCallback(
    (questId: string) => {
      navigate('/dashboard')
      // MapScreen listens for this event (Phase 3) and opens the experience.
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('xnext-select-quest', { detail: { id: questId } }))
      }, 600)
    },
    [navigate],
  )

  const loading = teasers === null

  return (
    <div className="chase-page">
      <header className="chase-page__header">
        <h1 className="chase-page__title">The Chase</h1>
        <p className="chase-page__subtitle">
          Explorers have hidden things out there. The only way to see them is to go.
        </p>
        {home && (
          <div className="chase-page__home-community">
            <span className="chase-page__home-icon" aria-hidden>{home.icon}</span>
            <div>
              <p className="chase-page__home-label">{home.label}</p>
              <p className="chase-page__home-sub">
                Your strongest community — earned by what you explore, not what you follow.
              </p>
            </div>
          </div>
        )}
      </header>

      {newSinceLastVisit > 0 && (
        <p className="chase-banner" role="status">
          ✨ {newSinceLastVisit} new hidden {newSinceLastVisit === 1 ? 'drop' : 'drops'} appeared
          near you since your last visit.
        </p>
      )}

      {loading && <LoadingState message="Scanning for hidden drops…" />}
      {!loading && error && (
        <p className="chase-error" role="alert">{error}</p>
      )}

      {!loading && !error && chaseable.length === 0 && (
        <div className="chase-empty">
          <p className="chase-empty__title">The map is quiet… for now.</p>
          <p className="chase-empty__sub">
            Complete an adventure and leave the first marker — someone will chase it.
          </p>
        </div>
      )}

      {/* ── Nearby hidden drops by community ── */}
      {communityGroups.length > 0 && (
        <section className="chase-section" aria-label="Nearby hidden drops">
          <h2 className="chase-section__title">Nearby Hidden Drops</h2>
          {communityGroups.map((g) => (
            <div key={g.communityId} className="chase-group">
              <div className="chase-group__head">
                <span className="chase-group__name">
                  {g.community ? `${g.community.icon} ${g.community.label}` : '🧭 For Every Explorer'}
                </span>
                <span className="chase-group__count">
                  🔥 {g.drops.length} hidden {g.drops.length === 1 ? 'drop' : 'drops'}
                </span>
              </div>
              <div className="chase-group__drops">
                {g.drops.slice(0, 3).map((t) => (
                  <TeaserCard key={t.marker_id} teaser={t} onOpen={() => setSelected(t)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {adjacent && (
        <section className="chase-section chase-section--adjacent" aria-label="Worth a look">
          <p>
            Explorers like you have been wandering into{' '}
            <strong>{adjacent.icon} {adjacent.label}</strong> lately. Worth a look?
          </p>
        </section>
      )}

      {popularToday.length > 0 && (
        <ChaseRow title="Popular Unlocks Today" teasers={popularToday} onOpen={setSelected} />
      )}
      {seasonal.length > 0 && (
        <ChaseRow title="Limited-Time Seasonal Drops" teasers={seasonal} onOpen={setSelected} />
      )}
      {highestRated.length > 0 && (
        <ChaseRow title="Highest Rated Explorer Markers" teasers={highestRated} onOpen={setSelected} />
      )}
      {verified.length > 0 && (
        <ChaseRow title="Recently Verified Discoveries" teasers={verified} onOpen={setSelected} />
      )}

      {/* ── Real-world impact (never vanity) ── */}
      {impact && impact.markers_placed > 0 && (
        <section className="chase-section chase-impact" aria-label="Your impact">
          <h2 className="chase-section__title">Because of your discoveries…</h2>
          <ul className="chase-impact__list">
            <li>
              <strong>{impact.explorers_reached}</strong>{' '}
              {impact.explorers_reached === 1 ? 'explorer' : 'explorers'} unlocked your markers
              {impact.unlocks_today > 0 ? ` — ${impact.unlocks_today} today` : ''}.
            </li>
            {impact.total_unlocks > 0 && (
              <li>
                Your contributions were opened <strong>{impact.total_unlocks}</strong>{' '}
                {impact.total_unlocks === 1 ? 'time' : 'times'} out in the world.
              </li>
            )}
            {Object.entries(impact.signals_received).map(([kind, n]) => {
              const cfg = MARKER_SIGNALS.find((s) => s.kind === kind)
              return cfg ? (
                <li key={kind}>
                  <strong>{n}</strong> {n === 1 ? 'explorer' : 'explorers'} said your markers were{' '}
                  {cfg.label.toLowerCase()} {cfg.icon}
                </li>
              ) : null
            })}
            {impact.verified_locations_touched > 0 && (
              <li>
                <strong>{impact.verified_locations_touched}</strong>{' '}
                {impact.verified_locations_touched === 1 ? 'location' : 'locations'} you contributed
                to {impact.verified_locations_touched === 1 ? 'is' : 'are'} now Verified.
              </li>
            )}
          </ul>
        </section>
      )}

      {selected && (
        <ChaseUnlockSheet
          teaser={selected}
          userPosition={position}
          onClose={() => setSelected(null)}
          onChase={(questId) => {
            setSelected(null)
            openOnMap(questId)
          }}
          onGiveBack={(questId) => {
            setSelected(null)
            openOnMap(questId)
          }}
        />
      )}
    </div>
  )
}

// ── Small presentational pieces ───────────────────────────────────────────────

function TeaserCard({ teaser, onOpen }: { teaser: ChaseTeaser; onOpen: () => void }) {
  const typeCfg = markerTypeConfig(teaser.marker_type)
  return (
    <button type="button" className="chase-teaser" onClick={onOpen}>
      <span className="chase-teaser__icon" aria-hidden>
        {teaser.discovered_by_me ? typeCfg.icon : '❓'}
      </span>
      <span className="chase-teaser__body">
        <span className="chase-teaser__type">
          {typeCfg.label}
          {teaser.seasonal_active ? ' · limited time' : ''}
        </span>
        <span className="chase-teaser__where">{teaser.quest_title}</span>
        <span className="chase-teaser__meta">
          {chaseDistanceLabel(teaser.distance_km)} · Reward:{' '}
          {teaser.discovered_by_me ? 'unlocked' : 'Unknown'}
        </span>
      </span>
    </button>
  )
}

function ChaseRow({
  title,
  teasers,
  onOpen,
}: {
  title: string
  teasers: ChaseTeaser[]
  onOpen: (t: ChaseTeaser) => void
}) {
  return (
    <section className="chase-section" aria-label={title}>
      <h2 className="chase-section__title">{title}</h2>
      <div className="chase-row">
        {teasers.map((t) => (
          <TeaserCard key={t.marker_id} teaser={t} onOpen={() => onOpen(t)} />
        ))}
      </div>
    </section>
  )
}

export default ChasePage
