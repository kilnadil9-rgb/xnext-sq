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
}

/** Bottom-sheet preview for the selected quest, with Dream List save. */
export function QuestPreviewCard({
  quest,
  routeSummary,
  routeDisabled,
  onShowRoute,
  onClose,
}: Props) {
  const [saveState, setSaveState] = useState<SaveState>('checking')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [completionState, setCompletionState] =
    useState<CompletionState>('checking')

  useEffect(() => {
    let cancelled = false
    setSaveState('checking')
    setCompletionState('checking')
    setSaveError(null)

    dreamListService.getDreamListItemByQuestId(quest.id).then((result) => {
      if (cancelled) return
      if (result.error) {
        // Treat as not saved; surface error only on an actual save attempt.
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

  const handleComplete = async () => {
    setCompletionState('completing')
    setSaveError(null)
    const result = await questCompletionService.completeQuest(quest.id, {
      sqScoreAtCompletion: quest.sq_score,
    })
    if (result.error) {
      setCompletionState('not_done')
      setSaveError(result.error)
      return
    }
    setCompletionState('done')
  }

  const handleSave = async () => {
    setSaveState('saving')
    setSaveError(null)
    const result = await dreamListService.addToDreamList(quest.id)
    if (result.error) {
      // Unique-violation = already saved elsewhere; treat as saved.
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

      <div className="quest-sheet__actions">
        <button
          type="button"
          className="quest-sheet__primary"
          disabled={saveState === 'checking' || saveState === 'saving' || saveState === 'saved'}
          onClick={handleSave}
        >
          {saveState === 'saved'
            ? '✓ On Dream List'
            : saveState === 'saving'
              ? 'Saving…'
              : saveState === 'checking'
                ? '…'
                : 'Save to Dream List'}
        </button>
        <Link to={`/dashboard/quests/${quest.id}`} className="quest-sheet__link">
          Details
        </Link>
      </div>
      <div className="quest-sheet__actions">
        <button
          type="button"
          className={
            completionState === 'done' ? 'quest-sheet__done' : undefined
          }
          disabled={
            completionState === 'checking' || completionState === 'completing'
          }
          onClick={completionState === 'done' ? undefined : handleComplete}
        >
          {completionState === 'done'
            ? '🏆 Completed'
            : completionState === 'completing'
              ? 'Completing…'
              : completionState === 'checking'
                ? '…'
                : 'Mark complete'}
        </button>
      </div>
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
    </div>
  )
}
