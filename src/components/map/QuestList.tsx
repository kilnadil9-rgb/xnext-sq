import { Link } from 'react-router-dom'
import { formatDistance, haversineMeters } from '../../lib/distance'
import type { LatLng } from './types'
import {
  RADAR_SORT_OPTIONS,
  type RadarSortMode,
  type RankedQuest,
} from '../../lib/adventureRadar'
import { seasonBadges, seasonalStatusLabel } from '../../lib/season'
import { VerifiedBadge } from '../ui/VerifiedBadge'

interface Props {
  quests: RankedQuest[]
  selectedId: string | null
  loading: boolean
  error: string | null
  radiusKm: number
  sortMode: RadarSortMode
  onSortChange: (mode: RadarSortMode) => void
  onSelect: (quest: RankedQuest) => void
  onRetry?: () => void
  /** Widen the search radius to the next option (hidden when already at max). */
  onWiden?: () => void
  canWiden?: boolean
  /** Single source of truth for distance — the real user GPS fix, or null. */
  userLocation?: LatLng | null
}

/** Adventure Radar list: ranked nearby quests beside/below the map. */
export function QuestList({
  quests,
  selectedId,
  loading,
  error,
  radiusKm,
  sortMode,
  onSortChange,
  onSelect,
  onRetry,
  onWiden,
  canWiden = false,
  userLocation = null,
}: Props) {
  // Distance from the real user location when we have a GPS fix; otherwise fall
  // back to the server's radar distance. Keeps every distance on one source.
  const displayMeters = (quest: RankedQuest): number =>
    userLocation && Number.isFinite(quest.lat) && Number.isFinite(quest.lng)
      ? haversineMeters(userLocation, { lat: quest.lat, lng: quest.lng })
      : quest.distance_km * 1000
  return (
    <section className="radar-list" aria-label="Nearby quests">
      <header className="radar-list__header">
        <h2>
          Adventure Radar
          {!loading && !error && (
            <span className="radar-list__count"> · {quests.length}</span>
          )}
        </h2>
        <label className="radar-list__sort">
          <span className="sr-only">Sort by</span>
          <select
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as RadarSortMode)}
            aria-label="Sort quests by"
          >
            {RADAR_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {loading && (
        <ul className="radar-list__items" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="radar-row radar-row--skeleton" aria-hidden="true">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--meta" />
            </li>
          ))}
        </ul>
      )}

      {!loading && error && (
        <div className="radar-list__state" role="alert">
          <p>Couldn’t load nearby quests.</p>
          <p className="radar-list__detail">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}

      {!loading && !error && quests.length === 0 && (
        <div className="radar-list__state">
          <div className="radar-list__state-icon" aria-hidden="true">🧭</div>
          <p>No XNEXT quests within {formatDistance(radiusKm * 1000)} yet.</p>
          <p className="radar-list__detail">
            This corner of the map is uncharted. Widen your radius, pan
            somewhere new, or be the first to put a discovery here.
          </p>
          <div className="radar-list__actions">
            {canWiden && onWiden && (
              <button
                type="button"
                className="radar-list__cta-ghost"
                onClick={onWiden}
              >
                Widen radius
              </button>
            )}
            <Link
              to="/dashboard/quests/new"
              className="radar-list__cta-primary"
            >
              Add a discovery
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && quests.length > 0 && (
        <ul className="radar-list__items">
          {quests.map((quest) => (
            <li key={quest.id}>
              <button
                type="button"
                className={
                  'radar-row' +
                  (quest.id === selectedId ? ' radar-row--selected' : '')
                }
                onClick={() => onSelect(quest)}
              >
                <span className="radar-row__title">
                  {quest.title}
                  {quest.verified_location && (
                    <>
                      {' '}
                      <VerifiedBadge size={14} />
                    </>
                  )}
                </span>
                <span className="radar-row__meta">
                  <span className="radar-row__class">
                    {quest.experience_class}
                  </span>
                  · {formatDistance(displayMeters(quest))}
                  {quest.location_name ? ` · ${quest.location_name}` : ''}
                </span>
                <span className="radar-row__badges">
                  {(() => {
                    const status = seasonalStatusLabel(quest)
                    return status ? (
                      <span className="badge badge--season-status" title="Seasonal status">
                        {status}
                      </span>
                    ) : null
                  })()}
                  {seasonBadges(quest).map((b) => (
                    <span
                      key={b.key}
                      className={`badge badge--season badge--season-${b.key}`}
                      title={b.label}
                    >
                      {b.emoji} {b.label}
                    </span>
                  ))}
                  {quest.sq_score !== null && (
                    <span className="badge badge--sq" title="SQ Score">
                      SQ {Math.round(quest.sq_score)}
                    </span>
                  )}
                  {quest.has_pulse && (
                    <span className="badge badge--pulse" title="Active Pulse alert">
                      Pulse
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
