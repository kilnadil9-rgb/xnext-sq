import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { questService } from '../../services/questService'
import type { Quest, ExperienceClass } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

type ClassFilter = 'all' | ExperienceClass

const CLASS_FILTERS: { label: string; value: ClassFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Wonder', value: 'wonder' },
  { label: 'Opportunity', value: 'opportunity' },
  { label: 'Transformation', value: 'transformation' },
  { label: 'Connection', value: 'connection' },
]

export function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ClassFilter>('all')

  const loadQuests = useCallback(async (currentFilter: ClassFilter) => {
    setLoading(true)
    setError(null)

    const result =
      currentFilter === 'all'
        ? await questService.listPublishedQuests()
        : await questService.getQuestsByClass(currentFilter)

    if (result.error) {
      setError(result.error)
      setQuests([])
    } else {
      setQuests(result.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadQuests(filter)
  }, [filter, loadQuests])

  function handleFilterChange(newFilter: ClassFilter) {
    if (newFilter !== filter) {
      setFilter(newFilter)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Quests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover meaningful real-world experiences.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {CLASS_FILTERS.map((f) => (
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
      {loading && <LoadingState message="Loading quests…" />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => loadQuests(filter)}
        />
      )}

      {!loading && !error && quests.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No quests found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === 'all'
              ? 'There are no published quests yet.'
              : `No ${filter} quests are currently published.`}
          </p>
        </div>
      )}

      {!loading && !error && quests.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quests.map((quest) => (
            <QuestCard key={quest.id} quest={quest} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── QuestCard ────────────────────────────────────────────────────────────────

function QuestCard({ quest }: { quest: Quest }) {
  const location = [quest.city, quest.country_code].filter(Boolean).join(', ') || 'Location not specified'
  const score = quest.sq_score

  return (
    <Link
      to={`/dashboard/quests/${quest.id}`}
      className="block no-underline"
    >
      <div className="flex flex-col rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground capitalize">
            {quest.experience_class}
          </span>

          {score != null && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              SQ {score}
            </span>
          )}
        </div>

        <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-foreground">
          {quest.title}
        </h3>

        <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-3">
          {quest.description || 'No description provided.'}
        </p>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{location}</span>
          {quest.published_at && (
            <span className="shrink-0 pl-2">
              {new Date(quest.published_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
