import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

import { pulseService } from '../../services/pulseService'
import { dreamListService } from '../../services/dreamListService'
import { questService } from '../../services/questService'
import type { PulseAlert, DreamListItemWithQuest, Quest } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

/**
 * Dashboard home — real data previews for Active Pulse (top 3), Saved Dream List (top 3 saved),
 * and Discover Quests (top 3 published). Partial section failures are tolerated.
 */
export function HomePage() {
  // Preview data (top 3 from each source)
  const [pulseAlerts, setPulseAlerts] = useState<PulseAlert[]>([])
  const [dreamItems, setDreamItems] = useState<DreamListItemWithQuest[]>([])
  const [discoverQuests, setDiscoverQuests] = useState<Quest[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sectionErrors, setSectionErrors] = useState<{
    pulse?: string
    dream?: string
    quests?: string
  }>({})

  const loadPreviews = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSectionErrors({})

    const [pulseRes, dreamRes, questsRes] = await Promise.all([
      pulseService.getActivePulseAlerts({ limit: 3 }),
      dreamListService.getMyDreamList({ limit: 3, status: 'saved' }),
      questService.listPublishedQuests({ limit: 3 }),
    ])

    let failCount = 0

    if (pulseRes.error) {
      setSectionErrors((prev) => ({ ...prev, pulse: pulseRes.error ?? undefined }))
      failCount++
    } else {
      setPulseAlerts(pulseRes.data ?? [])
    }

    if (dreamRes.error) {
      setSectionErrors((prev) => ({ ...prev, dream: dreamRes.error ?? undefined }))
      failCount++
    } else {
      setDreamItems(dreamRes.data ?? [])
    }

    if (questsRes.error) {
      setSectionErrors((prev) => ({ ...prev, quests: questsRes.error ?? undefined }))
      failCount++
    } else {
      setDiscoverQuests(questsRes.data ?? [])
    }

    if (failCount === 3) {
      setError('Failed to load dashboard previews.')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadPreviews()
  }, [loadPreviews])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Today
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What might happen next?
        </p>
      </div>

      {loading && <LoadingState message="Loading your previews…" />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={loadPreviews}
        />
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {/* Active Pulse Preview */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Pulse Alerts</h2>
              <Link
                to="/dashboard/pulse"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all →
              </Link>
            </div>

            {sectionErrors.pulse ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm">
                <span className="text-destructive">Failed to load pulse alerts.</span>{' '}
                <button
                  onClick={loadPreviews}
                  className="text-primary underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            ) : pulseAlerts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-foreground">No active pulse alerts</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Time-sensitive opportunities matching your preferences will appear here.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pulseAlerts.map((alert) => (
                  <ActivePulsePreviewCard key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </section>

          {/* Saved Dream List Preview */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Dream List Highlights</h2>
              <Link
                to="/dashboard/dream-list"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all →
              </Link>
            </div>

            {sectionErrors.dream ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm">
                <span className="text-destructive">Failed to load dream list.</span>{' '}
                <button
                  onClick={loadPreviews}
                  className="text-primary underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            ) : dreamItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-foreground">No saved items yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save experiences to your Dream List to track what matters.
                </p>
                <Link
                  to="/dashboard/quests"
                  className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Explore opportunities
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dreamItems.map((item) => (
                  <SavedDreamPreviewCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* Discover Quests Preview */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Opportunities Today</h2>
              <Link
                to="/dashboard/quests"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all →
              </Link>
            </div>

            {sectionErrors.quests ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm">
                <span className="text-destructive">Failed to load quests.</span>{' '}
                <button
                  onClick={loadPreviews}
                  className="text-primary underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            ) : discoverQuests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-foreground">No opportunities today yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check back soon or explore the map for nearby experiences.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {discoverQuests.map((quest) => (
                  <DiscoverQuestPreviewCard key={quest.id} quest={quest} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// ─── Preview Cards (display only; no actions) ─────────────────────────────────

function ActivePulsePreviewCard({ alert }: { alert: PulseAlert }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {alert.triggered_by.replace(/_/g, ' ')}
        </div>
        {alert.sq_score_at_trigger != null && (
          <div className="mt-1 text-lg font-semibold text-primary">
            SQ {alert.sq_score_at_trigger}
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {new Date(alert.created_at).toLocaleString()}
      </div>

      <div className="mt-auto pt-3">
        <Link to="/dashboard/pulse" className="text-sm text-primary hover:underline">
          View in Pulse →
        </Link>
      </div>
    </div>
  )
}

function SavedDreamPreviewCard({ item }: { item: DreamListItemWithQuest }) {
  const q = item.quests
  const questLabel = q ? q.title : (item.quest_id ? `Quest ${item.quest_id.slice(0, 8)}...` : 'Unknown quest')
  const linkId = q ? q.id : item.quest_id

  return (
    <Link to={`/dashboard/quests/${linkId}`} className="block no-underline">
      <div className="flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
        <div className="font-semibold text-foreground line-clamp-2">{questLabel}</div>

        <div className="mt-2 text-xs text-muted-foreground">Priority: {item.priority}</div>

        {item.target_date && (
          <div className="mt-1 text-xs text-muted-foreground">
            Target: {new Date(item.target_date).toLocaleDateString()}
          </div>
        )}
      </div>
    </Link>
  )
}

function DiscoverQuestPreviewCard({ quest }: { quest: Quest }) {
  return (
    <Link to={`/dashboard/quests/${quest.id}`} className="block no-underline">
      <div className="flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground capitalize">
            {quest.experience_class}
          </span>

          {quest.sq_score != null && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              SQ {quest.sq_score}
            </span>
          )}
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-semibold text-foreground">
          {quest.title}
        </h3>
      </div>
    </Link>
  )
}
