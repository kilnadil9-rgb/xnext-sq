import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { questService } from '../../services/questService'
import { dreamListService } from '../../services/dreamListService'
import type { QuestByIdResult } from '../../lib/supabase/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { VerifiedBadge } from '../../components/ui/VerifiedBadge'
import { explorerProofLabel } from '../../lib/trust'

export function QuestDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [questData, setQuestData] = useState<QuestByIdResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isSaved, setIsSaved] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function fetchQuest(questId: string) {
    setLoading(true)
    setError(null)
    const result = await questService.getQuestById(questId)
    if (result.error) {
      setError(result.error)
    } else {
      setQuestData(result.data)
    }
    setLoading(false)
  }

  async function checkIfSaved(questId: string) {
    const result = await dreamListService.getDreamListItemByQuestId(questId)
    if (!result.error && result.data) {
      setIsSaved(true)
    } else {
      setIsSaved(false)
    }
  }

  useEffect(() => {
    if (id) {
      fetchQuest(id)
      checkIfSaved(id)
    }
  }, [id])

  async function handleSaveToDreamList() {
    if (!id || isSaved || saveLoading) return
    setSaveLoading(true)
    setSaveError(null)
    const result = await dreamListService.addToDreamList(id)
    if (result.error) {
      setSaveError(result.error)
    } else if (result.data) {
      setIsSaved(true)
    }
    setSaveLoading(false)
  }

  if (!id) {
    return (
      <ErrorState
        title="Invalid Quest"
        message="No quest ID was provided in the URL."
      />
    )
  }

  if (loading) {
    return <LoadingState message="Loading quest details…" />
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => fetchQuest(id)}
      />
    )
  }

  const quest = questData?.quest
  if (!quest) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Quest not found"
          message="This quest may not exist, may not be published, or the ID is invalid."
        />
        <Link to="/dashboard/quests" className="inline-block text-sm text-primary hover:underline">
          ← Back to all quests
        </Link>
      </div>
    )
  }

  const scoring = questData?.scoring_factors
  const windows = questData?.availability_windows

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link to="/dashboard/quests" className="text-sm text-primary hover:underline">
          ← Back to Quests
        </Link>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground capitalize">
            {quest.experience_class}
          </span>
          {quest.sq_score != null && (
            <span className="text-xl font-semibold text-primary">SQ {quest.sq_score}</span>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">
          {quest.title}
          {quest.verified_location && (
            <>
              {' '}
              <VerifiedBadge withLabel size={20} />
            </>
          )}
        </h1>
        {/* Social proof — real counts only; renders nothing at zero. */}
        {explorerProofLabel(quest) && (
          <p className="mt-1 text-sm font-medium text-[#3b82f6]">
            {explorerProofLabel(quest)}
          </p>
        )}
        {quest.location_name && (
          <p className="mt-1 text-muted-foreground">{quest.location_name}</p>
        )}
        {(quest.city || quest.country_code) && (
          <p className="text-sm text-muted-foreground">
            {[quest.city, quest.country_code].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {/* Save to Dream List action */}
      <div>
        <button
          onClick={handleSaveToDreamList}
          disabled={isSaved || saveLoading}
          className={`
            rounded-md px-5 py-2 text-sm font-semibold transition-colors
            ${isSaved
              ? 'bg-green-100 text-green-800 cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
            }
          `}
        >
          {saveLoading ? 'Saving…' : isSaved ? 'Saved to Dream List ✓' : 'Save to Dream List'}
        </button>
        {saveError && (
          <p className="mt-1 text-sm text-destructive">{saveError}</p>
        )}
        {isSaved && (
          <p className="mt-1 text-xs text-muted-foreground">This quest is in your dream list.</p>
        )}
      </div>

      {/* Description */}
      {quest.description && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">About this quest</h2>
          <p className="text-foreground whitespace-pre-wrap">{quest.description}</p>
        </div>
      )}

      {/* Tags */}
      {quest.tags && quest.tags.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {quest.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* External URL */}
      {quest.external_url && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">External link</h2>
          <a
            href={quest.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all"
          >
            {quest.external_url}
          </a>
        </div>
      )}

      {/* Availability Windows (from QuestByIdResult) */}
      {windows && Array.isArray(windows) && windows.length > 0 ? (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">Availability Windows</h2>
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <pre className="overflow-auto text-xs text-muted-foreground">
              {JSON.stringify(windows, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}

      {/* Scoring Factors (from QuestByIdResult) */}
      {scoring ? (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-2">Scoring Factors</h2>
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <pre className="overflow-auto text-xs text-muted-foreground">
              {JSON.stringify(scoring, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}

      {/* Fallback notes when data not present (as returned by current service) */}
      {(!scoring || !windows) && (
        <div className="text-xs text-muted-foreground italic">
          Additional scoring and availability data is not loaded for this quest in the current view.
        </div>
      )}
    </div>
  )
}
