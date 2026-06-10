import { formatDistance } from '../../lib/distance'
import {
  RADAR_SORT_OPTIONS,
  type RadarSortMode,
  type RankedQuest,
} from '../../lib/adventureRadar'

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
}: Props) {
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
          <p>No quests within {formatDistance(radiusKm * 1000)}.</p>
          <p className="radar-list__detail">
            Widen the radius or pan the map to explore further.
          </p>
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
                <span className="radar-row__title">{quest.title}</span>
                <span className="radar-row__meta">
                  <span className="radar-row__class">
                    {quest.experience_class}
                  </span>
                  · {formatDistance(quest.distance_km * 1000)}
                  {quest.location_name ? ` · ${quest.location_name}` : ''}
                </span>
                <span className="radar-row__badges">
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
