/**
 * OrganizationSwitcher — Placeholder
 *
 * Displays the active organization and allows switching between orgs
 * the user is a member of.
 *
 * Wire up:
 *  1. Add an `activeOrgId` state to your global auth/org context.
 *  2. Call `organizationService.getUserOrganizations()` on mount.
 *  3. Replace the stub below with your real dropdown/popover component.
 */

import { useEffect, useState } from 'react'
import { organizationService } from '../../services/organizationService'
import type { Organization } from '../../lib/supabase/types'

interface OrganizationSwitcherProps {
  activeOrgId: string | null
  onSwitch: (orgId: string) => void
}

export function OrganizationSwitcher({ activeOrgId, onSwitch }: OrganizationSwitcherProps) {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    organizationService.getUserOrganizations().then(({ data }) => {
      setOrgs(data ?? [])
      setLoading(false)
    })
  }, [])

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null

  if (loading) {
    return (
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" aria-busy="true" />
    )
  }

  if (orgs.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">No organizations</span>
    )
  }

  return (
    <select
      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
      value={activeOrgId ?? activeOrg?.id ?? ''}
      onChange={(e) => onSwitch(e.target.value)}
      aria-label="Switch organization"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  )
}
