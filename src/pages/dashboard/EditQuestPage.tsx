import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { questService } from '../../services/questService'
import type { Quest } from '../../lib/supabase/types'
import { QuestForm, type QuestFormValues } from '../../components/quests/QuestForm'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'

/** /dashboard/quests/:id/edit — edit one of your own quests. */
export function EditQuestPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [quest, setQuest] = useState<Quest | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)

    questService.getMyQuestById(id).then((result) => {
      if (cancelled) return
      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Quest not found.')
      } else {
        setQuest(result.data)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [id])

  const handleSubmit = async (values: QuestFormValues) => {
    if (!id) return
    setSubmitting(true)
    setSaveError(null)
    const result = await questService.updateQuest(id, values)
    setSubmitting(false)

    if (result.error) {
      setSaveError(result.error)
      return
    }
    navigate('/dashboard/quests/mine', { state: { updated: id } })
  }

  if (loading) return <LoadingState message="Loading quest…" />
  if (loadError || !quest) {
    return (
      <ErrorState
        title="Can’t edit this quest"
        message={loadError ?? 'Quest not found or not yours.'}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Edit quest</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: <span className="capitalize">{quest.status}</span>
        </p>
      </div>

      {saveError && (
        <p
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {saveError}
        </p>
      )}

      <QuestForm
        initialQuest={quest}
        submitLabel="Save changes"
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

export default EditQuestPage
