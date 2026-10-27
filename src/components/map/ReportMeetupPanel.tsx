import { useState } from 'react'
import { REPORT_REASONS, dogMeetupService, type QuestReportReason } from '../../services/dogMeetupService'

interface Props {
  questId: string
}

/** Compact "Report" action for a meetup: reason + optional note (≤500 chars). */
export function ReportMeetupPanel({ questId }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<QuestReportReason>('unsafe_or_not_dog_friendly')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    const res = await dogMeetupService.reportQuest(questId, reason, details)
    setBusy(false)
    if (res.error) {
      setMessage({ kind: 'error', text: res.error })
      return
    }
    setMessage({
      kind: 'ok',
      text: res.data ? 'Thanks. Our team will take a look.' : 'You have already reported this meetup.',
    })
    setOpen(false)
    setDetails('')
  }

  return (
    <div className="quest-report">
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setMessage(null) }}
          style={{ fontSize: '0.8rem', opacity: 0.75, textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}
        >
          ⚑ Report this meetup
        </button>
      )}
      {open && (
        <div role="group" aria-label="Report this meetup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="report-reason" style={{ fontSize: '0.8rem' }}>Reason</label>
          <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as QuestReportReason)}>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <label htmlFor="report-details" style={{ fontSize: '0.8rem' }}>Details (optional)</label>
          <textarea
            id="report-details"
            className="quest-complete-form__notes"
            rows={3}
            maxLength={500}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <div className="quest-sheet__actions quest-sheet__actions--compact">
            <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="quest-sheet__primary" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={message.kind === 'error' ? 'quest-sheet__error' : 'quest-sheet__meta'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
