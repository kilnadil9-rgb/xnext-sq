/**
 * Marker tier icons — restrained, explorer-focused SVG symbols (not emoji).
 * Trail: stacked stones · Bronze/Silver/Gold: summit flags · Diamond: faceted
 * compass marker · Legacy: crowned beacon flame.
 *
 * Always render the text label alongside (a11y: never color alone) — the
 * parent decides layout; this component provides the aria-label.
 */
import {
  MARKER_TIER_COLOR,
  MARKER_TIER_LABEL,
  type ExplorerMarkerTier,
} from '../../lib/explorerMarkers'

interface Props {
  tier: ExplorerMarkerTier
  size?: number
  /** Grayscale + dimmed (locked tiers in the inventory). */
  locked?: boolean
}

export function MarkerTierIcon({ tier, size = 22, locked = false }: Props) {
  const color = locked ? '#6b7280' : MARKER_TIER_COLOR[tier]
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    role: 'img' as const,
    'aria-label': `${MARKER_TIER_LABEL[tier]} marker${locked ? ' (locked)' : ''}`,
    style: { opacity: locked ? 0.55 : 1, flexShrink: 0 },
  }

  switch (tier) {
    case 'trail':
      // Stacked stones (cairn)
      return (
        <svg {...common}>
          <ellipse cx="12" cy="18.5" rx="7" ry="2.6" />
          <ellipse cx="12" cy="13.5" rx="5" ry="2.2" />
          <ellipse cx="12" cy="9" rx="3.2" ry="1.8" />
        </svg>
      )
    case 'bronze':
    case 'silver':
    case 'gold':
      // Summit flag
      return (
        <svg {...common}>
          <line x1="8" y1="21" x2="8" y2="4" />
          <path d="M8 5h9l-2.5 3L17 11H8" fill={color} fillOpacity={locked ? 0.15 : 0.3} />
          <line x1="5" y1="21" x2="11" y2="21" />
        </svg>
      )
    case 'diamond':
      // Faceted compass marker
      return (
        <svg {...common}>
          <path d="M12 2.5 20 12l-8 9.5L4 12Z" fill={color} fillOpacity={locked ? 0.12 : 0.22} />
          <path d="M12 2.5v19M4 12h16" />
          <path d="M12 8.5 15 12l-3 3.5L9 12Z" />
        </svg>
      )
    case 'legacy':
      // Crowned beacon flame
      return (
        <svg {...common}>
          <path
            d="M12 3.5c2.6 2.8 4.5 5.2 4.5 8a4.5 4.5 0 0 1-9 0c0-2.8 1.9-5.2 4.5-8Z"
            fill={color}
            fillOpacity={locked ? 0.15 : 0.3}
          />
          <path d="M12 9c1 1.2 1.8 2.2 1.8 3.4a1.8 1.8 0 0 1-3.6 0C10.2 11.2 11 10.2 12 9Z" />
          <path d="M6.5 19.5h11M8 21.5h8" />
        </svg>
      )
  }
}
