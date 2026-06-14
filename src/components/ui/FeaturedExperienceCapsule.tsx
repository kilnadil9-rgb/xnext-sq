/**
 * FeaturedExperienceCapsule
 *
 * Hero card showing the currently featured nearby quest.
 * Visual-only component — receives quest data as a prop.
 * Uses real quest fields: title, description, distance_km, experience_class.
 */
import type { NearbyQuest } from '../../lib/supabase/types'

interface FeaturedExperienceCapsuleProps {
  quest: NearbyQuest | null
  onGo?: () => void
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
  onGo,
}: FeaturedExperienceCapsuleProps) {
  /* ── Empty state ── */
  if (!quest) {
    return (
      <div className="relative rounded-2xl border border-[#f97316]/30 bg-black/70 backdrop-blur-xl p-4 shadow-[0_0_20px_rgba(249,115,22,0.1)] overflow-hidden">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/20 to-transparent pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-950/70 to-yellow-950/40 flex items-center justify-center text-2xl flex-shrink-0 border border-[#f97316]/20">
            🗺️
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-[#fde047] font-mono tracking-[2.5px] uppercase">
              Nearby Experience
            </div>
            <div className="text-white/50 text-sm font-semibold mt-0.5">
              No quests in range
            </div>
            <div className="text-white/30 text-xs mt-0.5">
              Widen radius or pan the map
            </div>
          </div>
        </div>
      </div>
    )
  }

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
