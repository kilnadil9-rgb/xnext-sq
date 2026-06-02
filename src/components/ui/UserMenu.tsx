/**
 * UserMenu — Placeholder
 *
 * Displays user avatar + name with a dropdown for Profile, Settings, Sign Out.
 * Wire up to your routing solution (react-router-dom by default).
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../services/authService'
import { profileService } from '../../services/profileService'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '../../lib/supabase/types'

export function UserMenu() {
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)

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
