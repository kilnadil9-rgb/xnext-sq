import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { UserMenu } from '../ui/UserMenu'
import { OrganizationSwitcher } from '../ui/OrganizationSwitcher'

/**
 * Primary app shell for authenticated users.
 * Renders a sidebar nav + top header + <Outlet /> for nested routes.
 *
 * Nav items expand as features are built. Start with the MVP set.
 */
export function DashboardLayout() {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
            <NavItem to="/dashboard/quests" label="Quests" icon={QuestIcon} />
            <NavItem to="/dashboard/pulse" label="Pulse" icon={PulseIcon} />
            <NavItem to="/dashboard/organizations" label="Organizations" icon={OrgIcon} />
            <NavItem to="/dashboard/profile" label="Profile" icon={ProfileIcon} />
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
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
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

function PulseIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h3l3-9 3 18 3-9h6" />
    </svg>
  )
}

function OrgIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function ProfileIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
