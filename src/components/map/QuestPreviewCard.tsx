import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { dreamListService } from '../../services/dreamListService'
import {
  questCompletionService,
  explorerNoteWordCount,
  EXPLORER_NOTE_MAX_WORDS,
} from '../../services/questCompletionService'
import type { ExplorerTags } from '../../lib/supabase/types'
import { isVoiceMuted, setVoiceMuted, voiceSupported } from '../../lib/voiceNav'
import { formatDistance, haversineMeters } from '../../lib/distance'
import type { RankedQuest } from '../../lib/adventureRadar'
import type { LatLng } from './types'
import {
  googleMapsDirectionsUrl,
  type RouteStatus,
  type RouteResult,
} from './DirectionsLayer'
import { listingBadge } from '../../services/listingService'
import { VerifiedBadge } from '../ui/VerifiedBadge'
import { explorerProofLabel } from '../../lib/trust'
import { seasonBadges, seasonalStatusLabel } from '../../lib/season'
import { shareQuest } from '../../utils/shareQuest'

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
  /** Phase 2: activate the in-app route preview to a destination. */
  onRequestRoute?: (dest: LatLng) => void
  /** Phase 2: clear the in-app route preview. */
  onClearRoute?: () => void
  /** Prompt the user to enable location (used when no GPS fix). */
  onRequestLocation?: () => void
  /** Live status of the in-app route preview (from MapScreen/RouteLayer). */
  routeStatus?: RouteStatus
  /** Distance + ETA once the route resolves. */
  routeResult?: RouteResult | null
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
  onRequestRoute,
  onClearRoute,
  onRequestLocation,
  routeStatus = 'idle',
  routeResult = null,
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

  // Explorer Note (026): one 9-word tip + one-tap tags, captured in the
  // celebration. Experience Graph input — not a public review.
  const [completionId, setCompletionId] = useState<string | null>(null)
  const [exNote, setExNote] = useState('')
  const [exTags, setExTags] = useState<ExplorerTags>({})
  const [exState, setExState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [exError, setExError] = useState<string | null>(null)

  // Voice navigation mute/resume (RC4) — persisted preference.
  const [voiceMuted, setVoiceMutedState] = useState<boolean>(() => isVoiceMuted())
  const toggleVoice = () => {
    const next = !voiceMuted
    setVoiceMuted(next)
    setVoiceMutedState(next)
  }

  // Share (XNEXT Share Phase): lightweight confirmation toast, no error UI —
  // cancelled/failed shares just fall through silently (never blocks the user).
  const [shareToast, setShareToast] = useState<string | null>(null)
  const shareToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When the selected adventure changes (e.g. NEXT), collapse back to compact.
  useEffect(() => {
    let cancelled = false
    setView('compact')
    setSaveState('checking')
    setCompletionState('checking')
    setSaveError(null)
    setShowCompleteForm(false)
    setCelebrating(false)
    setCompletionId(null)
    setExNote('')
    setExTags({})
    setExState('idle')
    setExError(null)

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

  // Clear any pending toast timer on unmount so it never fires against a
  // stale/removed component.
  useEffect(() => {
    return () => {
      if (shareToastTimer.current) clearTimeout(shareToastTimer.current)
    }
  }, [])

  const showShareToast = (message: string) => {
    setShareToast(message)
    if (shareToastTimer.current) clearTimeout(shareToastTimer.current)
    shareToastTimer.current = setTimeout(() => setShareToast(null), 2200)
  }

  const handleShare = async () => {
    const result = await shareQuest(quest)
    if (result === 'shared') showShareToast('Share ready')
    else if (result === 'copied') showShareToast('Copied to clipboard')
    // 'cancelled' and 'failed' are silent — sharing should never block the user.
  }

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
    // Primary action is now the in-app preview, not Google Maps.
    onRequestRoute?.(navTarget)
  }

  const backToCompact = () => {
    setShowCompleteForm(false)
    setView('compact')
    onClearRoute?.()
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
    setCompletionId(result.data?.id ?? null)
    setCompletionState('done')
    setShowCompleteForm(false)
    setCelebrating(true)
  }

  // Explorer Note helpers — tap a chip again to clear it.
  const toggleTag = <K extends keyof ExplorerTags>(key: K, value: ExplorerTags[K]) => {
    setExTags((prev) => {
      if (prev[key] === value) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  const exWords = explorerNoteWordCount(exNote)
  const exOverLimit = exWords > EXPLORER_NOTE_MAX_WORDS
  const exHasContent = exNote.trim().length > 0 || Object.keys(exTags).length > 0

  const handleSaveExplorerNote = async () => {
    if (!completionId) return
    setExState('saving')
    setExError(null)
    const res = await questCompletionService.addExplorerNote(completionId, {
      note: exNote,
      tags: exTags,
    })
    if (res.error) {
      setExState('idle')
      setExError(res.error)
      return
    }
    setExState('saved')
  }

  const handleNextFromCelebration = () => {
    setCelebrating(false)
    if (onNext) onNext()
    else onClose()
  }

  const icon = CLASS_ICON[quest.experience_class] ?? '📍'
  // Listing/quest image (migration 020 surfaces media_urls through the RPC).
  // Optional everywhere: pre-migration rows simply fall back to the icon.
  const thumb =
    Array.isArray(quest.media_urls) && quest.media_urls.length > 0
      ? quest.media_urls[0]
      : null
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

        {/* ── Explorer Note (026): help the next explorer. One note, 9 words,
            plus one-tap tags. Skippable — never blocks the celebration. ── */}
        {completionId && exState !== 'saved' && (
          <div className="explorer-note">
            <p className="explorer-note__title">Now help the next explorer</p>
            <p className="explorer-note__hint">
              One short note — the single most useful thing you learned.
            </p>
            <input
              className="explorer-note__input"
              type="text"
              value={exNote}
              maxLength={100}
              placeholder='e.g. "Parking fills after noon"'
              onChange={(e) => setExNote(e.target.value)}
              aria-label={`Explorer note, maximum ${EXPLORER_NOTE_MAX_WORDS} words`}
            />
            <p className={`explorer-note__count${exOverLimit ? ' is-over' : ''}`}>
              {exWords}/{EXPLORER_NOTE_MAX_WORDS} words
            </p>

            <div className="explorer-note__tags">
              {(
                [
                  { key: 'difficulty', label: 'Difficulty', options: [
                    { v: 'easy', t: 'Easy' }, { v: 'moderate', t: 'Moderate' }, { v: 'hard', t: 'Hard' },
                  ] },
                  { key: 'crowds', label: 'Crowds', options: [
                    { v: 'quiet', t: 'Quiet' }, { v: 'moderate', t: 'Moderate' }, { v: 'busy', t: 'Busy' },
                  ] },
                  { key: 'parking', label: 'Parking', options: [
                    { v: 'easy', t: 'Easy' }, { v: 'limited', t: 'Limited' }, { v: 'difficult', t: 'Difficult' },
                  ] },
                  { key: 'worth_returning', label: 'Worth returning?', options: [
                    { v: 'absolutely', t: 'Absolutely' }, { v: 'maybe', t: 'Maybe' }, { v: 'probably_not', t: 'Probably not' },
                  ] },
                ] as const
              ).map((group) => (
                <div key={group.key} className="explorer-note__group" role="group" aria-label={group.label}>
                  <span className="explorer-note__group-label">{group.label}</span>
                  {group.options.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      aria-pressed={exTags[group.key] === o.v}
                      className={`explorer-note__chip${exTags[group.key] === o.v ? ' is-on' : ''}`}
                      onClick={() => toggleTag(group.key, o.v)}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
              ))}
              <div className="explorer-note__group" role="group" aria-label="Family friendly">
                <span className="explorer-note__group-label">Family friendly</span>
                {([{ v: true, t: 'Yes' }, { v: false, t: 'No' }] as const).map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    aria-pressed={exTags.family_friendly === o.v}
                    className={`explorer-note__chip${exTags.family_friendly === o.v ? ' is-on' : ''}`}
                    onClick={() => toggleTag('family_friendly', o.v)}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
              <div className="explorer-note__group" role="group" aria-label="Dog friendly">
                <span className="explorer-note__group-label">Dog friendly</span>
                {([{ v: true, t: 'Yes' }, { v: false, t: 'No' }] as const).map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    aria-pressed={exTags.dog_friendly === o.v}
                    className={`explorer-note__chip${exTags.dog_friendly === o.v ? ' is-on' : ''}`}
                    onClick={() => toggleTag('dog_friendly', o.v)}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
            </div>

            {exError && (
              <p className="quest-sheet__error" role="alert">{exError}</p>
            )}
            <div className="explorer-note__actions">
              <button
                type="button"
                className="quest-sheet__primary"
                disabled={!exHasContent || exOverLimit || exState === 'saving'}
                onClick={handleSaveExplorerNote}
              >
                {exState === 'saving' ? 'Saving…' : 'Share note'}
              </button>
            </div>
          </div>
        )}
        {exState === 'saved' && (
          <p className="explorer-note__thanks" role="status">
            🧭 Noted — the next explorer thanks you.
          </p>
        )}

        <div className="quest-sheet__actions">
          <Link to="/dashboard/completed" className="quest-sheet__view-memory">
            View in Memories
          </Link>
          <button type="button" className="quest-sheet__primary" onClick={handleNextFromCelebration}>
            Next adventure →
          </button>
        </div>
        <div className="quest-sheet__actions">
          <button type="button" onClick={handleShare}>
            📤 Share this experience
          </button>
        </div>
        {shareToast && (
          <div className="quest-share-toast" role="status">{shareToast}</div>
        )}
      </div>
    )
  }

  /* ── Tier 1: compact card (default) ───────────────────────────────────── */
  if (view === 'compact') {
    return (
      <div
        className={`quest-compact${quest.verified_location ? ' quest-compact--verified' : ''}`}
        role="dialog"
        aria-label={quest.title}
      >
        <button
          type="button"
          className="quest-compact__body"
          onClick={() => setView('detail')}
          aria-label={`Open details for ${quest.title}`}
        >
          {thumb ? (
            <img
              className="quest-compact__icon"
              src={thumb}
              alt=""
              loading="lazy"
              style={{ objectFit: 'cover', borderRadius: 8 }}
            />
          ) : (
            <span className="quest-compact__icon" aria-hidden="true">{icon}</span>
          )}
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
            <span className="quest-compact__title">
              {quest.title}
              {quest.verified_location && (
                <>
                  {' '}
                  <VerifiedBadge size={14} />
                </>
              )}
            </span>
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

            {/* In-app route preview status (line is drawn on the Home map). */}
            <div className="quest-route__stats">
              {userLocation === null ? (
                <span className="quest-route__eta quest-route__eta--muted">
                  📍 Enable location to preview your route
                </span>
              ) : routeStatus === 'loading' ? (
                <span className="quest-route__eta quest-route__eta--muted">
                  Calculating route…
                </span>
              ) : routeStatus === 'ok' && routeResult ? (
                <span className="quest-route__eta">
                  🚗 {routeResult.durationText} · {routeResult.distanceText}
                </span>
              ) : routeStatus === 'denied' ? (
                <span className="quest-route__eta quest-route__eta--muted">
                  Route preview needs Google Directions enabled.
                  {distanceMeters !== null ? ` ${distLabel}.` : ''}
                </span>
              ) : routeStatus === 'error' ? (
                <span className="quest-route__eta quest-route__eta--muted">
                  Couldn’t build a route.
                  {distanceMeters !== null ? ` ${distLabel}.` : ''}
                </span>
              ) : (
                <span className={`quest-route__eta${distanceMeters !== null ? '' : ' quest-route__eta--muted'}`}>
                  {distLabel}
                </span>
              )}
            </div>

            {hasParking && (
              <p className="quest-route__parking">
                🅿️ Routing to parking — a short walk to the experience from
                there.
              </p>
            )}

            {userLocation === null && (
              <div className="quest-sheet__actions">
                <button
                  type="button"
                  className="quest-sheet__primary"
                  onClick={() => onRequestLocation?.()}
                >
                  Enable location
                </button>
              </div>
            )}

            {/* Secondary fallback — full turn-by-turn lives in Google Maps. */}
            <div className="quest-sheet__actions">
              <a
                className="quest-route__secondary"
                href={googleMapsDirectionsUrl(navTarget)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.8rem',
                  opacity: 0.75,
                  textDecoration: 'underline',
                }}
              >
                Open full navigation in Google Maps ↗
              </a>
            </div>

            {saveError && (
              <p className="quest-sheet__error" role="alert">{saveError}</p>
            )}

            <div className="quest-sheet__actions quest-sheet__actions--compact">
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
              <button type="button" onClick={handleShare} aria-label="Share this experience">
                📤 Share
              </button>
              {voiceSupported() && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-pressed={!voiceMuted}
                  aria-label={voiceMuted ? 'Resume voice guidance' : 'Mute voice guidance'}
                >
                  {voiceMuted ? '🔇 Voice off' : '🔊 Voice on'}
                </button>
              )}
            </div>
            {shareToast && (
              <div className="quest-share-toast" role="status">{shareToast}</div>
            )}
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

      {thumb && (
        <img
          className="quest-sheet__hero"
          src={thumb}
          alt={quest.title}
          loading="lazy"
          style={{
            width: '100%',
            height: 160,
            objectFit: 'cover',
            borderRadius: 12,
            marginBottom: 12,
          }}
        />
      )}
      {/* Partner presentation: extra photos (up to 3 total) as a small strip
          under the hero. Only renders when a listing actually has them. */}
      {Array.isArray(quest.media_urls) && quest.media_urls.length > 1 && (
        <div className="quest-sheet__gallery">
          {quest.media_urls.slice(1, 3).map((url) => (
            <img key={url} src={url} alt="" loading="lazy" />
          ))}
        </div>
      )}

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
      <h2>
        {quest.title}
        {quest.verified_location && (
          <>
            {' '}
            <VerifiedBadge withLabel label="Verified by explorers" size={18} />
          </>
        )}
      </h2>
      {/* Social proof — real counts only; renders nothing at zero. */}
      {explorerProofLabel(quest) && (
        <p className="quest-sheet__proof">{explorerProofLabel(quest)}</p>
      )}
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
      {/* Partner links (023): the RPC only returns these on APPROVED published
          listings, and ticket_url only for the Monthly Local Partner tier —
          they can never appear on regular free/user quests. */}
      {(quest.ticket_url || quest.external_url) && (
        <div className="quest-sheet__actions quest-sheet__actions--compact">
          {quest.ticket_url && (
            <a
              className="quest-sheet__primary quest-sheet__tickets"
              href={quest.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              🎟️ Buy Tickets
            </a>
          )}
          {quest.external_url && (
            <a
              className="quest-sheet__weblink"
              href={quest.external_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit website ↗
            </a>
          )}
        </div>
      )}
      {isDone && (
        <div className="quest-sheet__completed-banner">
          🏆 Completed — saved to your Memories
        </div>
      )}
      {saveError && (
        <p className="quest-sheet__error" role="alert">{saveError}</p>
      )}

      <div className="quest-sheet__actions quest-sheet__actions--compact">
        <button type="button" disabled={saveBusy} onClick={handleSave}>
          {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : '♡ Dream List'}
        </button>
        <button type="button" className="quest-sheet__primary" onClick={handleStart}>
          LET’S GO
        </button>
        <button type="button" onClick={handleShare} aria-label="Share this experience">
          📤 Share
        </button>
      </div>
      {shareToast && (
        <div className="quest-share-toast" role="status">{shareToast}</div>
      )}

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
