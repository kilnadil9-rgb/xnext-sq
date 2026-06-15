/**
 * AdminReviewPage — /dashboard/admin/review
 *
 * Lists pending_review quests for moderation.
 * Approve → published (quest enters Adventure Radar + map).
 * Reject  → archived (hidden from all views).
 *
 * Access: is_admin = true on the authenticated user's profile.
 * Non-admins are redirected to /dashboard immediately.
 *
 * RLS requirement: migration 019 must be applied so admins can
 * SELECT pending_review quests and UPDATE any quest status.
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase/client'
import type { QuestStatus } from '../../lib/supabase/types'

interface ReviewQuest {
  id: string
  title: string
  description: string | null
  experience_class: string
  location_name: string | null
  city: string | null
  country_code: string | null
  media_urls: string[]
  created_by: string
  created_at: string
  status: QuestStatus
}

type ActionState = 'idle' | 'approving' | 'rejecting' | 'done'

export function AdminReviewPage() {
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [quests, setQuests] = useState<ReviewQuest[]>([])
  const [loadingQuests, setLoadingQuests] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionState, setActionState] = useState<Record<string, ActionState>>({})
  const [actionError, setActionError] = useState<Record<string, string>>({})

  // Redirect non-admins as soon as profile resolves
  useEffect(() => {
    if (authLoading) return
    if (!profile?.is_admin) {
      navigate('/dashboard', { replace: true })
    }
  }, [profile, authLoading, navigate])

  const fetchPendingQuests = useCallback(async () => {
    setLoadingQuests(true)
    setFetchError(null)

    const { data, error } = await supabase
      .from('quests')
      .select('id, title, description, experience_class, location_name, city, country_code, media_urls, created_by, created_at, status')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })

    if (error) {
      setFetchError(error.message)
    } else {
      setQuests((data ?? []) as ReviewQuest[])
    }
    setLoadingQuests(false)
  }, [])

  useEffect(() => {
    if (profile?.is_admin) {
      fetchPendingQuests()
    }
  }, [profile?.is_admin, fetchPendingQuests])

  const handleAction = async (id: string, newStatus: 'published' | 'archived') => {
    setActionState((s) => ({ ...s, [id]: newStatus === 'published' ? 'approving' : 'rejecting' }))
    setActionError((s) => ({ ...s, [id]: '' }))

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }
    if (newStatus === 'published') {
      updatePayload.published_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('quests')
      .update(updatePayload as never)
      .eq('id', id)

    if (error) {
      setActionState((s) => ({ ...s, [id]: 'idle' }))
      setActionError((s) => ({ ...s, [id]: error.message }))
      return
    }

    setActionState((s) => ({ ...s, [id]: 'done' }))
    // Remove from list after brief delay so user sees confirmation
    setTimeout(() => {
      setQuests((prev) => prev.filter((q) => q.id !== id))
    }, 600)
  }

  // Show nothing while auth resolves (redirect fires in useEffect)
  if (authLoading || !profile?.is_admin) return null

  const CLASS_ICON: Record<string, string> = {
    wonder: '✨',
    opportunity: '🎯',
    transformation: '🔥',
    connection: '🤝',
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Discovery Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loadingQuests
              ? 'Loading…'
              : quests.length === 0
                ? 'Queue is clear — nothing pending review.'
                : `${quests.length} submission${quests.length !== 1 ? 's' : ''} awaiting review`}
          </p>
        </div>
        <button
          onClick={fetchPendingQuests}
          disabled={loadingQuests}
          className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {fetchError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {fetchError}
        </div>
      )}

      {!loadingQuests && quests.length === 0 && !fetchError && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-medium">Queue is clear</p>
          <p className="text-sm mt-1">No discoveries pending review.</p>
        </div>
      )}

      <div className="space-y-4">
        {quests.map((quest) => {
          const state = actionState[quest.id] ?? 'idle'
          const isDone = state === 'done'
          const isBusy = state === 'approving' || state === 'rejecting'
          const thumb = Array.isArray(quest.media_urls) ? quest.media_urls[0] : null
          const submittedAt = new Date(quest.created_at).toLocaleString()

          return (
            <div
              key={quest.id}
              className={`rounded-xl border bg-card p-4 transition-opacity ${isDone ? 'opacity-40' : ''}`}
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted flex items-center justify-center text-2xl">
                  {thumb
                    ? <img src={thumb} alt={quest.title} className="w-full h-full object-cover" />
                    : <span>{CLASS_ICON[quest.experience_class] ?? '📍'}</span>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground capitalize">
                      {CLASS_ICON[quest.experience_class]} {quest.experience_class}
                    </span>
                    {isDone && (
                      <span className="text-xs text-green-600 font-medium">
                        {state === 'done' && actionState[quest.id] === 'done' ? '✓ Done' : '✓ Done'}
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold text-foreground mt-1 truncate">{quest.title}</h2>
                  {quest.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{quest.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {[quest.location_name, quest.city, quest.country_code].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted {submittedAt}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                    by {quest.created_by}
                  </p>
                </div>
              </div>

              {actionError[quest.id] && (
                <p className="mt-2 text-xs text-destructive" role="alert">{actionError[quest.id]}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAction(quest.id, 'published')}
                  disabled={isBusy || isDone}
                  className="flex-1 rounded-lg bg-[#f97316] text-white text-sm font-semibold py-2 hover:bg-[#ea6c10] active:scale-[0.98] disabled:opacity-40 transition-all"
                >
                  {state === 'approving' ? 'Publishing…' : isDone ? 'Published ✓' : 'Approve'}
                </button>
                <button
                  onClick={() => handleAction(quest.id, 'archived')}
                  disabled={isBusy || isDone}
                  className="flex-1 rounded-lg border border-border text-sm font-medium py-2 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:opacity-40 transition-all"
                >
                  {state === 'rejecting' ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AdminReviewPage
