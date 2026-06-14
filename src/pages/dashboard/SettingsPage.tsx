import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authService } from '../../services/authService'
import { privacyService } from '../../services/privacyService'

export function SettingsPage() {
  const { user, profile } = useAuth()
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

  // ── Privacy & Data handlers (Deliverables 4+5) ───────────────────────────────
  const [exporting, setExporting] = useState<null | 'all' | 'memories' | 'dreams'>(null)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [resettingRecs, setResettingRecs] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  async function handleDownloadMyData() {
    setExporting('all')
    const { data, error } = await privacyService.exportMyData()
    setExporting(null)
    if (error) {
      alert('Export failed: ' + error)
      return
    }
    privacyService.downloadJson(`xnext-data-export-${new Date().toISOString().slice(0,10)}.json`, data)
  }

  async function handleExportMemories() {
    setExporting('memories')
    const { data, error } = await privacyService.exportMemories()
    setExporting(null)
    if (error) {
      alert('Export failed: ' + error)
      return
    }
    privacyService.downloadJson(`xnext-memories-${new Date().toISOString().slice(0,10)}.json`, data)
  }

  async function handleExportDreamList() {
    setExporting('dreams')
    const { data, error } = await privacyService.exportDreamList()
    setExporting(null)
    if (error) {
      alert('Export failed: ' + error)
      return
    }
    privacyService.downloadJson(`xnext-dream-list-${new Date().toISOString().slice(0,10)}.json`, data)
  }

  async function handleClearSearchHistory() {
    setClearingHistory(true)
    const { error } = await privacyService.clearSearchHistory()
    setClearingHistory(false)
    if (error) alert('Could not clear: ' + error)
    else alert('Search history cleared.')
  }

  async function handleResetRecommendations() {
    setResettingRecs(true)
    const { error } = await privacyService.resetRecommendations()
    setResettingRecs(false)
    if (error) alert('Could not reset: ' + error)
    else alert('Recommendations reset to defaults.')
  }

  async function handleDeleteAccount() {
    setDeleteError(null)
    if (deleteConfirmText.trim() !== 'DELETE MY ACCOUNT') {
      setDeleteError('Confirmation text does not match.')
      return
    }
    setDeleting(true)
    const { error } = await privacyService.requestAccountDeletion()
    setDeleting(false)

    if (error) {
      setDeleteError(error)
      return
    }

    setDeleteSuccess(true)
    // Sign out after short delay so user sees the message
    setTimeout(async () => {
      await authService.signOut()
      navigate('/auth/login', { replace: true })
    }, 1200)
  }

  async function handleCancelDeletion() {
    const { error } = await privacyService.cancelAccountDeletion()
    if (error) {
      alert('Could not cancel: ' + error)
    } else {
      // refresh will be picked by useAuth on next render or manual
      window.location.reload()
    }
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

      {/* Privacy & Data (Deliverable 4) */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Privacy &amp; Data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control your data. Export, reset signals, or delete your account. XNEXT is privacy-first.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleDownloadMyData}
            disabled={!!exporting}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 text-left"
          >
            {exporting === 'all' ? 'Preparing download…' : 'Download My Data'}
            <div className="text-xs text-muted-foreground">Full portable export (profile, dream list, memories, preferences)</div>
          </button>

          <button
            type="button"
            onClick={handleExportMemories}
            disabled={!!exporting}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 text-left"
          >
            {exporting === 'memories' ? 'Preparing…' : 'Export Memories'}
            <div className="text-xs text-muted-foreground">Quest completions + stories</div>
          </button>

          <button
            type="button"
            onClick={handleExportDreamList}
            disabled={!!exporting}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 text-left"
          >
            {exporting === 'dreams' ? 'Preparing…' : 'Export Dream List'}
            <div className="text-xs text-muted-foreground">Saved quests and notes</div>
          </button>

          <button
            type="button"
            onClick={handleClearSearchHistory}
            disabled={clearingHistory}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 text-left"
          >
            {clearingHistory ? 'Clearing…' : 'Clear Search History'}
            <div className="text-xs text-muted-foreground">Reset interaction-derived signals</div>
          </button>

          <button
            type="button"
            onClick={handleResetRecommendations}
            disabled={resettingRecs}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 text-left"
          >
            {resettingRecs ? 'Resetting…' : 'Reset Recommendations'}
            <div className="text-xs text-muted-foreground">Return to default discovery preferences</div>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-destructive/60 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 text-left"
          >
            Delete Account
            <div className="text-xs text-destructive/70">Permanent. 30-day recovery window.</div>
          </button>
        </div>

        {/* Delete confirmation panel (Deliverable 5) */}
        {showDeleteConfirm && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-4">
            <div>
              <p className="font-semibold text-destructive">Delete your XNEXT account?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This will immediately:
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
                <li>Delete your profile details</li>
                <li>Delete all Memories (quest completions and stories)</li>
                <li>Delete your Dream List</li>
                <li>Delete preferences and stored location history (home_location)</li>
                <li>Delete Pulse alerts</li>
                <li>Anonymize your audit logs (user id, IP, user agent removed)</li>
              </ul>
              <p className="mt-2 text-sm font-medium text-destructive">
                Your account will be permanently deleted in 30 days. You may log back in during this window to cancel deletion and recover the ability to use XNEXT (previously deleted content cannot be restored).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Type <span className="font-mono text-destructive">DELETE MY ACCOUNT</span> to confirm
              </label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className={inputCls}
                placeholder="DELETE MY ACCOUNT"
                autoComplete="off"
              />
            </div>

            {deleteError && (
              <div className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteError}</div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText.trim() !== 'DELETE MY ACCOUNT'}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? 'Deleting data…' : 'Permanently delete my account'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError(null) }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
            </div>
            {deleteSuccess && (
              <div className="text-sm text-green-600">Deletion initiated. You are being signed out…</div>
            )}
          </div>
        )}

        {/* Recovery banner if scheduled */}
        {profile?.data_deletion_scheduled_for && !showDeleteConfirm && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            Account deletion scheduled for {new Date(profile.data_deletion_scheduled_for).toLocaleDateString()}.
            {' '}
            <button type="button" onClick={handleCancelDeletion} className="underline font-medium">Cancel deletion</button> to keep your account.
          </div>
        )}
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
