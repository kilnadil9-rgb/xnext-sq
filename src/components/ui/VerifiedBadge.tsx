/**
 * VerifiedBadge — Phase 1 trust/safety polish.
 *
 * Blue checkmark shown near a quest title once its location is Verified
 * (>= 3 unique users completed the quest — migration 021). Styled like
 * creator verification: filled blue seal + white check.
 *
 * Self-contained (inline SVG + inline layout styles) so it renders
 * identically on the map cards (maps.css) and the Tailwind dashboard pages.
 */

interface VerifiedBadgeProps {
  /** Also render a text label next to the checkmark. */
  withLabel?: boolean
  /** Label text when withLabel is set (default "Verified Location"). */
  label?: string
  /** Icon size in px (default 16). */
  size?: number
}

export function VerifiedBadge({
  withLabel = false,
  label = 'Verified Location',
  size = 16,
}: VerifiedBadgeProps) {
  return (
    <span
      title="Verified Location — confirmed by 3+ explorers"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Scalloped verification seal */}
        <path
          d="M12 1.5l2.3 2 3-.4 1.2 2.8 2.8 1.2-.4 3 2 2.3-2 2.3.4 3-2.8 1.2-1.2 2.8-3-.4-2.3 2-2.3-2-3 .4-1.2-2.8-2.8-1.2.4-3-2-2.3 2-2.3-.4-3 2.8-1.2L6.7 3.1l3 .4z"
          fill="#3b82f6"
        />
        <path
          d="M8.5 12.2l2.4 2.4 4.8-4.9"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withLabel && (
        <span
          style={{
            color: '#3b82f6',
            fontSize: '0.75rem',
            fontWeight: 600,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
