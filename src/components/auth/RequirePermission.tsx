import { useEffect, useState, type ReactNode } from 'react'
import { rbacService, type AppPermission } from '../../services/rbacService'

interface RequirePermissionProps {
  /** The permission name to check (e.g. 'content.create') */
  permission: AppPermission
  /** Rendered when the user has the permission */
  children: ReactNode
  /** Rendered when the user lacks the permission. Defaults to null (hidden). */
  fallback?: ReactNode
}

/**
 * Conditionally renders children based on whether the authenticated user
 * has the required permission. Checks are made against the database via
 * `public.has_permission()` — cannot be spoofed from the client.
 *
 * Usage:
 *   <RequirePermission permission="content.create">
 *     <CreateQuestButton />
 *   </RequirePermission>
 *
 *   <RequirePermission permission="billing.manage" fallback={<UpgradeBanner />}>
 *     <BillingPanel />
 *   </RequirePermission>
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    rbacService.hasPermission(permission).then(setAllowed)
  }, [permission])

  // Pending check — render nothing to prevent flicker
  if (allowed === null) return null
  return <>{allowed ? children : fallback}</>
}
