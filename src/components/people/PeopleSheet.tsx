/**
 * PeopleSheet — XNEXT's community layer as an 80dvh bottom sheet.
 *
 * The Adventure Radar stays visible behind it; closing preserves all map
 * state (the sheet is a pure overlay — it never unmounts the map).
 *
 * Structure: PEOPLE header → Journey Pulse pill (private momentum) →
 * Community | My Journey | Markers. The last selected tab is preserved for
 * the session (module state, cleared on reload).
 *
 * Mobile behavior: drag handle + swipe-down dismiss (pointer events),
 * internal scrolling only (overscroll-contain avoids nested scroll fights),
 * safe-area padding, 44px touch targets, reduced-motion support.
 */
import { useEffect, useRef, useState } from 'react'
import { JourneyPulsePill } from './JourneyPulsePill'
import { CommunitySection } from './CommunitySection'
import { MyJourneySection } from './MyJourneySection'
import { MarkersSection } from './MarkersSection'
import { track } from '../../lib/analytics'

export type PeopleTab = 'community' | 'journey' | 'markers'

/** Session-scoped tab memory (sessionStorage: survives sheet close, resets
 *  with the browsing session — intentionally not persisted long-term). */
const TAB_STORAGE_KEY = 'xnext-people-tab'

function readLastTab(): PeopleTab {
  try {
    const stored = sessionStorage.getItem(TAB_STORAGE_KEY)
    if (stored === 'community' || stored === 'journey' || stored === 'markers') {
      return stored
    }
  } catch {
    /* storage unavailable — default below */
  }
  return 'community'
}

function writeLastTab(tab: PeopleTab): void {
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    /* best-effort */
  }
}

const TABS: { id: PeopleTab; label: string }[] = [
  { id: 'community', label: 'Community' },
  { id: 'journey', label: 'My Journey' },
  { id: 'markers', label: 'Markers' },
]

/** Drag distance (px) beyond which release dismisses the sheet. */
const DISMISS_THRESHOLD_PX = 90

interface Props {
  onClose: () => void
}

export function PeopleSheet({ onClose }: Props) {
  const [tab, setTab] = useState<PeopleTab>(readLastTab)

  // ── Swipe-down dismissal (drag handle + header zone only, so the inner
  //    scroller never fights the gesture) ─────────────────────────────────
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  useEffect(() => {
    track('people_sheet_opened', { tab: readLastTab() })
  }, [])

  const selectTab = (next: PeopleTab) => {
    writeLastTab(next)
    setTab(next)
    track('people_tab_selected', { tab: next })
  }

  const onDragStart = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onDragMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return
    setDragOffset(Math.max(0, e.clientY - dragStartY.current))
  }
  const onDragEnd = () => {
    if (dragStartY.current === null) return
    const shouldClose = dragOffset > DISMISS_THRESHOLD_PX
    dragStartY.current = null
    setDragOffset(0)
    if (shouldClose) onClose()
  }

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="People — Explorer Community"
      className="fixed inset-x-0 bottom-0 z-[65] flex h-[80dvh] flex-col rounded-t-3xl border-t border-white/10 bg-[#0c1420]/97 shadow-2xl backdrop-blur-xl transition-transform duration-200 motion-reduce:transition-none"
      style={{
        transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset > 0 ? 'none' : undefined,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ── Drag handle + header (drag zone) ── */}
      <div
        className="flex-shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="flex items-start justify-between px-4 pb-2">
          <div>
            <h2 className="text-lg font-black tracking-[2px] text-white">PEOPLE</h2>
            <p className="text-[11px] uppercase tracking-[1.5px] text-white/40">
              Explorer Community
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close People"
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-white/50 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Journey Pulse (private momentum — scrolls with content is fine,
             but stays above the tabs per spec) ── */}
      <div className="flex-shrink-0">
        <JourneyPulsePill onClose={onClose} />
      </div>

      {/* ── Tabs ── */}
      <div
        role="tablist"
        aria-label="People sections"
        className="mx-4 flex flex-shrink-0 gap-1 rounded-xl border border-white/10 bg-white/5 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
            className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-medium transition-colors motion-reduce:transition-none ${
              tab === t.id
                ? 'bg-[#f97316]/20 text-[#fdba74]'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable content (contained — no nested-scroll conflicts) ── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'community' && <CommunitySection />}
        {tab === 'journey' && <MyJourneySection onClose={onClose} />}
        {tab === 'markers' && <MarkersSection />}
      </div>
    </div>
  )
}
