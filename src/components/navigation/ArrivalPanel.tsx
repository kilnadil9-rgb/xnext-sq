import { useRef, useState } from 'react'
import { questCompletionService } from '../../services/questCompletionService'
import { dreamListService } from '../../services/dreamListService'
import { shareQuest } from '../../utils/shareQuest'
import type { RankedQuest } from '../../lib/adventureRadar'

/**
 * ArrivalPanel — the celebration moment (Goal 6).
 *
 * Slides up AFTER the user has stopped (the orchestrator gates on speed), so
 * it never interrupts driving. All actions reuse existing XNEXT services —
 * check-in is questCompletionService (idempotent), share is the shared
 * shareQuest util, Save Memory is the Dream List.
 */

interface ArrivalPanelProps {
  quest: RankedQuest | null
  destinationTitle: string
  onComplete: () => void
}

type CheckInState = 'idle' | 'saving' | 'done' | 'error'

export function ArrivalPanel({ quest, destinationTitle, onComplete }: ArrivalPanelProps) {
  const [checkIn, setCheckIn] = useState<CheckInState>('idle')
  const [saved, setSaved] = useState(false)
  const [shared, setShared] = useState(false)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [photoName, setPhotoName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleCheckIn = async () => {
    if (!quest || checkIn === 'saving' || checkIn === 'done') return
    setCheckIn('saving')
    const story = [
      note.trim() || null,
      rating > 0 ? `Rated ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : null,
    ]
      .filter(Boolean)
      .join(' — ')
    const result = await questCompletionService.completeQuest(quest.id, {
      story: story || null,
      sqScoreAtCompletion: quest.sq_score,
    })
    setCheckIn(result.error ? 'error' : 'done')
  }

  const handleShare = async () => {
    if (!quest) return
    const result = await shareQuest(quest)
    if (result !== 'cancelled' && result !== 'failed') setShared(true)
  }

  const handleSaveMemory = async () => {
    if (!quest || saved) return
    const result = await dreamListService.addToDreamList(quest.id)
    if (!result.error || /duplicate|unique/i.test(result.error ?? '')) setSaved(true)
  }

  return (
    <div className="nav2-arrival" role="dialog" aria-label="Adventure complete">
      <div className="nav2-arrival__burst" aria-hidden>
        <span /><span /><span /><span /><span /><span />
      </div>

      <div className="nav2-arrival__check" aria-hidden>✓</div>
      <p className="nav2-arrival__eyebrow">Adventure Complete</p>
      <h2 className="nav2-arrival__title">
        Welcome to
        <br />
        {destinationTitle}
      </h2>

      <div className="nav2-arrival__stars" role="radiogroup" aria-label="Rate this experience">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`nav2-arrival__star${n <= rating ? ' nav2-arrival__star--on' : ''}`}
            onClick={() => setRating(n === rating ? 0 : n)}
          >
            ★
          </button>
        ))}
      </div>

      <div className="nav2-arrival__actions">
        <button
          type="button"
          className="nav2-arrival__action nav2-arrival__action--primary"
          onClick={handleCheckIn}
          disabled={!quest || checkIn === 'saving'}
        >
          {checkIn === 'done' ? '✓ Checked In' : checkIn === 'saving' ? 'Checking in…' : '📍 Check In'}
        </button>
        <button
          type="button"
          className="nav2-arrival__action"
          onClick={() => fileRef.current?.click()}
        >
          {photoName ? '✓ Photo Ready' : '📷 Take Photo'}
        </button>
        <button type="button" className="nav2-arrival__action" onClick={handleShare}>
          {shared ? '✓ Shared' : '↗ Share'}
        </button>
        <button
          type="button"
          className="nav2-arrival__action"
          onClick={handleSaveMemory}
          disabled={!quest}
        >
          {saved ? '✓ Saved' : '♡ Save Memory'}
        </button>
        <button
          type="button"
          className="nav2-arrival__action"
          onClick={() => setNoteOpen((v) => !v)}
          aria-expanded={noteOpen}
        >
          ✎ Add Note
        </button>
      </div>

      {noteOpen && (
        <textarea
          className="nav2-arrival__note"
          rows={2}
          maxLength={280}
          placeholder="What made this adventure memorable?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      {checkIn === 'error' && (
        <p className="nav2-arrival__error" role="alert">
          Check-in didn't save — try again in a moment.
        </p>
      )}

      {/* Hidden camera input — native capture on mobile, picker on desktop. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
      />

      <button type="button" className="nav2-arrival__complete" onClick={onComplete}>
        Complete Journey
      </button>
    </div>
  )
}
