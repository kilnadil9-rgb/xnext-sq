/**
 * BottomNav — Phase 1.6 visual refresh
 *
 * Architecture unchanged. Visual changes only:
 *  - Dark capsule container instead of solid border-top bar
 *  - SVG icons replacing emoji
 *  - NEXT button: larger, stronger glow, breathing animation, pulse wave
 *  - Thinner footprint, cleaner spacing, strong orange accents
 *
 * All existing event logic (onNext, onOpenSheet, long-press Live Mode) preserved exactly.
 */
import { useState } from 'react'

interface BottomNavProps {
  onNext: () => void
  onOpenSheet: (sheet: 'discover' | 'timeline' | 'pulse' | 'people') => void
}

export function BottomNav({ onNext, onOpenSheet }: BottomNavProps) {
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null)

  // ── NEXT event logic — unchanged ──────────────────────────────────────────
  const handleNextClick = () => {
    onNext()
  }

  const handleNextPointerDown = () => {
    const timer = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('[NEXT] Long press detected - entering Live Mode')
      }
      window.dispatchEvent(new CustomEvent('xnext-live-enter'))
    }, 600)
    setLongPressTimer(timer)
  }

  const handleNextPointerUp = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-3 pt-1 pointer-events-none"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      aria-label="Main navigation"
    >
      {/* Capsule container */}
      <div className="pointer-events-auto flex items-center justify-around w-full max-w-sm h-14 px-2 rounded-full border border-[#f97316]/20 bg-black/80 backdrop-blur-xl shadow-[0_0_0_1px_rgba(249,115,22,0.06),0_8px_32px_rgba(0,0,0,0.6)]">

        {/* Discover */}
        <NavButton
          label="Discover"
          onClick={() => onOpenSheet('discover')}
          icon={<DiscoverIcon />}
        />

        {/* Timeline */}
        <NavButton
          label="Timeline"
          onClick={() => onOpenSheet('timeline')}
          icon={<TimelineIcon />}
        />

        {/* ── NEXT — primary action ── */}
        <div className="relative -mt-5">
          {/* Outer pulse wave ring */}
          <div className="absolute inset-[-6px] rounded-full border-2 border-[#f97316]/30 animate-pulse-wave" />

          <button
            onClick={handleNextClick}
            onPointerDown={handleNextPointerDown}
            onPointerUp={handleNextPointerUp}
            onPointerLeave={handleNextPointerUp}
            className="relative w-14 h-14 rounded-full bg-[#f97316] text-black flex flex-col items-center justify-center active:scale-90 transition-transform animate-glow-breathe select-none touch-none"
            aria-label="NEXT — advance to next experience (tap) or Live Mode (hold)"
          >
            {/* Inner amber ring */}
            <div className="absolute inset-[3px] rounded-full border border-[#fde047]/50 pointer-events-none" />

            {/* NEXT wordmark */}
            <span className="text-[11px] font-black tracking-[1.5px] relative z-10 leading-none mt-0.5">
              next
            </span>
          </button>
        </div>

        {/* Pulse */}
        <NavButton
          label="Pulse"
          onClick={() => onOpenSheet('pulse')}
          icon={<PulseIcon />}
        />

        {/* People */}
        <NavButton
          label="People"
          onClick={() => onOpenSheet('people')}
          icon={<PeopleIcon />}
        />
      </div>
    </nav>
  )
}

// ── Shared nav button ─────────────────────────────────────────────────────────

function NavButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 w-12 h-full text-white/40 hover:text-[#f97316] active:text-[#f97316] transition-colors"
      aria-label={label}
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="text-[9px] font-medium tracking-wider">{label}</span>
    </button>
  )
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function DiscoverIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  )
}

function TimelineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
