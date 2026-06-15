/**
 * FeaturedExperienceCapsule
 *
 * Hero card showing the currently featured nearby quest.
 * Receives quest data + location status as props — no side effects.
 *
 * Empty states are context-aware:
 *   locating      → "Finding adventures near you…"
 *   denied/error  → "Enable location to discover"
 *   active + none → "Nothing here yet — be the first" + Add Discovery CTA
 */
import type { NearbyQuest } from '../../lib/supabase/types'

type LocationStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'error'

interface FeaturedExperienceCapsuleProps {
  quest: NearbyQuest | null
  locationStatus?: LocationStatus
  onGo?: () => void
  onDiscover?: () => void
}

/** Map experience_class slugs to a representative emoji icon */
const CLASS_ICON: Record<string, string> = {
  hiking: '🥾',
  trail: '🥾',
  camping: '🏕️',
  viewpoint: '🏔️',
  waterfall: '💦',
  wildlife: '🦌',
  swimming: '🏊',
  cycling: '🚴',
  climbing: '🧗',
  rockhounding: '🪨',
  stargazing: '🌌',
  'scenic-drive': '🚗',
  family: '👨‍👩‍👧',
  music: '🎵',
  wonder: '✦',
  opportunity: '⚡',
  connection: '🤝',
  transformation: '🌅',
}

function getIcon(cls?: string | null): string {
  if (!cls) return '✦'
  const key = cls.toLowerCase().replace(/_/g, '-')
  return CLASS_ICON[key] ?? CLASS_ICON[key.split('-')[0]] ?? '✦'
}

function formatDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

export function FeaturedExperienceCapsule({
  quest,
  locationStatus = 'idle',
  onGo,
  onDiscover,
}: FeaturedExperienceCapsuleProps) {

  /* ── Empty state: no quest to show ────────────────────────────────── */
  if (!quest) {
    const needsLocation =
      locationStatus === 'denied' ||
      locationStatus === 'unavailable' ||
      locationStatus === 'error'

    const isActive = locationStatus === 'active'

    return (
      <div className="relative rounded-2xl border border-[#f97316]/30 bg-black/70 backdrop-blur-xl p-4 shadow-[0_0_20px_rgba(249,115,22,0.1)] overflow-hidden">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/20 to-transparent pointer-events-none" />

        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-950/70 to-yellow-950/40 flex items-center justify-center text-2xl flex-shrink-0 border border-[#f97316]/20">
            {needsLocation ? '📍' : isActive ? '🧭' : '🌍'}
          </div>

          {/* Text + action */}
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-[#fde047] font-mono tracking-[2.5px] uppercase">
              Nearby Experience
            </div>

            {needsLocation ? (
              <>
                <div className="text-white/60 text-sm font-semibold mt-0.5">
                  Location access needed
                </div>
                <div className="text-white/35 text-xs mt-0.5">
                  Enable location to see what's nearby
                </div>
              </>
            ) : isActive ? (
              <>
                <div className="text-white/70 text-sm font-semibold mt-0.5">
                  No quests nearby yet
                </div>
                <div className="text-white/40 text-xs mt-0.5">
                  Add the first discovery here
                </div>
              </>
            ) : (
              <>
                <div className="text-white/50 text-sm font-semibold mt-0.5">
                  Finding adventures near you…
                </div>
                <div className="text-white/30 text-xs mt-0.5">
                  Move the map to explore more
                </div>
              </>
            )}
          </div>

          {/* CTA: only when active + no quests */}
          {isActive && onDiscover && (
            <button
              onClick={onDiscover}
              className="flex-shrink-0 px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white/80 text-[10px] font-bold tracking-wide leading-tight text-center active:scale-95 transition-all hover:bg-white/15 hover:border-white/35"
              aria-label="Add a discovery"
            >
              ADD<br />ONE
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ── Filled state: quest found ─────────────────────────────────────── */
  const icon = getIcon(quest.experience_class)
  const distLabel = formatDist(quest.distance_km)
  const categoryLabel = quest.experience_class
    ? quest.experience_class.replace(/_/g, ' ')
    : null

  return (
    <div className="relative rounded-2xl border border-[#f97316]/55 bg-black/75 backdrop-blur-xl overflow-hidden shadow-[0_0_32px_rgba(249,115,22,0.18)]">
      {/* Top accent */}
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/35 to-transparent pointer-events-none" />
      {/* Bottom accent */}
      <div className="absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/20 to-transparent pointer-events-none" />

      <div className="flex items-center gap-3 p-3">
        {/* Image / icon area */}
        <div className="w-[68px] h-[68px] rounded-xl bg-gradient-to-br from-orange-950/80 to-yellow-950/50 flex items-center justify-center text-3xl flex-shrink-0 border border-[#f97316]/25 shadow-inner">
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-[#fde047] font-mono tracking-[2.5px] uppercase leading-none">
            Nearby Experience
          </div>
          <div className="text-white font-bold text-[15px] leading-snug mt-0.5 line-clamp-1">
            {quest.title}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-white/55">{distLabel}</span>
            {categoryLabel && (
              <>
                <span className="text-[#f97316]/40 text-xs">•</span>
                <span className="text-xs text-white/55 capitalize">
                  {categoryLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onGo}
          className="flex-shrink-0 px-3.5 py-3 rounded-xl bg-[#f97316] text-black text-[11px] font-black tracking-wide leading-tight text-center shadow-[0_0_18px_rgba(249,115,22,0.55)] active:scale-95 transition-all hover:shadow-[0_0_28px_rgba(249,115,22,0.75)]"
          aria-label={`Start ${quest.title}`}
        >
          LET'S<br />GO
        </button>
      </div>
    </div>
  )
}
