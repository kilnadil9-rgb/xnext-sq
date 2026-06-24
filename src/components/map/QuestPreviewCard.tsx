import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dreamListService } from '../../services/dreamListService'
import { questCompletionService } from '../../services/questCompletionService'
import { formatDistance, haversineMeters } from '../../lib/distance'
import type { RankedQuest } from '../../lib/adventureRadar'
import type { LatLng } from './types'
import { googleMapsDirectionsUrl } from './DirectionsLayer'
import { listingBadge } from '../../services/listingService'
import { seasonBadges, seasonalStatusLabel } from '../../lib/season'

type SaveState = 'checking' | 'not_saved' | 'saving' | 'saved'
type CompletionState = 'checking' | 'not_done' | 'completing' | 'done'
/** Three tiers: compact card → detail sheet → route sheet (after LET'S GO). */
type View = 'compact' | 'detail' | 'route'

interface Props {
  quest: RankedQuest
  /** Single source of truth for distance — the real user GPS fix, or null. */
  userLocation: LatLng | null
  onClose: () => void
  onNext?: () => void
}

const CLASS_ICON: Record<string, string> = {
  wonder: '✨',
  opportunity: '🎯',
  transformation: '🔥',
  connection: '🤝',
}

/** Placeholder reward — real XP economy lands later. */
function xpFor(quest: RankedQuest): number {
  return 100 + Math.round(quest.sq_score ?? 0)
}

/**
 * Selected-adventure UI. Mobile-first three tiers so the map stays the hero:
 *   compact (default, above bottom nav) → detail sheet (intentional tap) →
 *   route sheet (after LET'S GO). The X always returns to the compact card,
 *   so the user can never get trapped in a full overlay.
 */
export function QuestPreviewCard({
  quest,
  userLocation,
  onClose,
  onNext,
}: Props) {
  const [view, setView] = useState<View>('compact')
  const [saveState, setSaveState] = useState<SaveState>('checking')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [completionState, setCompletionState] =
    useState<CompletionState>('checking')

  // Completion form + celebration (within the route tier)
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [recommend, setRecommend] = useState<boolean | null>(null)
  const [withFriends, setWithFriends] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)

  // When the selected adventure changes (e.g. NEXT), collapse back to compact.
  useEffect(() => {
    let cancelled = false
    setView('compact')
    setSaveState('checking')
    setCompletionState('checking')
    setSaveError(null)
    setShowCompleteForm(false)
    setCelebrating(false)

    dreamListService.getDreamListItemByQuestId(quest.id).then((result) => {
      if (cancelled) return
      setSaveState(result.error ? 'not_saved' : result.data ? 'saved' : 'not_saved')
    })
    questCompletionService.getCompletionByQuestId(quest.id).then((result) => {
      if (cancelled) return
      setCompletionState(result.data ? 'done' : 'not_done')
    })

    return () => {
      cancelled = true
    }
  }, [quest.id])

  const handleSave = async () => {
    setSaveState('saving')
    setSaveError(null)
    const result = await dreamListService.addToDreamList(quest.id)
    if (result.error) {
      if (/duplicate|unique/i.test(result.error)) setSaveState('saved')
      else {
        setSaveState('not_saved')
        setSaveError(result.error)
      }
      return
    }
    setSaveState('saved')
  }

  const handleStart = () => {
    setView('route')
  }

  const backToCompact = () => {
    setShowCompleteForm(false)
    setView('compact')
  }

  const handleConfirmComplete = async () => {
    setCompletionState('completing')
    setSaveError(null)
    const result = await questCompletionService.completeQuest(quest.id, {
      story: notes.trim() || null,
      sqScoreAtCompletion: quest.sq_score,
    })
    if (result.error) {
      setCompletionState('not_done')
      setSaveError(result.error)
      return
    }
    setXpEarned(xpFor(quest))
    setCompletionState('done')
    setShowCompleteForm(false)
    setCelebrating(true)
  }

  const handleNextFromCelebration = () => {
    setCelebrating(false)
    if (onNext) onNext()
    else onClose()
  }

  const icon = CLASS_ICON[quest.experience_class] ?? '📍'
  // Single source of truth: distance is computed from the real user location.
  // When there's no GPS fix we show no number (never a misleading "0 m").
  const distanceMeters =
    userLocation && Number.isFinite(quest.lat) && Number.isFinite(quest.lng)
      ? haversineMeters(userLocation, { lat: quest.lat, lng: quest.lng })
      : null
  const distLabel =
    distanceMeters !== null ? `${formatDistance(distanceMeters)} away` : 'Enable location for distance'
  const isDone = completionState === 'done'
  const saveBusy = saveState === 'checking' || saveState === 'saving' || saveState === 'saved'
  const badge = listingBadge(quest)
  const seasonStatus = seasonalStatusLabel(quest)
  const seasons = seasonBadges(quest)

  // Part 4: navigate to parking when a separate drive-to point exists; the
  // experience itself remains at quest.lat/lng (future: walk-to leg).
  const hasParking =
    Number.isFinite(quest.parking_lat) && Number.isFinite(quest.parking_lng)
  const navTarget: LatLng = hasParking
    ? { lat: quest.parking_lat as number, lng: quest.parking_lng as number }
    : { lat: quest.lat, lng: quest.lng }

  /* ── Celebration overlay (adventure ending) ───────────────────────────── */
  if (celebrating) {
    return (
      <div className="quest-sheet xnext-celebrate" role="dialog" aria-label="Adventure complete">
        <div className="xnext-celebrate__burst" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className="xnext-celebrate__icon" aria-hidden="true">🏆</div>
        <h2 className="xnext-celebrate__title">Adventure Complete</h2>
        <div className="xnext-celebrate__rewards">
          <div className="xnext-celebrate__reward">+{xpEarned} XP Earned</div>
          <div className="xnext-celebrate__reward xnext-celebrate__reward--memory">
            + Memory Added
          </div>
        </div>
        <p className="quest-sheet__meta" style={{ textAlign: 'center' }}>
          “{quest.title}” is now in your Memories.
        </p>
        <div className="quest-sheet__actions">
          <Link to="/dashboard/completed" className="quest-sheet__view-memory">
            View in Memories
          </Link>
          <button type="button" className="quest-sheet__primary" onClick={handleNextFromCelebration}>
            Next adventure →
          </button>
        </div>
      </div>
    )
  }

  /* ── Tier 1: compact card (default) ───────────────────────────────────── */
  if (view === 'compact') {
    return (
      <div className="quest-compact" role="dialog" aria-label={quest.title}>
        <button
          type="button"
          className="quest-compact__body"
          onClick={() => setView('detail')}
          aria-label={`Open details for ${quest.title}`}
        >
          <span className="quest-compact__icon" aria-hidden="true">{icon}</span>
          <span className="quest-compact__info">
            {badge && (
              <span className={`quest-listing-badge quest-listing-badge--${badge.kind}`}>
                {badge.label}
              </span>
            )}
            {seasonStatus && (
              <span className="quest-listing-badge quest-listing-badge--season">
                {seasonStatus}
              </span>
            )}
            <span className="quest-compact__title">{quest.title}</span>
            <span className="quest-compact__meta">
              <span className="quest-compact__class">{quest.experience_class}</span>
              {' · '}{distLabel}
              {isDone ? ' · 🏆' : ''}
            </span>
          </span>
        </button>

        <div className="quest-compact__actions">
          {isDone ? (
            <Link to="/dashboard/completed" className="quest-compact__go">
              Memories
            </Link>
          ) : (
            <button type="button" className="quest-compact__go" onClick={handleStart}>
              LET’S GO
            </button>
          )}
          <button
            type="button"
            className="quest-compact__save"
            onClick={handleSave}
            disabled={saveBusy}
            aria-label={saveState === 'saved' ? 'Saved' : 'Save for later'}
          >
            {saveState === 'saved' ? '✓' : '♡'}
          </button>
        </div>

        <button
          type="button"
          className="quest-compact__close"
          onClick={onClose}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }

  /* ── Tier 3: route sheet (after LET'S GO) ─────────────────────────────── */
  if (view === 'route') {
    return (
      <div className="quest-sheet" role="dialog" aria-label={`Route to ${quest.title}`}>
        <button type="button" className="quest-sheet__close" aria-label="Close" onClick={backToCompact}>
          ✕
        </button>

        {!showCompleteForm ? (
          <div className="quest-route">
            <div className="quest-route__head">
              <span className="quest-route__label">Route to</span>
              <span className="quest-route__name">{quest.title}</span>
              {quest.location_name && (
                <span className="quest-route__sub">{quest.location_name}</span>
              )}
            </div>

            <div className="quest-route__stats">
              <span className={`quest-route__eta${distanceMeters !== null ? '' : ' quest-route__eta--muted'}`}>
                {distLabel}
              </span>
            </div>

            {hasParking && (
              <p className="quest-route__parking">
                🅿️ Navigating to parking — a short walk to the experience from
                there.
              </p>
            )}

            <div className="quest-sheet__actions">
              {/* XNEXT owns discovery; Google owns turn-by-turn navigation.
                  Part 4: route to the parking coordinate when one exists. */}
              <a
                className="quest-sheet__primary"
                href={googleMapsDirectionsUrl(navTarget)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {hasParking ? 'Drive to parking' : 'Open in Google Maps'}
              </a>
            </div>

            {saveError && (
              <p className="quest-sheet__error" role="alert">{saveError}</p>
            )}

            <div className="quest-sheet__actions">
              <button
                type="button"
                className="quest-sheet__primary"
                onClick={() => setShowCompleteForm(true)}
              >
                Complete Adventure
              </button>
              <button type="button" onClick={backToCompact}>
                Not Today
              </button>
            </div>
          </div>
        ) : (
          /* Completion form */
          <div className="quest-complete-form">
            <h2>Complete “{quest.title}”</h2>
            <label className="quest-complete-form__label" htmlFor="memory-notes">
              Add a note to your memory
            </label>
            <textarea
              id="memory-notes"
              className="quest-complete-form__notes"
              placeholder="How was it? What made it worth the trip?"
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="quest-complete-form__future">
              <div className="quest-complete-form__stars" role="group" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`quest-complete-form__star${n <= rating ? ' is-on' : ''}`}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    onClick={() => setRating(n)}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="quest-complete-form__toggles">
                <button
                  type="button"
                  className={`quest-complete-form__chip${recommend === true ? ' is-on' : ''}`}
                  onClick={() => setRecommend(recommend === true ? null : true)}
                >
                  👍 Recommend
                </button>
                <button
                  type="button"
                  className={`quest-complete-form__chip${withFriends ? ' is-on' : ''}`}
                  onClick={() => setWithFriends((v) => !v)}
                >
                  🧑‍🤝‍🧑 With friends
                </button>
              </div>
              <p className="quest-complete-form__hint">
                Photos, ratings &amp; tags save with your memory in an upcoming update.
              </p>
            </div>
            {saveError && (
              <p className="quest-sheet__error" role="alert">{saveError}</p>
            )}
            <div className="quest-sheet__actions">
              <button type="button" onClick={() => setShowCompleteForm(false)}>
                Back
              </button>
              <button
                type="button"
                className="quest-sheet__primary"
                disabled={completionState === 'completing'}
                onClick={handleConfirmComplete}
              >
                {completionState === 'completing' ? 'Completing…' : 'Complete ✓'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Tier 2: detail sheet (intentional tap) ───────────────────────────── */
  return (
    <div className="quest-sheet" role="dialog" aria-label={quest.title}>
      <button type="button" className="quest-sheet__close" aria-label="Close" onClick={backToCompact}>
        ✕
      </button>

      {badge && (
        <span className={`quest-listing-badge quest-listing-badge--${badge.kind}`}>
          {badge.label}
        </span>
      )}
      {(seasonStatus || seasons.length > 0) && (
        <div className="quest-sheet__seasons">
          {seasonStatus && (
            <span className="quest-listing-badge quest-listing-badge--season">
              {seasonStatus}
            </span>
          )}
          {seasons.map((b) => (
            <span
              key={b.key}
              className={`badge badge--season badge--season-${b.key}`}
              title={b.label}
            >
              {b.emoji} {b.label}
            </span>
          ))}
        </div>
      )}
      <h2>{quest.title}</h2>
      <p className="quest-sheet__meta">
        {quest.experience_class} · {distLabel}
        {quest.location_name ? ` · ${quest.location_name}` : ''}
        {quest.sq_score !== null && (
          <span className="badge badge--sq"> SQ {Math.round(quest.sq_score)}</span>
        )}
        {quest.has_pulse && <span className="badge badge--pulse"> Pulse</span>}
      </p>
      {quest.description && (
        <p className="quest-sheet__description quest-sheet__description--full">
          {quest.description}
        </p>
      )}
      {isDone && (
        <div className="quest-sheet__completed-banner">
          🏆 Completed — saved to your Memories
        </div>
      )}
      {saveError && (
        <p className="quest-sheet__error" role="alert">{saveError}</p>
      )}

      <div className="quest-sheet__actions">
        <button type="button" disabled={saveBusy} onClick={handleSave}>
          {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : 'Save for Later'}
        </button>
        <button type="button" className="quest-sheet__primary" onClick={handleStart}>
          LET’S GO
        </button>
      </div>

      {onNext && (
        <div className="quest-sheet__actions">
          <button type="button" onClick={onNext}>
            Skip — show me the next one
          </button>
        </div>
      )}
    </div>
  )
}
