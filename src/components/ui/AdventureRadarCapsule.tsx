/**
 * AdventureRadarCapsule
 *
 * Wide floating capsule that surfaces the Adventure Radar status.
 * Visual-only component — no location logic, no permission handling.
 * Receives count + live status as props from HomePage.
 */
interface AdventureRadarCapsuleProps {
  questCount: number
  isLive: boolean
  onNext?: () => void
}

export function AdventureRadarCapsule({
  questCount,
  isLive,
  onNext,
}: AdventureRadarCapsuleProps) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-3 rounded-full border border-[#f97316]/60 bg-black/75 backdrop-blur-xl shadow-[0_0_24px_rgba(249,115,22,0.2),inset_0_0_0_1px_rgba(249,115,22,0.08)] overflow-hidden">
      {/* Subtle circuit accent lines */}
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/25 to-transparent pointer-events-none" />
      <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/25 to-transparent pointer-events-none" />

      {/* Animated scan pulse */}
      <div className="relative flex-shrink-0 w-9 h-9">
        <div className="absolute inset-0 rounded-full border-2 border-[#f97316]/50 animate-ping" />
        <div className="absolute inset-0 rounded-full border border-[#f97316]/30 animate-ping [animation-delay:400ms]" />
        <div className="absolute inset-[3px] rounded-full border border-[#f97316]/80 bg-black/60 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-[#f97316] shadow-[0_0_6px_#f97316]" />
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className="text-[9px] text-[#fde047] font-mono tracking-[2.5px] leading-none uppercase">
          Adventure Radar
        </div>
        <div className="text-sm text-white font-bold mt-0.5 leading-tight">
          {questCount > 0
            ? `${questCount} Experience${questCount !== 1 ? 's' : ''} Nearby`
            : 'Scanning…'}
        </div>
      </div>

      {/* Live badge */}
      {isLive && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#f97316]/15 border border-[#f97316]/40 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[#f97316] animate-pulse" />
          <span className="text-[9px] text-[#f97316] font-mono tracking-[1.5px]">
            LIVE
          </span>
        </div>
      )}

      {/* NEXT action */}
      <button
        onClick={onNext}
        disabled={questCount === 0}
        className="flex-shrink-0 px-4 py-1.5 rounded-full bg-[#f97316] text-black text-[11px] font-black tracking-[1px] shadow-[0_0_12px_rgba(249,115,22,0.5)] active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Show next nearby experience"
      >
        NEXT
      </button>
    </div>
  )
}
