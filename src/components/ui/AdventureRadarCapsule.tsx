/**
 * AdventureRadarCapsule — Phase 1.7
 *
 * Wide floating pill showing Adventure Radar status.
 * - Removed duplicate NEXT button (BottomNav NEXT is the sole hero action)
 * - Added locationStatus prop for contextual messaging
 * - Three display modes: locating / denied / active
 */

type LocationStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'error'

interface AdventureRadarCapsuleProps {
  questCount: number
  isLive: boolean
  locationStatus: LocationStatus
  onRequestLocation?: () => void
}

export function AdventureRadarCapsule({
  questCount,
  isLive,
  locationStatus,
  onRequestLocation,
}: AdventureRadarCapsuleProps) {
  const needsLocation =
    locationStatus === 'denied' || locationStatus === 'unavailable' || locationStatus === 'error'
  const isLocating = locationStatus === 'idle' || locationStatus === 'locating'

  return (
    <div className="relative flex items-center gap-3 px-4 py-3 rounded-full border border-[#f97316]/60 bg-black/75 backdrop-blur-xl shadow-[0_0_24px_rgba(249,115,22,0.2),inset_0_0_0_1px_rgba(249,115,22,0.08)] overflow-hidden">
      {/* Circuit accent lines */}
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/25 to-transparent pointer-events-none" />
      <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-[#fde047]/25 to-transparent pointer-events-none" />

      {/* Animated scan pulse */}
      <div className="relative flex-shrink-0 w-9 h-9">
        {!needsLocation && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-[#f97316]/50 animate-ping" />
            <div className="absolute inset-0 rounded-full border border-[#f97316]/30 animate-ping [animation-delay:400ms]" />
          </>
        )}
        <div
          className={`absolute inset-[3px] rounded-full border flex items-center justify-center
            ${needsLocation ? 'border-white/20 bg-black/40' : 'border-[#f97316]/80 bg-black/60'}`}
        >
          {needsLocation ? (
            /* Location icon */
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-[#f97316] shadow-[0_0_6px_#f97316]" />
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className="text-[9px] text-[#fde047] font-mono tracking-[2.5px] leading-none uppercase">
          Adventure Radar
        </div>
        <div className="text-sm text-white font-bold mt-0.5 leading-tight">
          {needsLocation
            ? 'Location access needed'
            : isLocating
              ? 'Finding your location…'
              : questCount > 0
                ? `${questCount} Experience${questCount !== 1 ? 's' : ''} Nearby`
                : 'Scanning for adventures…'}
        </div>
      </div>

      {/* Right side: LIVE badge when active, or Enable button when denied */}
      {isLive && !needsLocation && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#f97316]/15 border border-[#f97316]/40 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[#f97316] animate-pulse" />
          <span className="text-[9px] text-[#f97316] font-mono tracking-[1.5px]">LIVE</span>
        </div>
      )}

      {needsLocation && onRequestLocation && (
        <button
          onClick={onRequestLocation}
          className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/70 text-[11px] font-semibold hover:bg-white/15 active:scale-95 transition-all"
        >
          Enable
        </button>
      )}
    </div>
  )
}
