/**
 * Journey Pulse — private momentum pill + expandable detail panel.
 *
 * Shows whether the explorer's personal journey has been quiet, steady, or
 * gaining momentum. PRIVATE by design: never a ranking, never compared with
 * other explorers, never a wellness score. Gentle language only — the copy
 * lives in lib/journeyPulse (single source of truth).
 */
import { useEffect, useState } from 'react'
import { useJourneyPulse } from '../../hooks/useJourneyPulse'
import {
  JOURNEY_PULSE_STATE_LABEL,
  pulseAriaLabel,
} from '../../lib/journeyPulse'
import { track } from '../../lib/analytics'

interface Props {
  /** Close the People sheet cleanly (used by "Discover Something Nearby"). */
  onClose: () => void
}

export function JourneyPulsePill({ onClose }: Props) {
  const { pulse, loading, error } = useJourneyPulse()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!loading && pulse) {
      // State + trend only — never the underlying activity ledger.
      track('journey_pulse_viewed', {
        state: pulse.result.state,
        trend: pulse.result.trend,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Loading: skeleton — never a temporary "0".
  if (loading) {
    return (
      <div
        className="mx-4 mb-3 h-[52px] animate-pulse rounded-2xl border border-white/10 bg-white/5 motion-reduce:animate-none"
        aria-label="Journey Pulse loading"
      />
    )
  }

  // Failure: never block the rest of the sheet.
  if (error || !pulse) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-sm text-white/70">Journey Pulse unavailable</p>
        <p className="text-xs text-white/40">Your Journey history is still safe.</p>
      </div>
    )
  }

  const { result, breakdown } = pulse
  const isNew = result.contributingActivityCount === 0 && result.value === 0

  const trendGlyph =
    result.trend === 'rising' ? '▲' : result.trend === 'cooling' ? '·' : '—'
  const trendLabel =
    result.trend === 'rising'
      ? 'Rising'
      : result.trend === 'cooling'
        ? 'Quieter'
        : 'Steady'

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) {
      track('journey_pulse_details_opened', {
        state: result.state,
        trend: result.trend,
      })
    }
  }

  const discoverNearby = () => {
    track('journey_pulse_discover_nearby_selected', { state: result.state })
    onClose() // returns the explorer to the Adventure Radar cleanly
  }

  return (
    <div className="mx-4 mb-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={pulseAriaLabel(result)}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-[#f97316]/25 bg-gradient-to-r from-[#f97316]/10 to-transparent px-4 py-2.5 text-left transition-colors hover:border-[#f97316]/40 motion-reduce:transition-none"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-white/50">
          Journey<br />Pulse
        </span>
        <span className="text-2xl font-black tabular-nums text-white" aria-hidden="true">
          {result.value}
        </span>
        <span
          className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-[#fdba74]"
          aria-hidden="true"
        >
          {trendGlyph} {trendLabel} · {JOURNEY_PULSE_STATE_LABEL[result.state]}
        </span>
        <span className="ml-auto flex-1 truncate text-right text-[11px] text-white/45" aria-hidden="true">
          {isNew
            ? 'Begins with your first real-world experience'
            : result.explanation}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">
            {result.value} — {JOURNEY_PULSE_STATE_LABEL[result.state]}
          </p>
          <p className="mt-1 text-xs text-white/60">{result.explanation}</p>

          {isNew ? (
            <p className="mt-3 text-xs text-white/50">
              Your Journey Pulse begins when you complete your first real-world
              experience.
            </p>
          ) : result.contributingActivityCount === 0 ? (
            <p className="mt-3 text-xs text-white/50">
              One new experience can start your momentum again. Your past
              achievements remain part of your Journey.
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                What moved your pulse
              </p>
              <ul className="space-y-1 text-xs text-white/70">
                {breakdown.verifiedCompletions > 0 && (
                  <li>✓ {breakdown.verifiedCompletions} verified {breakdown.verifiedCompletions === 1 ? 'experience' : 'experiences'}</li>
                )}
                {breakdown.dreamListCompletions > 0 && (
                  <li>✓ {breakdown.dreamListCompletions} Dream List {breakdown.dreamListCompletions === 1 ? 'completion' : 'completions'}</li>
                )}
                {breakdown.explorerNotes > 0 && (
                  <li>✓ {breakdown.explorerNotes} Explorer {breakdown.explorerNotes === 1 ? 'Note' : 'Notes'}</li>
                )}
                {breakdown.markersPlaced > 0 && (
                  <li>✓ {breakdown.markersPlaced} {breakdown.markersPlaced === 1 ? 'marker' : 'markers'} placed</li>
                )}
                {breakdown.markersDiscovered > 0 && (
                  <li>✓ {breakdown.markersDiscovered} {breakdown.markersDiscovered === 1 ? 'marker' : 'markers'} discovered</li>
                )}
              </ul>
              <p className="mt-1.5 text-[11px] text-white/35">
                Last {breakdown.windowDays} days
              </p>
            </div>
          )}

          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/40">
            Journey Pulse reflects your recent exploration momentum. It is
            private and is not compared with other explorers.
          </p>

          <button
            type="button"
            onClick={discoverNearby}
            className="mt-3 min-h-[44px] w-full rounded-xl border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2 text-sm font-medium text-[#fdba74] transition-colors hover:bg-[#f97316]/20 motion-reduce:transition-none"
          >
            Discover Something Nearby
          </button>
        </div>
      )}
    </div>
  )
}
