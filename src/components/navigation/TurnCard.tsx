import { memo } from 'react'
import { formatDistance } from '../../lib/distance'
import type { NavProgress, NavRoute } from './navTypes'

/**
 * TurnCard — floating turn-by-turn overlay (Goal 4).
 * Minimal glass card: direction icon, street, live distance, next maneuver.
 * Keyed by step index so step changes slide-in (Goal 10 micro animation).
 */

const MANEUVER_ICONS: Record<string, string> = {
  'turn-left': '⬅',
  'turn-sharp-left': '⬅',
  'turn-slight-left': '↖',
  'fork-left': '↖',
  'ramp-left': '↖',
  'keep-left': '↖',
  'turn-right': '➡',
  'turn-sharp-right': '➡',
  'turn-slight-right': '↗',
  'fork-right': '↗',
  'ramp-right': '↗',
  'keep-right': '↗',
  'uturn-left': '⤴',
  'uturn-right': '⤴',
  'roundabout-left': '↻',
  'roundabout-right': '↻',
  merge: '⤵',
  straight: '⬆',
}

function maneuverIcon(maneuver: string): string {
  return MANEUVER_ICONS[maneuver] ?? '⬆'
}

const MANEUVER_LABELS: Record<string, string> = {
  'turn-left': 'Left',
  'turn-sharp-left': 'Sharp left',
  'turn-slight-left': 'Bear left',
  'fork-left': 'Bear left',
  'ramp-left': 'Ramp left',
  'keep-left': 'Keep left',
  'turn-right': 'Right',
  'turn-sharp-right': 'Sharp right',
  'turn-slight-right': 'Bear right',
  'fork-right': 'Bear right',
  'ramp-right': 'Ramp right',
  'keep-right': 'Keep right',
  'uturn-left': 'U-turn',
  'uturn-right': 'U-turn',
  'roundabout-left': 'Roundabout',
  'roundabout-right': 'Roundabout',
  merge: 'Merge',
  straight: 'Continue',
}

function maneuverLabel(maneuver: string): string {
  return MANEUVER_LABELS[maneuver] ?? 'Continue'
}

interface TurnCardProps {
  route: NavRoute
  progress: NavProgress
}

export const TurnCard = memo(function TurnCard({ route, progress }: TurnCardProps) {
  // The upcoming maneuver is described by the step AFTER the one in progress;
  // on the final step we're heading to the destination itself.
  const next = route.steps[progress.stepIndex + 1]
  const icon = next ? maneuverIcon(next.maneuver) : '⚑'
  const label = next ? maneuverLabel(next.maneuver) : 'Arrive'
  const street = next ? next.streetName : 'Destination'

  // After this maneuver, what follows? (the "then" hint, Goal 4)
  const after = route.steps[progress.stepIndex + 2]

  return (
    <div className="nav2-turn-card" key={progress.stepIndex} role="status" aria-live="polite">
      <div className="nav2-turn-card__icon" aria-hidden>
        {icon}
      </div>
      <div className="nav2-turn-card__body">
        <div className="nav2-turn-card__label">{label}</div>
        <div className="nav2-turn-card__street" title={street}>
          {street}
        </div>
        <div className="nav2-turn-card__distance">
          {formatDistance(progress.metersToNextManeuver)}
        </div>
      </div>
      {after && (
        <div className="nav2-turn-card__then">
          <span aria-hidden>{maneuverIcon(after.maneuver)}</span>
          <span>then {maneuverLabel(after.maneuver).toLowerCase()}</span>
        </div>
      )}
    </div>
  )
})
