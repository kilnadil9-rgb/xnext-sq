import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  questCompletionService,
  type QuestCompletionWithQuest,
} from '../../services/questCompletionService'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

/** /dashboard/completed — the user's trophy shelf. */
export function CompletedQuestsPage() {
  const [completions, setCompletions] = useState<QuestCompletionWithQuest[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await questCompletionService.getMyCompletions({
      limit: 100,
    })
    if (result.error) {
      setError(result.error)
      setCompletions([])
    } else {
      setCompletions(result.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Completed quests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every experience you’ve finished, newest first.
        </p>
      </div>

      {loading && <LoadingState message="Loading your completions…" />}

      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && completions.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Nothing completed yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Find something nearby on the Adventure Radar and make it happen.
          </p>
          <Link
            to="/dashboard/map"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Open Adventure Radar
          </Link>
        </div>
      )}

      {!loading && !error && completions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {completions.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {c.quests ? (
                    <Link
                      to={`/dashboard/quests/${c.quests.id}`}
                      className="truncate text-sm font-semibold text-foreground hover:text-primary"
                    >
                      🏆 {c.quests.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-muted-foreground">
                      🏆 (quest no longer available)
                    </p>
                  )}
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {c.quests?.experience_class ?? ''}
                    {c.quests?.city ? ` · ${c.quests.city}` : ''}
                    {' · '}
                    {formatDate(c.completed_at)}
                    {c.sq_score_at_completion !== null
                      ? ` · SQ ${Math.round(c.sq_score_at_completion)}`
                      : ''}
                  </p>
                </div>
              </div>
              {c.story && (
                <p className="mt-2 text-sm text-foreground">{c.story}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default CompletedQuestsPage
