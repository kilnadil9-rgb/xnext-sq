import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { authService } from '../../services/authService'
import type { User } from '@supabase/supabase-js'

interface ProtectedRouteProps {
  /** Redirect target when unauthenticated. Defaults to /auth/login */
  redirectTo?: string
}

/**
 * Wraps any route that requires an authenticated session.
 * Renders children via <Outlet /> when authenticated.
 * Redirects to `redirectTo` when not authenticated.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 */
export function ProtectedRoute({ redirectTo = '/auth/login' }: ProtectedRouteProps) {
  const location = useLocation()
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    authService.getCurrentUser().then(({ data }) => setUser(data))

    const unsubscribe = authService.onAuthStateChange((u) => setUser(u))
    return unsubscribe
  }, [])

  // Still resolving session — show nothing to prevent flash
  if (user === undefined) return null

  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />
  }

  return <Outlet />
}
