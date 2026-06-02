import { useEffect, useState, type ReactNode } from 'react'
import { rbacService, type AppRole } from '../../services/rbacService'

interface RequireRoleProps {
  /** One or more roles. User must have AT LEAST ONE to pass. */
  role: AppRole | AppRole[]
  /** Rendered when the user has at least one matching role */
  children: ReactNode
  /** Rendered when the user has none of the matching roles. Defaults to null. */
  fallback?: ReactNode
}

/**
 * Conditionally renders children based on whether the authenticated user
 * has at least one of the required roles. Checks are made against the database
 * via `public.has_role()` — cannot be spoofed from the client.
 *
 * Usage:
 *   <RequireRole role="super_admin">
 *     <AdminPanel />
 *   </RequireRole>
 *
 *   <RequireRole role={['admin', 'moderator']} fallback={<AccessDenied />}>
 *     <ModerationQueue />
 *   </RequireRole>
 */
export function RequireRole({ role, children, fallback = null }: RequireRoleProps) {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const roles = Array.isArray(role) ? role : [role]

    Promise.all(roles.map((r) => rbacService.hasRole(r))).then((results) => {
      setAllowed(results.some(Boolean))
    })
  }, [role])

  if (allowed === null) return null
  return <>{allowed ? children : fallback}</>
}
