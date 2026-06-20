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
  // Paid-listing fields (migration 018; null on organic discoveries)
  listing_type: string | null
  is_paid_listing: boolean | null
  payment_status: string | null
  price_paid: number | null
  tier: string | null
  is_featured: boolean | null
  business_name: string | null
  starts_at: string | null
  expires_at: string | null
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
      .select('id, title, description, experience_class, location_name, city, country_code, media_urls, created_by, created_at, status, listing_type, is_paid_listing, payment_status, price_paid, tier, is_featured, business_name, starts_at, expires_at')
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

  const patchQuest = (id: string, patch: Partial<ReviewQuest>) =>
    setQuests((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const handleToggleFeatured = async (id: string, value: boolean) => {
    const { error } = await supabase
      .from('quests')
      .update({ is_featured: value, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
    if (error) setActionError((s) => ({ ...s, [id]: error.message }))
    else patchQuest(id, { is_featured: value })
  }

  const handleSetExpiry = async (id: string, localValue: string) => {
    if (!localValue) return
    const iso = new Date(localValue).toISOString()
    const { error } = await supabase
      .from('quests')
      .update({ expires_at: iso, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
    if (error) setActionError((s) => ({ ...s, [id]: error.message }))
    else patchQuest(id, { expires_at: iso })
  }

  // ISO → value for <input type="datetime-local">
  const toLocalInput = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

              {quest.is_paid_listing && (
                <div className="mt-3 rounded-lg border border-[#f97316]/30 bg-[#f97316]/5 p-3 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold capitalize text-foreground">
                      {quest.tier?.replace(/_/g, ' ') ?? 'Listing'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        quest.payment_status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {quest.payment_status ?? 'unpaid'}
                      {quest.price_paid != null ? ` · $${quest.price_paid}` : ''}
                    </span>
                    {quest.business_name && (
                      <span className="text-muted-foreground">{quest.business_name}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    Window: {quest.starts_at ? new Date(quest.starts_at).toLocaleString() : '—'}
                    {' → '}
                    {quest.expires_at ? new Date(quest.expires_at).toLocaleString() : '—'}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleFeatured(quest.id, !quest.is_featured)}
                      className="rounded border border-border px-2 py-1 hover:bg-accent"
                    >
                      {quest.is_featured ? '★ Featured' : '☆ Make featured'}
                    </button>
                    <label className="flex items-center gap-1 text-muted-foreground">
                      Expires
                      <input
                        type="datetime-local"
                        defaultValue={toLocalInput(quest.expires_at)}
                        onChange={(e) => handleSetExpiry(quest.id, e.target.value)}
                        className="rounded border border-border bg-card px-1 py-0.5 text-foreground"
                      />
                    </label>
                  </div>
                </div>
              )}

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
