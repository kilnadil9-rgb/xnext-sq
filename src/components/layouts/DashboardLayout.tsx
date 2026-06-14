import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { UserMenu } from '../ui/UserMenu'
import { OrganizationSwitcher } from '../ui/OrganizationSwitcher'
import { useAuth } from '../../hooks/useAuth'
import { BottomNav } from '../nav/BottomNav'

/**
 * Primary app shell for authenticated users.
 * Renders a sidebar nav + top header + <Outlet /> for nested routes.
 *
 * Nav items expand as features are built. Start with the MVP set.
 */
export function DashboardLayout() {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isMapHome = pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/map'

  const [openSheet, setOpenSheet] = useState<'discover' | 'timeline' | 'pulse' | 'people' | null>(null)

  const handleNext = () => {
    // Dispatch to any listening map component (MapScreen or Home map)
    window.dispatchEvent(new CustomEvent('xnext-next'))
  }

  const openSheetHandler = (sheet: 'discover' | 'timeline' | 'pulse' | 'people') => {
    setOpenSheet(sheet)
  }

  const closeSheet = () => setOpenSheet(null)

  // Consent gate: if profile loaded and no privacy acceptance recorded, force to consent screen.
  // This implements the first-launch consent flow (Deliverable 3) without showing dashboard chrome.
  useEffect(() => {
    if (profile && !profile.privacy_policy_accepted_at) {
      navigate('/consent', { replace: true })
    }
  }, [profile, navigate])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0
        `}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            SQ
          </div>
          <span className="font-semibold text-foreground">XNext</span>
        </div>

        {/* Org switcher */}
        <div className="border-b border-border px-4 py-3">
          <OrganizationSwitcher
            activeOrgId={activeOrgId}
            onSwitch={setActiveOrgId}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          <ul className="space-y-1">
            <NavItem to="/dashboard" label="Home" icon={HomeIcon} end />
            <NavItem to="/dashboard/map" label="Map" icon={MapIcon} />
            <NavItem to="/dashboard/quests/mine" label="My Quests" icon={QuestIcon} />
            <NavItem to="/dashboard/dream-list" label="Dream List" icon={DreamListIcon} />
            <NavItem to="/dashboard/pulse" label="Pulse" icon={PulseIcon} />
            <NavItem to="/dashboard/quests/new" label="Create Quest" icon={QuestIcon} />
            <NavItem to="/dashboard/completed" label="Completed" icon={QuestIcon} />
            <NavItem to="/dashboard/preferences" label="Preferences" icon={UsersIcon} />
          </ul>

          {/* Admin section — gated by RequireRole in the actual routes */}
          <div className="mt-6">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
            <ul className="space-y-1">
              <NavItem to="/dashboard/admin/users" label="Users" icon={UsersIcon} />
              <NavItem to="/dashboard/admin/audit" label="Audit Logs" icon={AuditIcon} />
            </ul>
          </div>
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <MenuIcon />
          </button>
          <div className="flex-1" />
          <UserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>

        {/* Bottom nav - primary interaction for map home / experience layers.
            Fixed so map (in child components) remains visible underneath. */}
        {isMapHome && (
          <BottomNav onNext={handleNext} onOpenSheet={openSheetHandler} />
        )}

        {/* Sheet overlays for nav items - map stays visible behind.
            Limited height, scrollable content. */}
        {openSheet && (
          <div className="fixed inset-x-0 bottom-0 z-[60] bg-card border-t border-border rounded-t-2xl shadow-2xl max-h-[65vh] overflow-auto" role="dialog" aria-modal="true">
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <span className="font-semibold text-lg capitalize">{openSheet}</span>
              <button onClick={closeSheet} className="text-2xl leading-none" aria-label="Close">×</button>
            </div>

            <div className="p-4">
              {openSheet === 'discover' && (
                <div>
                  <h3 className="font-medium mb-2">Add Discovery (Phase 1 shell)</h3>
                  <p className="text-sm text-muted-foreground mb-4">Community-powered experiences only. No businesses.</p>
                  <form onSubmit={(e) => { e.preventDefault(); alert('Discovery submitted (shell). In real: would create quest with location.'); closeSheet(); }} className="space-y-3">
                    <input type="text" placeholder="Title (e.g. Hidden Waterfall)" className="w-full rounded border p-2 text-sm" required />
                    <textarea placeholder="Short description" className="w-full rounded border p-2 text-sm h-20" required />
                    <select className="w-full rounded border p-2 text-sm">
                      <option>Hidden Viewpoint</option>
                      <option>Waterfall</option>
                      <option>Trail</option>
                      <option>Rockhounding</option>
                      <option>Stargazing</option>
                      <option>Scenic Drive</option>
                      <option>Family Spot</option>
                      <option>Outdoor Adventure</option>
                    </select>
                    <div>
                      <label className="text-xs block mb-1">Photo (UI only)</label>
                      <input type="file" accept="image/*" className="text-sm" />
                    </div>
                    <div>
                      <button type="button" onClick={() => alert('Using current location (shell)')} className="text-xs underline">Use current GPS location</button>
                    </div>
                    <input type="text" placeholder="Tags (comma separated)" className="w-full rounded border p-2 text-sm" />
                    <button type="submit" className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium">Submit Discovery</button>
                  </form>
                </div>
              )}

              {openSheet === 'timeline' && (
                <div>
                  <h3 className="font-medium mb-3">Timeline</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {['Today', 'Tonight', 'This Weekend', 'This Week', 'This Month'].map(f => (
                      <button key={f} onClick={() => { alert(`Timeline filter: ${f} (would update visible experiences on map)`); closeSheet(); }} className="border rounded p-3 text-left text-sm hover:bg-accent">
                        {f}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Selecting a filter would re-query and highlight time-sensitive experiences on the live map.</p>
                </div>
              )}

              {openSheet === 'pulse' && (
                <div>
                  <h3 className="font-medium mb-3">Pulse — Opportunity Engine</h3>
                  <div className="space-y-2 text-sm">
                    <div className="p-3 border rounded">🌧️ Perfect weather for your saved hike at Badger Mountain (2h window)</div>
                    <div className="p-3 border rounded">🎟️ Limited spots: Sacagawea Sunset Tour tonight</div>
                    <div className="p-3 border rounded">📍 Dream List item nearby: Columbia River viewpoint</div>
                  </div>
                  <p className="text-xs mt-3 text-muted-foreground">Phase 1 structure. Real data + existing pulse alerts would power this.</p>
                </div>
              )}

              {openSheet === 'people' && (
                <div>
                  <h3 className="font-medium mb-3">People — Experience Community</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2 border rounded">
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="text-sm">Alex shared a new viewpoint on Badger Mountain</div>
                    </div>
                    <div className="flex items-center gap-3 p-2 border rounded">
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="text-sm">Sam's family adventure at the river this weekend</div>
                    </div>
                  </div>
                  <p className="text-xs mt-3 text-muted-foreground">Placeholder. Connect through real shared experiences (future graph).</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reduced footer on map home for less clutter; full Trust Center elsewhere. All legal still accessible. */}
        <footer className="border-t border-border bg-card px-4 py-2 text-[10px] text-muted-foreground">
          {isMapHome ? (
            <p className="text-center opacity-70">
              Your memories belong to you. Your adventures belong to you.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-center">
                <Link to="/privacy-policy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
                <Link to="/terms-of-service" className="hover:text-foreground hover:underline">Terms of Service</Link>
                <Link to="/community-guidelines" className="hover:text-foreground hover:underline">Community Guidelines</Link>
                <Link to="/data-requests" className="hover:text-foreground hover:underline">Data Requests</Link>
                <a href="mailto:support@xnext.example" className="hover:text-foreground hover:underline">Contact Support</a>
                <Link to="/philosophy" className="hover:text-foreground hover:underline">Product Philosophy</Link>
              </div>
              <p className="mt-1 text-center text-[10px] opacity-70">
                Your memories belong to you. Your adventures belong to you. You can export or delete your data at any time.
              </p>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: React.FC<{ className?: string }>
  end?: boolean
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </NavLink>
    </li>
  )
}

// ─── Inline icons (no external dep) ──────────────────────────────────────────

const iconProps = 'h-4 w-4'

function HomeIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
    </svg>
  )
}

function QuestIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" />
    </svg>
  )
}

function DreamListIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function PulseIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h3l3-9 3 18 3-9h6" />
    </svg>
  )
}

function UsersIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
    </svg>
  )
}

function AuditIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function MapIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314-11.314z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
