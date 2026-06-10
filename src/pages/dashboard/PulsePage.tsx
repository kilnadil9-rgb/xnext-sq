import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { pulseService } from '../../services/pulseService'
import type { PulseAlert, PulseTrigger } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

export function PulsePage() {
  const [alerts, setAlerts] = useState<PulseAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPulseData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [alertsRes, countRes] = await Promise.all([
      pulseService.getActivePulseAlerts(),
      pulseService.getUnreadPulseCount(),
    ])

    if (alertsRes.error) {
      setError(alertsRes.error)
      setAlerts([])
    } else {
      setAlerts(alertsRes.data ?? [])
    }

    if (!countRes.error && countRes.data != null) {
      setUnreadCount(countRes.data)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadPulseData()
  }, [loadPulseData])

  async function handleMarkRead(id: string) {
    const result = await pulseService.markPulseAlertRead(id)
    if (result.error) {
      setError(result.error)
    } else {
      loadPulseData()
    }
  }

  async function handleDismiss(id: string) {
    const result = await pulseService.dismissPulseAlert(id)
    if (result.error) {
      setError(result.error)
    } else {
      loadPulseData()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Pulse</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {unreadCount} unread
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Time-sensitive quests and high-SQ opportunities
        </p>
      </div>

      {/* States */}
      {loading && <LoadingState message="Loading pulse alerts…" />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={loadPulseData}
        />
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No active pulse alerts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check back later for high-value opportunities.
          </p>
        </div>
      )}

      {!loading && !error && alerts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((alert) => (
            <PulseAlertCard
              key={alert.id}
              alert={alert}
              onMarkRead={handleMarkRead}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PulseAlertCard ───────────────────────────────────────────────────────────

function PulseAlertCard({
  alert,
  onMarkRead,
  onDismiss,
}: {
  alert: PulseAlert
  onMarkRead: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const isRead = !!alert.read_at
  const isDismissed = !!alert.dismissed_at

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {(alert.triggered_by as PulseTrigger).replace(/_/g, ' ')}
          </div>
          {alert.sq_score_at_trigger != null && (
            <div className="mt-1 text-lg font-semibold text-primary">
              SQ {alert.sq_score_at_trigger}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {isRead && <div>Read</div>}
          {isDismissed && <div>Dismissed</div>}
          {!isRead && !isDismissed && <div>Active</div>}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div>Created: {new Date(alert.created_at).toLocaleString()}</div>
        {alert.expires_at && (
          <div>Expires: {new Date(alert.expires_at).toLocaleString()}</div>
        )}
        <div>Quest: {alert.quest_id}</div>
      </div>

      <div className="mt-auto pt-4">
        <Link
          to={`/dashboard/quests/${alert.quest_id}`}
          className="text-sm text-primary hover:underline"
        >
          View Quest →
        </Link>

        <div className="mt-3 flex flex-wrap gap-2">
          {!isRead && (
            <button
              onClick={() => onMarkRead(alert.id)}
              className="text-xs px-3 py-1 rounded border border-border hover:bg-accent"
            >
              Mark Read
            </button>
          )}
          {!isDismissed && (
            <button
              onClick={() => onDismiss(alert.id)}
              className="text-xs px-3 py-1 rounded border border-border hover:bg-accent"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
