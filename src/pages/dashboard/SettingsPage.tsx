import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authService } from '../../services/authService'

export function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // ── Change password ────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)

    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.')
      return
    }

    setPwSaving(true)
    const { error } = await authService.updatePassword(newPassword)
    setPwSaving(false)

    if (error) {
      setPwError(error)
    } else {
      setPwSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwSuccess(false), 3000)
    }
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await authService.signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account security and preferences.
        </p>
      </div>

      {/* Account info */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Account</h2>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Email: </span>
          {user?.email}
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">User ID: </span>
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{user?.id}</code>
        </div>
      </section>

      {/* Change password */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Change password</h2>

        <form onSubmit={handlePasswordChange} noValidate className="space-y-4">
          {pwError && (
            <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div role="status" className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-600">
              Password updated successfully.
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
              placeholder="Re-enter new password"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwSaving || !newPassword || !confirmPassword}
              className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pwSaving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-destructive/30 bg-card p-6">
        <h2 className="mb-1 text-base font-semibold text-foreground">Danger zone</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign out of your account on this device.
        </p>
        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
          className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
