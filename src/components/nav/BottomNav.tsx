import { useState } from 'react'

interface BottomNavProps {
  onNext: () => void
  onOpenSheet: (sheet: 'discover' | 'timeline' | 'pulse' | 'people') => void
  // onEnterLive removed, using event for loose coupling with map
}

export function BottomNav({ onNext, onOpenSheet }: BottomNavProps) {
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null)

  const handleNextClick = () => {
    // Single tap: advance experience
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
        <button
          onClick={() => onOpenSheet('discover')}
          className="flex flex-col items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground active:text-primary transition-colors"
          aria-label="Discover"
        >
          <span className="text-xl mb-0.5">📍</span>
          <span>Discover</span>
        </button>

        <button
          onClick={() => onOpenSheet('timeline')}
          className="flex flex-col items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground active:text-primary transition-colors"
          aria-label="Timeline"
        >
          <span className="text-xl mb-0.5">📅</span>
          <span>Timeline</span>
        </button>

        {/* Center NEXT - prominent */}
        <button
          onClick={handleNextClick}
          onPointerDown={handleNextPointerDown}
          onPointerUp={handleNextPointerUp}
          onPointerLeave={handleNextPointerUp}
          className="flex flex-col items-center justify-center -mt-2 px-5 py-1 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
          aria-label="NEXT - advance to next experience (tap) or Live Mode (hold)"
        >
          <span className="text-2xl">🟠</span>
          <span className="text-[10px] font-bold tracking-wider">NEXT</span>
        </button>

        <button
          onClick={() => onOpenSheet('pulse')}
          className="flex flex-col items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground active:text-primary transition-colors"
          aria-label="Pulse"
        >
          <span className="text-xl mb-0.5">🔔</span>
          <span>Pulse</span>
        </button>

        <button
          onClick={() => onOpenSheet('people')}
          className="flex flex-col items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground active:text-primary transition-colors"
          aria-label="People"
        >
          <span className="text-xl mb-0.5">👥</span>
          <span>People</span>
        </button>
      </div>
    </nav>
  )
}
