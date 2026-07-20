import { memo, useMemo } from 'react'
import { formatDistance } from '../../lib/distance'
import type { NavProgress } from './navTypes'

/**
 * NavigationHUD — premium glass status bar (Goal 9).
 * ETA · remaining distance · speed · compass · voice + recenter + end.
 * Pure presentation; memoized so it renders only when its numbers change.
 */

interface NavigationHUDProps {
  progress: NavProgress | null
  /** GPS speed in m/s (null → speed chip hidden). */
  speedMps: number | null
  muted: boolean
  onToggleMute: () => void
  /** Shown only while the chase camera is paused (user dragged the map). */
  showRecenter: boolean
  onRecenter: () => void
  onEnd: () => void
  rerouting: boolean
}

export const NavigationHUD = memo(function NavigationHUD({
  progress,
  speedMps,
  muted,
  onToggleMute,
  showRecenter,
  onRecenter,
  onEnd,
  rerouting,
}: NavigationHUDProps) {
  const eta = useMemo(() => {
    if (!progress) return '—'
    const t = new Date(Date.now() + progress.remainingSeconds * 1000)
    return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }, [progress])

  const speedMph = speedMps !== null && speedMps >= 0 ? Math.round(speedMps * 2.23694) : null

  return (
    <div className="nav2-hud" role="region" aria-label="Navigation status">
      {rerouting && (
        <div className="nav2-hud__rerouting" role="status">
          <span className="nav2-hud__rerouting-dot" aria-hidden />
          Recalculating route…
        </div>
      )}

      <div className="nav2-hud__bar">
        <div className="nav2-hud__stat">
          <span className="nav2-hud__stat-value">{eta}</span>
          <span className="nav2-hud__stat-label">arrival</span>
        </div>
        <div className="nav2-hud__stat">
          <span className="nav2-hud__stat-value">
            {progress ? formatDistance(progress.remainingMeters) : '—'}
          </span>
          <span className="nav2-hud__stat-label">to go</span>
        </div>
        {speedMph !== null && (
          <div className="nav2-hud__stat">
            <span className="nav2-hud__stat-value">{speedMph}</span>
            <span className="nav2-hud__stat-label">mph</span>
          </div>
        )}

        <div
          className="nav2-hud__compass"
          aria-label={`Heading ${Math.round(progress?.routeBearing ?? 0)} degrees`}
        >
          <span
            className="nav2-hud__compass-needle"
            style={{ transform: `rotate(${-(progress?.routeBearing ?? 0)}deg)` }}
            aria-hidden
          >
            ▲
          </span>
        </div>

        <button
          type="button"
          className={`nav2-hud__btn${muted ? '' : ' nav2-hud__btn--active'}`}
          onClick={onToggleMute}
          aria-pressed={!muted}
          aria-label={muted ? 'Unmute voice guidance' : 'Mute voice guidance'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {showRecenter && (
          <button
            type="button"
            className="nav2-hud__btn nav2-hud__btn--pulse"
            onClick={onRecenter}
            aria-label="Recenter camera"
          >
            ◎
          </button>
        )}
        <button
          type="button"
          className="nav2-hud__btn nav2-hud__btn--end"
          onClick={onEnd}
          aria-label="End navigation"
        >
          ✕
        </button>
      </div>
    </div>
  )
})
