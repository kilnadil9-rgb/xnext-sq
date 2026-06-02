import { useState, useEffect, type FormEvent } from 'react'
import { organizationService } from '../../services/organizationService'
import { useAuth } from '../../hooks/useAuth'
import type { Organization } from '../../lib/supabase/types'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'

export function OrganizationsPage() {
  const { user } = useAuth()

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)

  async function loadOrgs() {
    setLoading(true)
    setError(null)
    const { data, error } = await organizationService.getUserOrganizations()
    if (error) setError(error)
    else setOrgs(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadOrgs() }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your teams and workspaces.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          New organization
        </button>
      </div>

      {loading && <LoadingState message="Loading organizations…" />}

      {!loading && error && (
        <ErrorState message={error} onRetry={loadOrgs} />
      )}

      {!loading && !error && orgs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No organizations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one to collaborate with your team.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Create organization
          </button>
        </div>
      )}

      {!loading && !error && orgs.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} currentUserId={user?.id ?? ''} />
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadOrgs() }}
        />
      )}
    </div>
  )
}

// ─── OrgCard ──────────────────────────────────────────────────────────────────

function OrgCard({ org }: { org: Organization; currentUserId: string }) {
  return (
    <li className="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      {org.logo_url ? (
        <img
          src={org.logo_url}
          alt={org.name}
          className="h-10 w-10 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary shrink-0">
          {org.name.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{org.name}</p>
        {org.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{org.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">/{org.slug}</p>
      </div>
    </li>
  )
}

// ─── CreateOrgModal ───────────────────────────────────────────────────────────

interface CreateOrgModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateOrgModal({ onClose, onCreated }: CreateOrgModalProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate slug from name
  function handleNameChange(val: string) {
    setName(val)
    setSlug(
      val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Name is required.'); return }
    if (!slug.trim()) { setError('Slug is required.'); return }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('Slug may only contain lowercase letters, numbers, and hyphens.')
      return
    }

    setLoading(true)
    const { error } = await organizationService.createOrganization({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
    })

    if (error) {
      setError(error)
      setLoading(false)
      return
    }

    onCreated()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="text-lg font-semibold text-foreground">
            New organization
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="orgName" className="block text-sm font-medium text-foreground">
              Name
            </label>
            <input
              id="orgName"
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={inputCls}
              placeholder="Acme Inc."
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="orgSlug" className="block text-sm font-medium text-foreground">
              Slug
            </label>
            <input
              id="orgSlug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={inputCls}
              placeholder="acme-inc"
            />
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens only.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="orgDescription" className="block text-sm font-medium text-foreground">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="orgDescription"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
              placeholder="What does this organization do?"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
