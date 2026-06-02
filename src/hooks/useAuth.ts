import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Access the global auth state.
 *
 * Must be used inside <AuthProvider>.
 *
 * Returns:
 *   user       — Supabase User object (null if unauthenticated)
 *   session    — Current session with access/refresh tokens
 *   profile    — Profile row from public.profiles
 *   loading    — True while resolving initial session
 *   error      — Last auth error message, if any
 *   refreshProfile — Manually re-fetch the profile row
 *
 * Usage:
 *   const { user, profile, loading } = useAuth()
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
