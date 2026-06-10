import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { questService } from '../../services/questService'
import type { Quest, QuestStatus } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

const STATUS_STYLES: Record<QuestStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-100 text-slate-500',
}

/** /dashboard/quests/mine — manage your own quests (publish / edit / archive). */
export function MyQuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await questService.getMyQuests({ limit: 100 })
    if (result.error) {
      setError(result.error)
      setQuests([])
    } else {
      setQuests(result.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const transition = async (quest: Quest, status: QuestStatus) => {
    setBusyId(quest.id)
    setActionError(null)
    const result = await questService.setQuestStatus(quest.id, status)
    setBusyId(null)
    if (result.error || !result.data) {
      setActionError(result.error ?? 'Action failed.')
      return
    }
    setQuests((prev) =>
      prev.map((q) => (q.id === quest.id ? result.data! : q)),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Quests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafts are private. Published quests appear on everyone’s
            Adventure Radar.
          </p>
        </div>
        <Link
          to="/dashboard/quests/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + New quest
        </Link>
      </div>

      {actionError && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {loading && <LoadingState message="Loading your quests…" />}

      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && quests.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            You haven’t created any quests yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first quest and publish it to put it on the radar.
          </p>
          <Link
            to="/dashboard/quests/new"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Create a quest
          </Link>
        </div>
      )}

      {!loading && !error && quests.length > 0 && (
        <ul className="flex flex-col gap-3">
          {quests.map((quest) => {
            const busy = busyId === quest.id
            return (
              <li
                key={quest.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {quest.title}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {quest.experience_class}
                      {quest.city ? ` · ${quest.city}` : ''}
                      {quest.sq_score !== null
                        ? ` · SQ ${Math.round(quest.sq_score)}`
                        : ''}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quest.status]}`}
                  >
                    {quest.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {quest.status !== 'published' &&
                    quest.status !== 'archived' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => transition(quest, 'published')}
                        className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {busy ? '…' : 'Publish'}
                      </button>
                    )}
                  {quest.status === 'published' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => transition(quest, 'draft')}
                      className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground disabled:opacity-50"
                    >
                      {busy ? '…' : 'Unpublish'}
                    </button>
                  )}
                  <Link
                    to={`/dashboard/quests/${quest.id}/edit`}
                    className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground"
                  >
                    Edit
                  </Link>
                  {quest.status === 'published' && (
                    <Link
                      to={`/dashboard/quests/${quest.id}`}
                      className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground"
                    >
                      View
                    </Link>
                  )}
                  {quest.status !== 'archived' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => transition(quest, 'archived')}
                      className="inline-flex min-h-9 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default MyQuestsPage
