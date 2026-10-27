/**
 * AdminMeetupsPage — /dashboard/admin/meetups
 *
 * Review queue for Dog Meetups + the reports inbox.
 * Approve copies the (private) pending photo to the public bucket and calls
 * approve_dog_meetup; Reject archives the row and deletes the private photo.
 * Pending photos are shown through short-lived signed URLs only.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  REPORT_REASONS,
  dogMeetupService,
  type QuestReportRow,
} from '../../services/dogMeetupService'
import type { Quest } from '../../lib/supabase/types'
import { dogInfoChips, dogSizeLabel, formatMeetupWhen } from '../../lib/dogMeetups'

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r

function PendingCard({ quest, onDone }: { quest: Quest; onDone: (id: string) => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const path = quest.dog_photo_pending_path ?? null

  useEffect(() => {
    let alive = true
    if (path) {
      void dogMeetupService.getPendingPhotoUrl(path).then((r) => {
        if (alive) setPhotoUrl(r.data)
      })
    }
    return () => { alive = false }
  }, [path])

  const run = async (kind: 'approve' | 'reject') => {
    setBusy(kind)
    setErr(null)
    const r = kind === 'approve'
      ? await dogMeetupService.approveMeetup(quest)
      : await dogMeetupService.rejectMeetup(quest.id)
    setBusy(null)
    if (r.error) setErr(r.error)
    else onDone(quest.id)
  }

  const chips = dogInfoChips(quest)
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
          {photoUrl
            ? <img src={photoUrl} alt="Submitted dog photo (private until approved)" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{path ? 'Loading…' : 'No photo'}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{quest.title}</p>
          <p className="text-xs text-muted-foreground">{formatMeetupWhen(quest) ?? 'No time'}</p>
          <p className="text-xs text-muted-foreground">{quest.location_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Dogs: {dogSizeLabel(quest.dog_size) ?? 'n/a'}{chips.length ? ` · ${chips.join(' · ')}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Submitted {new Date(quest.created_at).toLocaleString()} · by {quest.created_by.slice(0, 8)}…
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{quest.description}</p>
      {err && <p className="mt-2 text-sm text-red-300" role="alert">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button disabled={busy !== null} onClick={() => void run('approve')}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button disabled={busy !== null} onClick={() => void run('reject')}
          className="rounded-md border border-red-400/50 px-3 py-1.5 text-sm text-red-300 disabled:opacity-50">
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  )
}

export function AdminMeetupsPage() {
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<Quest[]>([])
  const [reports, setReports] = useState<QuestReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportErr, setReportErr] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!profile?.is_admin) navigate('/dashboard', { replace: true })
  }, [profile, authLoading, navigate])

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!profile?.is_admin) return
    let cancelled = false
    void Promise.all([
      dogMeetupService.listPendingMeetups(),
      dogMeetupService.listReports('open'),
    ]).then(([p, r]) => {
      if (cancelled) return
      setError(p.error ?? r.error ?? null)
      if (!p.error) setPending(p.data ?? [])
      if (!r.error) setReports(r.data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.is_admin, reloadKey])

  const refresh = () => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  if (authLoading || !profile?.is_admin) return null

  const resolveReport = async (id: string, status: 'reviewed' | 'dismissed') => {
    setReportErr(null)
    const r = await dogMeetupService.setReportStatus(id, status)
    if (r.error) setReportErr(r.error)
    else setReports((prev) => prev.filter((x) => x.id !== id))
  }

  const takeDown = async (report: QuestReportRow) => {
    setReportErr(null)
    const r = await dogMeetupService.rejectMeetup(report.quest_id)
    if (r.error) { setReportErr(r.error); return }
    await resolveReport(report.id, 'reviewed')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dog Meetups</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${pending.length} waiting for review · ${reports.length} open report${reports.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
          Refresh
        </button>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <section className="space-y-4" aria-label="Meetups waiting for review">
        <h2 className="text-sm font-semibold text-foreground">Waiting for review</h2>
        {!loading && pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
        {pending.map((q) => (
          <PendingCard key={q.id} quest={q} onDone={(id) => setPending((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </section>

      <section className="space-y-3" aria-label="Open reports">
        <h2 className="text-sm font-semibold text-foreground">Open reports</h2>
        {reportErr && <p className="text-sm text-red-300" role="alert">{reportErr}</p>}
        {!loading && reports.length === 0 && <p className="text-sm text-muted-foreground">No open reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-3">
            <p className="text-sm font-medium text-foreground">{r.quest?.title ?? 'Unknown listing'}</p>
            <p className="text-xs text-muted-foreground">
              {reasonLabel(r.reason)} · {new Date(r.created_at).toLocaleString()} · listing is {r.quest?.status ?? 'unknown'}
            </p>
            {r.details && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{r.details}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {r.quest && r.quest.listing_type === 'dog_meetup' && r.quest.status !== 'archived' && (
                <button onClick={() => void takeDown(r)}
                  className="rounded-md border border-red-400/50 px-3 py-1 text-xs text-red-300">
                  Take down listing
                </button>
              )}
              <button onClick={() => void resolveReport(r.id, 'reviewed')}
                className="rounded-md border border-border px-3 py-1 text-xs text-foreground">
                Mark reviewed
              </button>
              <button onClick={() => void resolveReport(r.id, 'dismissed')}
                className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

export default AdminMeetupsPage
