/**
 * UserMenu
 *
 * Displays user avatar + name with a dropdown for Profile, Settings,
 * Trust & Privacy pill, and Sign Out.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../services/authService'
import { profileService } from '../../services/profileService'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '../../lib/supabase/types'
import { useAuth } from '../../hooks/useAuth'

export function UserMenu() {
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const { profile: authProfile } = useAuth()

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    authService.getCurrentUser().then(({ data }) => {
      if (!data) return
      setUser(data)
      profileService.getProfile(data.id).then(({ data: p }) => setProfile(p))
    })
  }, [])

  // Sync is_admin from the shared AuthContext profile (stays fresh after refreshProfile calls)
  const isAdmin = authProfile?.is_admin ?? profile?.is_admin ?? false

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await authService.signOut()
    navigate('/auth/login')
  }

  const displayName = profile?.full_name ?? user?.email ?? 'Account'
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="User menu"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </div>
        )}
        <span className="hidden text-sm font-medium text-foreground sm:block">
          {displayName}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-border bg-popover shadow-lg"
          role="menu"
        >
          <div className="border-b border-border px-4 py-2">
            <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>

          <div className="py-1">
            <MenuButton onClick={() => { setOpen(false); navigate('/dashboard/profile') }}>
              Profile
            </MenuButton>
            <MenuButton onClick={() => { setOpen(false); navigate('/dashboard/settings') }}>
              Settings
            </MenuButton>
            {isAdmin && (
              <MenuButton onClick={() => { setOpen(false); navigate('/dashboard/admin/review') }}>
                Admin Review
              </MenuButton>
            )}
          </div>

          {/* Trust & Privacy pill — intentional accent, not a regular menu item */}
          <div className="px-2 pb-1.5">
            <button
              onClick={() => { setOpen(false); navigate('/dashboard/trust') }}
              className="flex w-full items-center gap-2 rounded-full border border-[#f97316]/40 bg-[#f97316]/[0.06] px-3 py-2 text-left text-[11px] font-semibold text-[#c2410c] transition-all hover:border-[#f97316]/70 hover:bg-[#f97316]/[0.12] active:scale-[0.98] dark:text-[#fde047]"
              aria-label="Trust and Privacy"
            >
              <span className="text-[13px]">🔒</span>
              <span>Trust &amp; Privacy</span>
              <svg
                className="ml-auto h-3 w-3 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="border-t border-border py-1">
            <MenuButton
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-destructive hover:bg-destructive/10"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function MenuButton({
  onClick,
  disabled,
  children,
  className = '',
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={`block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}
