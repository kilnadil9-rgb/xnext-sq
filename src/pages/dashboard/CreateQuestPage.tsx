import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { questService } from '../../services/questService'
import { QuestForm, type QuestFormValues } from '../../components/quests/QuestForm'

/** /dashboard/quests/new — create a quest (lands as draft). */
export function CreateQuestPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: QuestFormValues) => {
    setSubmitting(true)
    setError(null)
    const result = await questService.createQuest(values)
    setSubmitting(false)

    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to create quest.')
      return
    }
    navigate('/dashboard/quests/mine', {
      state: { created: result.data.id },
    })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New quest</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quests start as drafts — publish from{' '}
          <Link to="/dashboard/quests/mine" className="text-primary underline">
            My Quests
          </Link>{' '}
          when ready.
        </p>
      </div>

      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      <QuestForm
        submitLabel="Create draft"
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

export default CreateQuestPage
