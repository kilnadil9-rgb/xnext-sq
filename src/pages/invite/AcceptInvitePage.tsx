import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { organizationService } from '../../services/organizationService'
import { AuthLayout } from '../../components/layouts/AuthLayout'
import { useAuth } from '../../hooks/useAuth'

type PageState = 'loading' | 'requires_login' | 'accepting' | 'success' | 'error'

/**
 * Accept an org invitation via token from the URL.
 *
 * Route: /invite/:token
 *
 * Flow:
 *  1. If user is not logged in → show prompt to log in first (preserving the token URL)
 *  2. If logged in → call organizationService.acceptInvitation(token)
 *  3. On success → redirect to /dashboard/organizations
 *  4. On error → show message
 */
export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [state, setState] = useState<PageState>('loading')
  const [orgName, setOrgName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Wait for auth to resolve before proceeding
    if (authLoading) return

    if (!user) {
      setState('requires_login')
      return
    }

    if (!token) {
      setError('Invalid invitation link — no token found.')
      setState('error')
      return
    }

    // Auto-accept once user is confirmed logged in
    acceptInvitation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token])

  async function acceptInvitation() {
    if (!token) return
    setState('accepting')

    const { data: member, error } = await organizationService.acceptInvitation(token)

    if (error || !member) {
      setError(error ?? 'Failed to accept invitation. The link may have expired.')
      setState('error')
      return
    }

    // Fetch org name for the success screen
    const { data: org } = await organizationService.getOrganizationById(
      member.organization_id
    )
    setOrgName(org?.name ?? null)
    setState('success')

    // Redirect after a short delay
    setTimeout(() => navigate('/dashboard/organizations', { replace: true }), 2500)
  }

  // ── Auth loading ───────────────────────────────────────────────────────────
  if (state === 'loading' || authLoading) {
    return (
      <AuthLayout title="Validating invitation…">
        <div className="flex justify-center py-4">
          <svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthLayout>
    )
  }

  // ── Requires login ─────────────────────────────────────────────────────────
  if (state === 'requires_login') {
    return (
      <AuthLayout
        title="Sign in to accept"
        subtitle="You need to be signed in to accept this invitation"
      >
        <div className="space-y-3">
          <Link
            to={`/auth/login?next=/invite/${token}`}
            className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
          <Link
            to={`/auth/signup?next=/invite/${token}`}
            className="block w-full rounded-md border border-input px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-accent"
          >
            Create account
          </Link>
        </div>
      </AuthLayout>
    )
  }

  // ── Accepting ──────────────────────────────────────────────────────────────
  if (state === 'accepting') {
    return (
      <AuthLayout title="Accepting invitation…">
        <div className="flex justify-center py-4">
          <svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthLayout>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (state === 'success') {
    return (
      <AuthLayout
        title="You're in!"
        subtitle={orgName ? `You've joined ${orgName}` : 'Invitation accepted'}
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">
            Redirecting you to your dashboard…
          </p>
        </div>
      </AuthLayout>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  return (
    <AuthLayout title="Invitation invalid" subtitle="This link may have expired or already been used">
      <div className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Link
          to="/dashboard"
          className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Go to dashboard
        </Link>
      </div>
    </AuthLayout>
  )
}
