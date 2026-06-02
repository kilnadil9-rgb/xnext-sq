import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../services/authService'
import { AuthLayout } from '../../components/layouts/AuthLayout'

/**
 * Handles the password reset flow after the user clicks the email link.
 * Supabase redirects to this page with a session already established via PKCE.
 * We just need to call updatePassword().
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  // Wait for Supabase to establish the recovery session from the URL hash
  useEffect(() => {
    authService.getSession().then(({ data }) => {
      setSessionReady(!!data)
    })

    const unsubscribe = authService.onAuthStateChange((_user, session) => {
      if (session) setSessionReady(true)
    })

    return unsubscribe
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error } = await authService.updatePassword(password)

    if (error) {
      setError(error)
      setLoading(false)
      return
    }

    // Password updated — redirect to dashboard
    navigate('/dashboard', { replace: true })
  }

  if (!sessionReady) {
    return (
      <AuthLayout title="Verifying link…" subtitle="Please wait while we validate your reset link">
        <div className="flex justify-center py-4">
          <svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set new password" subtitle="Choose a strong password for your account">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Min. 8 characters"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirm" className="block text-sm font-medium text-foreground">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Re-enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  )
}
