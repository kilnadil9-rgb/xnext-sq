import { useCallback, useEffect, useState } from 'react'
import type { ChaseTeaser } from '../../services/chaseService'
import { chaseService } from '../../services/chaseService'
import { markerService } from '../../services/markerService'
import type { ExperienceMarkerView } from '../../lib/supabase/types'
import type { LatLng } from '../map/types'
import { haversineMeters } from '../../lib/distance'
import { speak } from '../../lib/voiceNav'
import {
  MARKER_SIGNALS,
  RARITY_COLOR,
  RARITY_LABEL,
  chaseDistanceLabel,
  communityById,
  markerTypeConfig,
  rarityForTier,
  type MarkerSignalKind,
} from '../../lib/discoveryCommunities'

/**
 * ChaseUnlockSheet — the marker unlock experience.
 *
 * Locked (too far): the tease. Type, community, coarse distance — never the
 * content. The only actions are "chase it" or walk away.
 *
 * In range: unlock → dim → "An explorer left something for you..." → reveal
 * animation → the contribution → usefulness signals → the give-back prompt.
 *
 * The distance check here is UX only — discover_explorer_marker re-verifies
 * proximity/completion inside the database.
 */

/** Mirrors the DB default experience radius in discover_explorer_marker. */
const UNLOCK_RADIUS_M = 500

type Stage = 'locked' | 'ready' | 'unlocking' | 'revealed' | 'error'

interface ChaseUnlockSheetProps {
  teaser: ChaseTeaser
  userPosition: LatLng | null
  onClose: () => void
  /** "Chase it" → open the map focused on this experience. */
  onChase: (questId: string) => void
  /** Give-back CTA → completion + placement flow for this experience. */
  onGiveBack: (questId: string) => void
}

export function ChaseUnlockSheet({
  teaser,
  userPosition,
  onClose,
  onChase,
  onGiveBack,
}: ChaseUnlockSheetProps) {
  const typeCfg = markerTypeConfig(teaser.marker_type)
  const community = communityById(teaser.community)
  const rarity = rarityForTier(teaser.tier)

  const distanceM = userPosition
    ? haversineMeters(userPosition, { lat: teaser.lat, lng: teaser.lng })
    : null
  const inRange = teaser.discovered_by_me || (distanceM !== null && distanceM <= UNLOCK_RADIUS_M)

  const [stage, setStage] = useState<Stage>(
    teaser.discovered_by_me ? 'unlocking' : inRange ? 'ready' : 'locked',
  )
  const [content, setContent] = useState<ExperienceMarkerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signalsSent, setSignalsSent] = useState<Set<MarkerSignalKind>>(new Set())

  const reveal = useCallback(async () => {
    const markers = await markerService.getExperienceMarkers(teaser.quest_id)
    const mine = markers.data?.find((m) => m.id === teaser.marker_id) ?? null
    setContent(mine)
    setStage('revealed')
  }, [teaser.quest_id, teaser.marker_id])

  // Already unlocked on a previous visit → skip ceremony, show the keepsake.
  useEffect(() => {
    if (!(teaser.discovered_by_me && stage === 'unlocking')) return
    const t = window.setTimeout(() => void reveal(), 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUnlock = async () => {
    setStage('unlocking')
    setError(null)
    const result = await markerService.discoverMarker(teaser.marker_id, userPosition)
    if (result.error) {
      setError(result.error)
      setStage('error')
      return
    }
    // The moment: dim, whisper, reveal.
    speak('An explorer left something for you.')
    window.setTimeout(() => void reveal(), 1400)
  }

  const handleSignal = async (kind: MarkerSignalKind) => {
    if (signalsSent.has(kind)) return
    setSignalsSent((prev) => new Set(prev).add(kind))
    await chaseService.signalMarker(teaser.marker_id, kind)
  }

  return (
    <div className="chase-sheet__backdrop" role="dialog" aria-label={`${typeCfg.label} marker`}>
      <div className={`chase-sheet${stage === 'unlocking' ? ' chase-sheet--dim' : ''}`}>
        <button type="button" className="chase-sheet__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="chase-sheet__head">
          <span className="chase-sheet__type-icon" aria-hidden>
            {stage === 'locked' ? '❓' : typeCfg.icon}
          </span>
          <div>
            {community && (
              <p className="chase-sheet__community">
                {community.icon} {community.label}
              </p>
            )}
            <p className="chase-sheet__type">{typeCfg.label}</p>
            <p className="chase-sheet__rarity" style={{ color: RARITY_COLOR[rarity] }}>
              {RARITY_LABEL[rarity]} Marker
            </p>
          </div>
        </div>

        <p className="chase-sheet__quest">{teaser.quest_title}</p>

        {stage === 'locked' && (
          <>
            <p className="chase-sheet__tease">
              {distanceM !== null
                ? chaseDistanceLabel(distanceM / 1000)
                : chaseDistanceLabel(teaser.distance_km)}
              {' · '}Reward: <strong>Unknown</strong>
            </p>
            <p className="chase-sheet__hint">
              An explorer left this here for whoever makes the trip. It only
              opens when you arrive.
            </p>
            <button
              type="button"
              className="chase-sheet__cta"
              onClick={() => onChase(teaser.quest_id)}
            >
              Chase it →
            </button>
          </>
        )}

        {stage === 'ready' && (
          <>
            <p className="chase-sheet__hint">You're here. Whatever it is, it's yours to open.</p>
            <button type="button" className="chase-sheet__cta chase-sheet__cta--pulse" onClick={handleUnlock}>
              Open the marker
            </button>
          </>
        )}

        {stage === 'unlocking' && (
          <p className="chase-sheet__whisper" role="status">
            An explorer left something for you…
          </p>
        )}

        {stage === 'error' && (
          <>
            <p className="chase-sheet__error" role="alert">{error}</p>
            <button
              type="button"
              className="chase-sheet__cta"
              onClick={() => onChase(teaser.quest_id)}
            >
              Take me there →
            </button>
          </>
        )}

        {stage === 'revealed' && (
          <div className="chase-sheet__reveal">
            {content ? (
              <>
                {content.photo_url && (
                  <img
                    className="chase-sheet__photo"
                    src={content.photo_url}
                    alt={`${typeCfg.label} left by ${content.explorer_name}`}
                  />
                )}
                {content.note && <p className="chase-sheet__note">“{content.note}”</p>}
                {!content.note && !content.photo_url && (
                  <p className="chase-sheet__note">
                    {content.explorer_name} marked this place as worth the trip.
                  </p>
                )}
                <p className="chase-sheet__byline">
                  — {content.explorer_name}
                  {content.level_name_at_placement ? ` · ${content.level_name_at_placement}` : ''}
                </p>

                <div className="chase-sheet__signals" role="group" aria-label="Was this worth it?">
                  {MARKER_SIGNALS.map((s) => (
                    <button
                      key={s.kind}
                      type="button"
                      className={`chase-sheet__signal${signalsSent.has(s.kind) ? ' chase-sheet__signal--sent' : ''}`}
                      onClick={() => handleSignal(s.kind)}
                      aria-pressed={signalsSent.has(s.kind)}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>

                <div className="chase-sheet__giveback">
                  <p>What would you like to leave for the next explorer?</p>
                  <button
                    type="button"
                    className="chase-sheet__cta"
                    onClick={() => onGiveBack(teaser.quest_id)}
                  >
                    Leave your contribution
                  </button>
                </div>
              </>
            ) : (
              <p className="chase-sheet__note">
                This marker is part of your journey now.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
