import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dreamListService } from '../../services/dreamListService'
import { questCompletionService } from '../../services/questCompletionService'
import { formatDistance } from '../../lib/distance'
import type { RankedQuest } from '../../lib/adventureRadar'
import type { RouteSummary } from './types'
import { googleMapsDirectionsUrl } from './DirectionsLayer'

type SaveState = 'checking' | 'not_saved' | 'saving' | 'saved'
type CompletionState = 'checking' | 'not_done' | 'completing' | 'done'
/** Three tiers: compact card → detail sheet → route sheet (after LET'S GO). */
type View = 'compact' | 'detail' | 'route'

interface Props {
  quest: RankedQuest
  routeSummary: RouteSummary | null
  routeDisabled: boolean
  onShowRoute: () => void
  onClose: () => void
  onNext?: () => void
  /** True when we don't have a real GPS fix — distances are estimates. */
  locationApproximate?: boolean
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
  routeSummary,
  routeDisabled,
  onShowRoute,
  onClose,
  onNext,
  locationApproximate = false,
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
    // Compute + draw the in-app route immediately (needs a real origin).
    if (!routeDisabled) onShowRoute()
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
  const distLabel = locationApproximate
    ? `~${formatDistance(quest.distance_km * 1000)} away (approx)`
    : `${formatDistance(quest.distance_km * 1000)} away`
  const isDone = completionState === 'done'
  const saveBusy = saveState === 'checking' || saveState === 'saving' || saveState === 'saved'

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
              <span className={`quest-route__eta${routeSummary ? '' : ' quest-route__eta--muted'}`}>
                {routeSummary
                  ? `${routeSummary.distanceText} · ${routeSummary.durationText} drive`
                  : routeDisabled
                    ? `${distLabel} · enable location for an in-app route`
                    : distLabel}
              </span>
            </div>

            <div className="quest-sheet__actions">
              {/* Start Route only once the in-app route is actually ready */}
              {routeSummary && (
                <button type="button" className="quest-sheet__primary" onClick={onShowRoute}>
                  Start Route
                </button>
              )}
              <a
                className={routeSummary ? undefined : 'quest-sheet__primary'}
                href={googleMapsDirectionsUrl({ lat: quest.lat, lng: quest.lng })}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Google Maps
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
