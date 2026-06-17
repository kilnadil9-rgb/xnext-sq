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

interface Props {
  quest: RankedQuest
  routeSummary: RouteSummary | null
  routeDisabled: boolean
  onShowRoute: () => void
  onClose: () => void
  onNext?: () => void
}

/** Placeholder reward — real XP economy lands later. */
function xpFor(quest: RankedQuest): number {
  return 100 + Math.round(quest.sq_score ?? 0)
}

/**
 * Bottom-sheet preview for the selected quest.
 *
 * Implements the adventure lifecycle (beginning → middle → ending):
 *   preview → Start Adventure → Complete / Not Today / Save For Later
 *   → completion records a Memory (quest_completions) → celebration
 *   → "Next adventure" suggested.
 *
 * Reuses existing services only (no schema changes): completeQuest records
 * the memory + notes (story) + sq_score; addToDreamList handles Save For
 * Later. Photo / rating / recommend / friends are future-ready UI.
 */
export function QuestPreviewCard({
  quest,
  routeSummary,
  routeDisabled,
  onShowRoute,
  onClose,
  onNext,
}: Props) {
  const [saveState, setSaveState] = useState<SaveState>('checking')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [completionState, setCompletionState] =
    useState<CompletionState>('checking')
  const [activeAdventure, setActiveAdventure] = useState(false)

  // Completion form + celebration
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [recommend, setRecommend] = useState<boolean | null>(null)
  const [withFriends, setWithFriends] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)

  useEffect(() => {
    let cancelled = false
    setSaveState('checking')
    setCompletionState('checking')
    setSaveError(null)
    setActiveAdventure(false)
    setShowCompleteForm(false)
    setCelebrating(false)

    dreamListService.getDreamListItemByQuestId(quest.id).then((result) => {
      if (cancelled) return
      if (result.error) {
        setSaveState('not_saved')
        return
      }
      setSaveState(result.data ? 'saved' : 'not_saved')
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
      if (/duplicate|unique/i.test(result.error)) {
        setSaveState('saved')
      } else {
        setSaveState('not_saved')
        setSaveError(result.error)
      }
      return
    }
    setSaveState('saved')
  }

  const handleStart = () => {
    setActiveAdventure(true)
    if (!routeSummary) onShowRoute()
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
          <button
            type="button"
            className="quest-sheet__primary"
            onClick={handleNextFromCelebration}
          >
            Next adventure →
          </button>
        </div>
      </div>
    )
  }

  const isDone = completionState === 'done'

  return (
    <div className="quest-sheet" role="dialog" aria-label={quest.title}>
      <button
        type="button"
        className="quest-sheet__close"
        aria-label="Close"
        onClick={onClose}
      >
        ✕
      </button>

      <h2>{quest.title}</h2>
      <p className="quest-sheet__meta">
        {quest.experience_class} · {formatDistance(quest.distance_km * 1000)}{' '}
        away
        {quest.location_name ? ` · ${quest.location_name}` : ''}
        {quest.sq_score !== null && (
          <span className="badge badge--sq"> SQ {Math.round(quest.sq_score)}</span>
        )}
        {quest.has_pulse && <span className="badge badge--pulse"> Pulse</span>}
      </p>
      {quest.description && (
        <p className="quest-sheet__description">{quest.description}</p>
      )}
      {routeSummary && (
        <p className="quest-sheet__route">
          {routeSummary.distanceText} · {routeSummary.durationText} walk
        </p>
      )}
      {saveError && (
        <p className="quest-sheet__error" role="alert">
          {saveError}
        </p>
      )}

      {/* ── Already completed earlier ─────────────────────────────────────── */}
      {isDone && !celebrating && (
        <>
          <div className="quest-sheet__completed-banner">
            🏆 Completed — saved to your Memories
          </div>
          <div className="quest-sheet__actions">
            <Link to="/dashboard/completed" className="quest-sheet__view-memory">
              View in Memories
            </Link>
            {onNext && (
              <button type="button" className="quest-sheet__primary" onClick={onNext}>
                Next adventure →
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Beginning: not started yet ────────────────────────────────────── */}
      {!isDone && !activeAdventure && (
        <div className="quest-sheet__actions">
          <button
            type="button"
            disabled={saveState === 'checking' || saveState === 'saving' || saveState === 'saved'}
            onClick={handleSave}
          >
            {saveState === 'saved'
              ? '✓ Saved'
              : saveState === 'saving'
                ? 'Saving…'
                : 'Save for Later'}
          </button>
          <button type="button" className="quest-sheet__primary" onClick={handleStart}>
            Let’s Go
          </button>
        </div>
      )}

      {/* ── Middle: adventure in progress ─────────────────────────────────── */}
      {!isDone && activeAdventure && !showCompleteForm && (
        <>
          <p className="quest-sheet__meta" style={{ textAlign: 'center', marginTop: 4 }}>
            Adventure started — the map is centered here. Finish when you’ve made it.
          </p>
          <div className="quest-sheet__actions">
            <button
              type="button"
              className="quest-sheet__primary"
              onClick={() => setShowCompleteForm(true)}
            >
              Complete Adventure
            </button>
          </div>
          <div className="quest-sheet__actions">
            <button type="button" onClick={onClose}>
              Not Today
            </button>
            <button
              type="button"
              disabled={saveState === 'saving' || saveState === 'saved'}
              onClick={handleSave}
            >
              {saveState === 'saved' ? '✓ Saved' : 'Save for Later'}
            </button>
          </div>
        </>
      )}

      {/* ── Completion form ───────────────────────────────────────────────── */}
      {!isDone && showCompleteForm && (
        <div className="quest-complete-form">
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

          {/* Future-ready fields — collected now, persisted in an upcoming update */}
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

      {/* ── Wayfinding (always available) ─────────────────────────────────── */}
      <div className="quest-sheet__actions">
        <button type="button" disabled={routeDisabled} onClick={onShowRoute}>
          Show route
        </button>
        <a
          href={googleMapsDirectionsUrl({ lat: quest.lat, lng: quest.lng })}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      </div>

      {(() => {
        const meta = (quest as unknown as { metadata?: Record<string, unknown> }).metadata || {}
        return (
          <div className="quest-sheet__meta text-xs mt-1 opacity-80">
            {meta.duration ? `Duration: ${String(meta.duration)} · ` : ''}
            {meta.source ? `Source: ${String(meta.source)}` : ''}
          </div>
        )
      })()}

      {onNext && !showCompleteForm && (
        <div className="quest-sheet__actions mt-2">
          <button type="button" onClick={onNext}>
            Skip — show me the next one
          </button>
        </div>
      )}
    </div>
  )
}
