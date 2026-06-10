import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { dreamListService } from '../../services/dreamListService'
import type { DreamListStatus, DreamListItemWithQuest } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

type StatusFilter = 'all' | DreamListStatus

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Saved', value: 'saved' },
  { label: 'Planned', value: 'planned' },
  { label: 'Completed', value: 'completed' },
  { label: 'Dismissed', value: 'dismissed' },
]

export function DreamListPage() {
  const [dreamList, setDreamList] = useState<DreamListItemWithQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const loadDreamList = useCallback(async (currentFilter: StatusFilter) => {
    setLoading(true)
    setError(null)

    const options = currentFilter === 'all' ? {} : { status: currentFilter as DreamListStatus }
    const result = await dreamListService.getMyDreamList(options)

    if (result.error) {
      setError(result.error)
      setDreamList([])
    } else {
      setDreamList(result.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDreamList(filter)
  }, [filter, loadDreamList])

  function handleFilterChange(newFilter: StatusFilter) {
    if (newFilter !== filter) {
      setFilter(newFilter)
    }
  }

  async function handleUpdateStatus(id: string, status: DreamListStatus) {
    const result = await dreamListService.updateDreamListItem(id, { status })
    if (result.error) {
      setError(result.error)
    } else {
      loadDreamList(filter)
    }
  }

  async function handleMarkCompleted(id: string) {
    const result = await dreamListService.markDreamListItemCompleted(id)
    if (result.error) {
      setError(result.error)
    } else {
      loadDreamList(filter)
    }
  }

  async function handleRemove(id: string) {
    const result = await dreamListService.removeFromDreamList(id)
    if (result.error) {
      setError(result.error)
    } else {
      loadDreamList(filter)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dream List</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quests you want to remember and plan for.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            disabled={loading}
            className={`
              rounded-md px-4 py-1.5 text-sm font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                filter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-accent'
              }
            `}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && <LoadingState message="Loading dream list…" />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => loadDreamList(filter)}
        />
      )}

      {!loading && !error && dreamList.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No dream list items yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === 'all'
              ? 'Save quests from the Quests page to start your list.'
              : `No items with status "${filter}".`}
          </p>
          <Link
            to="/dashboard/quests"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Explore quests
          </Link>
        </div>
      )}

      {!loading && !error && dreamList.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dreamList.map((item) => (
            <DreamListCard
              key={item.id}
              item={item}
              onUpdateStatus={handleUpdateStatus}
              onMarkCompleted={handleMarkCompleted}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── DreamListCard ────────────────────────────────────────────────────────────

function DreamListCard({
  item,
  onUpdateStatus,
  onMarkCompleted,
  onRemove,
}: {
  item: DreamListItemWithQuest
  onUpdateStatus: (id: string, status: DreamListStatus) => void
  onMarkCompleted: (id: string) => void
  onRemove: (id: string) => void
}) {
  const q = item.quests
  const questLabel = q ? q.title : (item.quest_id ? `Quest ${item.quest_id.slice(0, 8)}...` : 'Unknown quest')
  const questLinkId = q ? q.id : item.quest_id

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to={`/dashboard/quests/${questLinkId}`}
            className="font-semibold text-foreground hover:underline"
          >
            {questLabel}
          </Link>
          {q && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="uppercase tracking-wider text-muted-foreground">{q.experience_class}</span>
              {q.sq_score != null && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">SQ {q.sq_score}</span>
              )}
            </div>
          )}
          <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
            {item.status}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Priority: {item.priority}
        </div>
      </div>

      {item.notes && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{item.notes}</p>
      )}

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {item.target_date && <div>Target: {new Date(item.target_date).toLocaleDateString()}</div>}
        <div>Added: {new Date(item.created_at).toLocaleDateString()}</div>
        {item.completed_at && (
          <div>Completed: {new Date(item.completed_at).toLocaleDateString()}</div>
        )}
      </div>

      <div className="mt-auto pt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onUpdateStatus(item.id, 'planned')}
          disabled={item.status === 'planned'}
          className="text-xs px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
        >
          Mark Planned
        </button>
        <button
          onClick={() => onMarkCompleted(item.id)}
          disabled={item.status === 'completed'}
          className="text-xs px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
        >
          Mark Completed
        </button>
        <button
          onClick={() => onUpdateStatus(item.id, 'dismissed')}
          disabled={item.status === 'dismissed'}
          className="text-xs px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          onClick={() => onRemove(item.id)}
          className="text-xs px-3 py-1 rounded border border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          Remove
        </button>
      </div>
    </div>
  )
}
