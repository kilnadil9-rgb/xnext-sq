import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { privacyService } from '../../services/privacyService'

const PRIVACY_VERSION = '2026-06-01'
const TERMS_VERSION = '2026-06-01'

export function ConsentPage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    if (!acceptedPrivacy || !acceptedTerms) {
      setError('You must accept both the Privacy Policy and Terms of Service to continue.')
      return
    }
    setSubmitting(true)
    setError(null)

    const { error: acceptErr } = await privacyService.acceptConsents({
      privacyVersion: PRIVACY_VERSION,
      termsVersion: TERMS_VERSION,
    })

    setSubmitting(false)

    if (acceptErr) {
      setError(acceptErr)
      return
    }

    // Success — refresh profile so DashboardLayout consent gate sees the new acceptance immediately.
    await refreshProfile()
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">SQ</div>
          <div>
            <div className="font-semibold text-xl">XNEXT</div>
            <div className="text-xs text-muted-foreground">Welcome</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Welcome to XNEXT</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before you continue, please review and accept our Privacy Policy and Terms of Service.
          Your data stays yours.
        </p>

        <div className="mt-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              I have read and accept the{' '}
              <Link to="/privacy-policy" target="_blank" className="underline">Privacy Policy</Link>{' '}
              (v{PRIVACY_VERSION}). XNEXT collects account info, location (opt-in), Dream Lists, Memories, and Quest activity to power the experience. You can export or delete everything.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              I have read and accept the{' '}
              <Link to="/terms-of-service" target="_blank" className="underline">Terms of Service</Link>{' '}
              (v{TERMS_VERSION}). I understand that real-world experiences carry risks and that I am responsible for my participation and the content I create.
            </span>
          </label>
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={submitting || !acceptedPrivacy || !acceptedTerms}
          className="mt-6 w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Saving acceptance…' : 'Accept & Continue'}
        </button>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Your acceptance (timestamp + version) is stored with your user id for compliance records.
          You can review the full policies anytime from the footer Trust Center.
        </p>

        {user && (
          <p className="mt-3 text-center text-[10px] text-muted-foreground/70">
            Signed in as {user.email}
          </p>
        )}
      </div>
    </div>
  )
}
