import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { UserMenu } from '../ui/UserMenu'
import { OrganizationSwitcher } from '../ui/OrganizationSwitcher'
import { useAuth } from '../../hooks/useAuth'
import { BottomNav } from '../nav/BottomNav'
import { RequireRole } from '../auth/RequireRole'
import { supabase } from '../../lib/supabase/client'
import { questService } from '../../services/questService'
import type { ExperienceClass, QuestStatus } from '../../lib/supabase/types'
import { useUserLocation } from '../../hooks/useUserLocation'
import { LocationPickerMap } from '../map/LocationPickerMap'
import type { LatLng } from '../map/types'
import { shareQuest } from '../../utils/shareQuest'
import { dreamListService } from '../../services/dreamListService'
import { questCompletionService } from '../../services/questCompletionService'
import { formatDistance } from '../../lib/distance'

/** Minimal nearby shape broadcast by MapScreen (Phase 3) for the Pulse sheet. */
interface NearbySnapshotQuest {
  id: string
  title: string
  experience_class: string
  distance_km: number
}

/**
 * Phase 1 testing: discoveries are visible immediately so uploaders trust the
 * flow ("no waiting for moderation to verify basic visibility"). Flip to false
 * to route new discoveries through admin review (pending_review) instead.
 */
const DISCOVERY_AUTO_PUBLISH = true

/**
 * Primary app shell for authenticated users.
 * Renders a sidebar nav + top header + <Outlet /> for nested routes.
 *
 * Nav items expand as features are built. Start with the MVP set.
 */
export function DashboardLayout() {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isMapHome = pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/map'

  const [openSheet, setOpenSheet] = useState<'discover' | 'timeline' | 'pulse' | 'people' | null>(null)

  // ── Phase 3: real data for Pulse + People (frontend-only, no fake activity) ──
  // Current nearby experiences, broadcast by MapScreen. Used to detect when a
  // saved (Dream List) experience is within range → a real Pulse card.
  const [nearby, setNearby] = useState<NearbySnapshotQuest[]>([])
  // The user's saved experiences (Dream List) and recent completions (Memories).
  const [savedItems, setSavedItems] = useState<
    { quest_id: string; title: string }[]
  >([])
  const [recentCompletions, setRecentCompletions] = useState<
    { id: string; title: string; completed_at: string }[]
  >([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  // Timeline: which window is currently active (kept in sync for the sheet UI).
  const [activeTimeframe, setActiveTimeframe] = useState<
    'all' | 'today' | 'tonight' | 'weekend' | 'week' | 'month'
  >('all')

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { quests?: NearbySnapshotQuest[] }
        | undefined
      if (detail?.quests) setNearby(detail.quests)
    }
    window.addEventListener('xnext-nearby-updated', handler)
    return () => window.removeEventListener('xnext-nearby-updated', handler)
  }, [])

  // Lazily load the user's real activity the first time they open Pulse/People.
  useEffect(() => {
    if (openSheet !== 'pulse' && openSheet !== 'people') return
    if (activityLoaded) return
    let cancelled = false
    Promise.all([
      dreamListService.getMyDreamList({ status: 'saved', limit: 50 }),
      questCompletionService.getMyCompletions({ limit: 10 }),
    ]).then(([saved, completed]) => {
      if (cancelled) return
      if (saved.data) {
        setSavedItems(
          saved.data.map((d) => ({
            quest_id: d.quest_id,
            title: d.quests?.title ?? 'A saved experience',
          })),
        )
      }
      if (completed.data) {
        setRecentCompletions(
          completed.data.map((c) => ({
            id: c.id,
            title: c.quests?.title ?? 'An adventure',
            completed_at: c.completed_at,
          })),
        )
      }
      setActivityLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [openSheet, activityLoaded])

  // Saved experiences that are within the current nearby set → real Pulse cards.
  const savedNearby = savedItems
    .map((s) => {
      const hit = nearby.find((n) => n.id === s.quest_id)
      return hit ? { ...s, distance_km: hit.distance_km } : null
    })
    .filter((x): x is { quest_id: string; title: string; distance_km: number } => x !== null)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 3)

  const selectQuestOnMap = (questId: string) => {
    window.dispatchEvent(
      new CustomEvent('xnext-select-quest', { detail: { id: questId } }),
    )
    closeSheet()
  }

  const applyTimeframe = (
    range: 'all' | 'today' | 'tonight' | 'weekend' | 'week' | 'month',
  ) => {
    setActiveTimeframe(range)
    window.dispatchEvent(
      new CustomEvent('xnext-timeline-filter', { detail: { range } }),
    )
    closeSheet()
  }

  // People panel "Share XNEXT" — invites friends to the app itself (not tied
  // to a single quest), reusing the same native-share-with-clipboard-fallback
  // helper as the quest share buttons.
  const [appShareToast, setAppShareToast] = useState<string | null>(null)
  const handleShareApp = async () => {
    const result = await shareQuest({ title: 'XNEXT — Discover local adventures' })
    if (result === 'shared') {
      setAppShareToast('Share ready')
    } else if (result === 'copied') {
      setAppShareToast('Copied to clipboard')
    } else {
      return
    }
    setTimeout(() => setAppShareToast(null), 2200)
  }

  // Discover sheet form state (wired for real submission + photo upload)
  const [discoverTitle, setDiscoverTitle] = useState('')
  const [discoverDesc, setDiscoverDesc] = useState('')
  const [discoverType, setDiscoverType] = useState('Hidden Viewpoint')
  const [discoverTags, setDiscoverTags] = useState('')
  const [discoverPhoto, setDiscoverPhoto] = useState<File | null>(null)
  const [discoverPhotoPreview, setDiscoverPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoverSuccess, setDiscoverSuccess] = useState(false)
  // Manual pin override (preferred fallback when GPS is missing/inaccurate).
  // null = use live GPS; a value = the user confirmed this spot on the map.
  const [discoverPin, setDiscoverPin] = useState<LatLng | null>(null)

  const {
    position: userPos,
    accuracy: locAccuracy,
    status: locStatus,
    request: requestLoc,
  } = useUserLocation(false)

  const handleNext = () => {
    // Dispatch to any listening map component (MapScreen or Home map)
    window.dispatchEvent(new CustomEvent('xnext-next'))
  }

  const openSheetHandler = (sheet: 'discover' | 'timeline' | 'pulse' | 'people') => {
    setOpenSheet(sheet)
    // Start acquiring GPS as soon as the discover sheet opens so position
    // is ready by the time the user hits Submit.
    if (sheet === 'discover') {
      requestLoc()
    }
  }

  const closeSheet = () => setOpenSheet(null)

  const resetDiscoverForm = () => {
    setDiscoverTitle('')
    setDiscoverDesc('')
    setDiscoverType('Hidden Viewpoint')
    setDiscoverTags('')
    setDiscoverPhoto(null)
    setDiscoverPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setUploadingPhoto(false)
    setDiscoverError(null)
    setDiscoverSuccess(false)
    setDiscoverPin(null)
  }

  // Reset discover form when switching away from the discover sheet
  useEffect(() => {
    if (openSheet !== 'discover') {
      resetDiscoverForm()
    }
  }, [openSheet])

  // Real Discover submission with photo upload to quest-photos bucket + quest create (pending_review)
  const handleDiscoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDiscoverError(null)
    setDiscoverSuccess(false)

    const title = discoverTitle.trim()
    if (!title) {
      setDiscoverError('Title is required.')
      return
    }
    if (title.length < 3) {
      setDiscoverError('Title must be at least 3 characters.')
      return
    }

    let photoUrl: string | null = null

    if (discoverPhoto) {
      // Client-side validation (types + 5MB)
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      const allowedExt = /\.(jpe?g|png|webp)$/i
      if (!allowedMimes.includes(discoverPhoto.type) && !allowedExt.test(discoverPhoto.name)) {
        setDiscoverError('Photo must be JPG, PNG, or WebP.')
        return
      }
      if (discoverPhoto.size > 5 * 1024 * 1024) {
        setDiscoverError('Photo must be 5 MB or smaller.')
        return
      }

      setUploadingPhoto(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('You must be signed in to upload photos.')

        const safeName = discoverPhoto.name.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase().slice(0, 80)
        const path = `discoveries/${user.id}/${Date.now()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('quest-photos')
          .upload(path, discoverPhoto, {
            contentType: discoverPhoto.type || 'image/jpeg',
            upsert: false,
          })
        if (uploadError) {
          throw new Error(uploadError.message || 'Upload failed')
        }

        const { data: urlData } = supabase.storage.from('quest-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      } catch (err: any) {
        setUploadingPhoto(false)
        setDiscoverError(`Photo upload failed: ${err?.message || 'Please try again.'}`)
        return
      }
      setUploadingPhoto(false)
    }

    // Layered location: prefer a confirmed manual pin, else live GPS.
    // A pin lets users submit even when GPS is denied/inaccurate (no coordinate
    // typing). We record which source was used + GPS accuracy in metadata.
    const location = discoverPin ?? userPos
    if (!location) {
      requestLoc()
      setDiscoverError(
        'Set a location first — enable GPS, or drop a pin on the map below to place this discovery.',
      )
      return
    }
    const locationSource: 'gps' | 'pin' = discoverPin ? 'pin' : 'gps'
    const locationAccuracyMeters =
      locationSource === 'gps' && typeof locAccuracy === 'number'
        ? Math.round(locAccuracy)
        : null

    const classMap: Record<string, ExperienceClass> = {
      'Hidden Viewpoint': 'wonder',
      'Waterfall': 'wonder',
      'Trail': 'opportunity',
      'Rockhounding': 'wonder',
      'Stargazing': 'wonder',
      'Scenic Drive': 'opportunity',
      'Family Spot': 'connection',
      'Outdoor Adventure': 'transformation',
    }
    const experience_class = classMap[discoverType] ?? 'wonder'

    const tags = discoverTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8)

    try {
      const result = await questService.createQuest({
        title,
        description: discoverDesc.trim() || null,
        experience_class,
        location: { lat: location.lat, lng: location.lng },
        tags,
        status: (DISCOVERY_AUTO_PUBLISH ? 'published' : 'pending_review') as QuestStatus,
        media_urls: photoUrl ? [photoUrl] : [],
        // Location provenance stored in existing metadata jsonb (no schema change)
        metadata: {
          location_source: locationSource,
          location_accuracy_meters: locationAccuracyMeters,
        },
      })

      if (result.error || !result.data) {
        throw new Error(result.error || 'Failed to submit discovery.')
      }

      setDiscoverSuccess(true)
      // Immediate visibility: tell the live map to refetch so the new
      // experience appears at once (no waiting on moderation).
      window.dispatchEvent(
        new CustomEvent('xnext-quest-created', {
          detail: { lat: location.lat, lng: location.lng },
        }),
      )
      // brief confirmation then auto-close the sheet
      setTimeout(() => {
        resetDiscoverForm()
        closeSheet()
      }, 900)
    } catch (err: any) {
      setDiscoverError(err?.message || 'Submission failed. Please try again.')
    }
  }

  // Consent gate: if profile loaded and no privacy acceptance recorded, force to consent screen.
  // This implements the first-launch consent flow (Deliverable 3) without showing dashboard chrome.
  useEffect(() => {
    if (profile && !profile.privacy_policy_accepted_at) {
      navigate('/consent', { replace: true })
    }
  }, [profile, navigate])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* ── Sidebar (persistent on non-map pages; overlay/drawer only on map home via hamburger) ───────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-[60] flex w-64 flex-col border-r border-border bg-card
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isMapHome ? '' : 'lg:static lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-black tracking-tight text-primary-foreground shadow-[0_0_16px_rgba(249,115,22,0.45)]">
            XN
          </div>
          <span className="font-bold tracking-[1.5px] text-foreground">
            XNEXT
          </span>
        </div>

        {/* Org switcher */}
        <div className="border-b border-border px-4 py-3">
          <OrganizationSwitcher
            activeOrgId={activeOrgId}
            onSwitch={setActiveOrgId}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          <ul className="space-y-1">
            <NavItem to="/dashboard" label="Home" icon={HomeIcon} end />
            <NavItem to="/dashboard/quests/mine" label="My Quests" icon={QuestIcon} />
            <NavItem to="/dashboard/dream-list" label="Dream List" icon={DreamListIcon} />
            <NavItem to="/dashboard/pulse" label="Pulse" icon={PulseIcon} />
            <NavItem to="/dashboard/quests/new" label="Create Quest" icon={QuestIcon} />
            <NavItem to="/dashboard/post-event" label="Post Event" icon={QuestIcon} />
            <NavItem to="/dashboard/completed" label="Memories" icon={QuestIcon} />
            <NavItem to="/dashboard/preferences" label="Preferences" icon={UsersIcon} />
            <NavItem to="/dashboard/trust" label="Trust & Privacy" icon={DreamListIcon} />
          </ul>

          {/* Admin listings — gated on profiles.is_admin (matches AdminReviewPage
              + AdminListingsPage access checks). Phase 1: seed the map by hand. */}
          {profile?.is_admin && (
            <div className="mt-6">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </p>
              <ul className="space-y-1">
                <NavItem to="/dashboard/admin/listings" label="Create Listing" icon={QuestIcon} />
                <NavItem to="/dashboard/admin/review" label="Review Queue" icon={DreamListIcon} />
                <NavItem to="/dashboard/admin/discovery-map" label="Command Center" icon={PulseIcon} />
              </ul>
            </div>
          )}

          {/* P3: RBAC admin section — hidden from non-admin users at the UI level */}
          <RequireRole role={['admin', 'super_admin']} fallback={null}>
            <div className="mt-6">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </p>
              <ul className="space-y-1">
                <NavItem to="/dashboard/admin/users" label="Users" icon={UsersIcon} />
                <NavItem to="/dashboard/admin/audit" label="Audit Logs" icon={AuditIcon} />
              </ul>
            </div>
          </RequireRole>
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* P6: On map home, replace 64px header bar with two floating corner icons.
            On all other pages, keep the standard header. */}
        {isMapHome ? (
          <>
            <button
              className="fixed top-3 left-3 z-50 w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-black/80 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.4)] flex items-center justify-center"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>
            <div className="fixed top-3 right-3 z-[70]">
              <UserMenu />
            </div>
          </>
        ) : (
          <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6 z-50">
            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <MenuIcon />
            </button>
            <div className="flex-1" />
            <UserMenu />
          </header>
        )}

        {/* Page content: full for map home (child provides full map + overlays),
            scrollable + padded + safe-area aware for other pages */}
        <main
          className={`relative flex-1 ${
            isMapHome
              ? 'overflow-hidden'
              : 'overflow-y-auto p-4 text-left lg:p-6'
          }`}
          style={isMapHome ? undefined : { paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <Outlet />
        </main>

        {/* Bottom nav - primary interaction for map home / experience layers.
            Fixed so map (in child components) remains visible underneath. */}
        {isMapHome && (
          <BottomNav onNext={handleNext} onOpenSheet={openSheetHandler} />
        )}

        {/* Sheet overlays for nav items - map stays visible behind.
            Limited height, scrollable content. */}
        {openSheet && (
          <div
            className="fixed inset-x-0 bottom-0 z-[65] bg-[#0c1420]/96 backdrop-blur-xl border-t border-white/10 rounded-t-2xl shadow-2xl max-h-[65dvh] overflow-auto"
            role="dialog"
            aria-modal="true"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="sticky top-0 bg-[#0c1420]/98 backdrop-blur-xl border-b border-white/10 p-4 flex items-center justify-between">
              <span className="font-semibold text-lg capitalize text-white">{openSheet}</span>
              <button onClick={closeSheet} className="text-2xl leading-none" aria-label="Close">×</button>
            </div>

            <div className="p-4">
              {/* P2: Discover — real submission + photo upload to quest-photos */}
              {openSheet === 'discover' && (
                <div>
                  <p className="text-sm text-white/60 mb-3">
                    Share a hidden gem with the community. No businesses — only real experiences.
                  </p>
                  <Link
                    to="/dashboard/post-event"
                    onClick={closeSheet}
                    className="mb-4 flex items-center justify-between rounded-lg border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2 text-xs text-[#fdba74]"
                  >
                    <span>Hosting a yard sale, pop-up, or event? Post it as a listing</span>
                    <span aria-hidden="true">→</span>
                  </Link>

                  {/* Location status indicator */}
                  {locStatus !== 'active' && (
                    <div className={`mb-3 flex items-center gap-2 rounded border px-3 py-2 text-xs ${
                      locStatus === 'denied' || locStatus === 'unavailable' || locStatus === 'error'
                        ? 'border-red-500/30 bg-red-500/10 text-red-400'
                        : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                    }`}>
                      <span>📍</span>
                      <span>
                        {locStatus === 'denied'
                          ? 'Location off — no problem, just drag the pin on the map below to place your spot.'
                          : locStatus === 'unavailable' || locStatus === 'error'
                            ? 'GPS unavailable — drop a pin on the map below instead.'
                            : 'Finding your location… you can also drag the pin below.'}
                      </span>
                    </div>
                  )}

                  {discoverError && (
                    <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
                      {discoverError}
                    </div>
                  )}
                  {discoverSuccess && (
                    <div className="mb-3 rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                      {DISCOVERY_AUTO_PUBLISH
                        ? '✓ Live on the map! Check the radar.'
                        : 'Discovery submitted for review. Thank you!'}
                    </div>
                  )}

                  <form onSubmit={handleDiscoverSubmit} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Title (e.g. Hidden Waterfall)"
                      className="w-full rounded border border-white/20 bg-white/5 text-white placeholder:text-white/30 p-2 text-sm"
                      value={discoverTitle}
                      onChange={(e) => setDiscoverTitle(e.target.value)}
                      required
                      disabled={uploadingPhoto}
                    />
                    <textarea
                      placeholder="Short description"
                      className="w-full rounded border border-white/20 bg-white/5 text-white placeholder:text-white/30 p-2 text-sm h-20"
                      value={discoverDesc}
                      onChange={(e) => setDiscoverDesc(e.target.value)}
                      disabled={uploadingPhoto}
                    />
                    <select
                      className="w-full rounded border border-white/20 bg-[#0c1420] text-white p-2 text-sm"
                      value={discoverType}
                      onChange={(e) => setDiscoverType(e.target.value)}
                      disabled={uploadingPhoto}
                    >
                      <option>Hidden Viewpoint</option>
                      <option>Waterfall</option>
                      <option>Trail</option>
                      <option>Rockhounding</option>
                      <option>Stargazing</option>
                      <option>Scenic Drive</option>
                      <option>Family Spot</option>
                      <option>Outdoor Adventure</option>
                    </select>

                    {/* Layered location: live GPS pre-drops the pin; drag to
                        correct it (preferred fallback — no coordinate typing). */}
                    <div>
                      <label className="text-xs block mb-1 text-white/50">
                        Location {' '}
                        <span className="text-white/35">
                          {discoverPin
                            ? '· pin placed'
                            : locStatus === 'active'
                              ? `· using GPS${typeof locAccuracy === 'number' ? ` (±${Math.round(locAccuracy)}m)` : ''}`
                              : '· drag the pin to set'}
                        </span>
                      </label>
                      <LocationPickerMap
                        value={discoverPin ?? userPos}
                        onChange={(loc) => setDiscoverPin(loc)}
                      />
                      <p className="text-[11px] text-white/40 mt-1">
                        We start at your GPS location — drag the pin if it’s off, or to place a spot you’re not standing at.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs block mb-1 text-white/50">Photo (JPG/PNG/WebP, max 5MB)</label>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        className="text-sm"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          if (discoverPhotoPreview) URL.revokeObjectURL(discoverPhotoPreview)
                          if (file) {
                            setDiscoverPhoto(file)
                            setDiscoverPhotoPreview(URL.createObjectURL(file))
                          } else {
                            setDiscoverPhoto(null)
                            setDiscoverPhotoPreview(null)
                          }
                          setDiscoverError(null)
                        }}
                        disabled={uploadingPhoto}
                      />
                      {discoverPhotoPreview && (
                        <div className="mt-2 flex items-center gap-2">
                          <img
                            src={discoverPhotoPreview}
                            alt="Selected photo preview"
                            className="h-16 w-16 rounded object-cover border border-white/20"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (discoverPhotoPreview) URL.revokeObjectURL(discoverPhotoPreview)
                              setDiscoverPhoto(null)
                              setDiscoverPhotoPreview(null)
                            }}
                            className="text-xs text-white/40 underline"
                            disabled={uploadingPhoto}
                          >
                            Remove photo
                          </button>
                        </div>
                      )}
                      {discoverPhoto && !discoverPhotoPreview && (
                        <div className="mt-1 text-xs text-white/40">{discoverPhoto.name}</div>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="Tags (comma separated)"
                      className="w-full rounded border border-white/20 bg-white/5 text-white placeholder:text-white/30 p-2 text-sm"
                      value={discoverTags}
                      onChange={(e) => setDiscoverTags(e.target.value)}
                      disabled={uploadingPhoto}
                    />

                    <button
                      type="submit"
                      disabled={uploadingPhoto}
                      className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium disabled:opacity-60"
                    >
                      {uploadingPhoto ? 'Uploading photo…' : 'Submit Discovery'}
                    </button>
                  </form>

                  <p className="text-[11px] text-white/40 mt-3 text-center">
                    {DISCOVERY_AUTO_PUBLISH
                      ? 'Your discovery appears on the map right away. Be kind — real experiences only, no businesses.'
                      : 'Submissions are reviewed before going live. Real experiences only, no businesses.'}
                  </p>
                </div>
              )}

              {/* Phase 3: Timeline — real filter. Each button narrows the map +
                  nearby list to that time window (evergreen experiences stay,
                  time-sensitive events are filtered). No dead buttons. */}
              {openSheet === 'timeline' && (
                <div>
                  <p className="text-sm text-white/60 mb-3">
                    Filter experiences by when you want to go.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label: 'Today', value: 'today' },
                      { label: 'Tonight', value: 'tonight' },
                      { label: 'This Weekend', value: 'weekend' },
                      { label: 'This Week', value: 'week' },
                      { label: 'This Month', value: 'month' },
                    ] as const).map((f) => (
                      <button
                        key={f.value}
                        onClick={() => applyTimeframe(f.value)}
                        className={`rounded p-3 text-left text-sm transition-colors border ${
                          activeTimeframe === f.value
                            ? 'border-[#f97316] bg-[#f97316]/15 text-[#fdba74]'
                            : 'border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    <button
                      onClick={() => applyTimeframe('all')}
                      className={`rounded p-3 text-left text-sm transition-colors border ${
                        activeTimeframe === 'all'
                          ? 'border-[#f97316] bg-[#f97316]/15 text-[#fdba74]'
                          : 'border-white/20 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      All / Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Phase 3: Pulse — real opportunity cards from the user's Dream
                  List crossed against what's actually nearby right now. No
                  fabricated activity; honest empty states when there's nothing
                  real to surface. */}
              {openSheet === 'pulse' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-white">Pulse — Opportunity Engine</h3>
                    <span className="rounded-full border border-[#fde047]/30 bg-[#fde047]/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#fde047]">
                      Beta
                    </span>
                  </div>

                  {!activityLoaded ? (
                    <p className="py-6 text-center text-xs text-white/40">Checking for opportunities…</p>
                  ) : savedNearby.length > 0 ? (
                    <>
                      <p className="mb-3 text-xs text-white/50">
                        A saved experience is within range right now:
                      </p>
                      <div className="space-y-2 text-sm">
                        {savedNearby.map((s) => (
                          <button
                            key={s.quest_id}
                            type="button"
                            onClick={() => selectQuestOnMap(s.quest_id)}
                            className="flex w-full items-center justify-between gap-3 rounded border border-[#f97316]/30 bg-[#f97316]/10 p-3 text-left text-white/80 hover:bg-[#f97316]/20 transition-colors"
                          >
                            <span>
                              📍 <strong className="text-white">{s.title}</strong> is nearby
                              <span className="block text-[11px] text-white/50">
                                {formatDistance(s.distance_km * 1000)} away · from your Dream List
                              </span>
                            </span>
                            <span aria-hidden="true" className="text-[#fdba74]">→</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : savedItems.length > 0 ? (
                    <>
                      <p className="mb-3 text-xs text-white/50">
                        Pulse watches your Dream List for the right moment — timing, distance, and local opportunities.
                      </p>
                      <div className="rounded border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                        You have <strong className="text-white">{savedItems.length}</strong> saved{' '}
                        {savedItems.length === 1 ? 'experience' : 'experiences'}. None are within
                        range right now — Pulse will surface them here when one comes close.
                      </div>
                      <Link
                        to="/dashboard/dream-list"
                        onClick={closeSheet}
                        className="mt-3 flex items-center justify-between rounded-lg border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2 text-xs text-[#fdba74]"
                      >
                        <span>View your Dream List</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 text-xs text-white/50">
                        Pulse watches for the right moment to go — timing, distance, and local opportunities.
                      </p>
                      <div className="rounded border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
                        Save experiences to your Dream List and Pulse will watch for the right moment.
                      </div>
                      <button
                        type="button"
                        onClick={closeSheet}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2 text-xs text-[#fdba74]"
                      >
                        Explore the map to find experiences to save
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Phase 3: People — the user's own real activity (completions +
                  saves), never fabricated other-user events. Honest empty state
                  when there's no activity yet. */}
              {openSheet === 'people' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-white">People — Your Activity</h3>
                    <span className="rounded-full border border-[#fde047]/30 bg-[#fde047]/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#fde047]">
                      Beta
                    </span>
                  </div>

                  {!activityLoaded ? (
                    <p className="py-6 text-center text-xs text-white/40">Loading your activity…</p>
                  ) : recentCompletions.length > 0 || savedItems.length > 0 ? (
                    <>
                      <p className="mb-3 text-xs text-white/50">
                        Your adventures so far. A wider community layer is coming.
                      </p>
                      <div className="space-y-2">
                        {recentCompletions.slice(0, 3).map((c) => (
                          <div key={c.id} className="flex items-center gap-3 p-2 border border-white/10 bg-white/5 rounded">
                            <div className="w-8 h-8 rounded-full bg-[#f97316]/15 flex-shrink-0 flex items-center justify-center text-sm">🏆</div>
                            <div className="text-sm text-white/70">
                              You completed <strong className="text-white">{c.title}</strong>
                              <span className="block text-[11px] text-white/40">
                                {new Date(c.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        ))}
                        {savedItems.length > 0 && (
                          <Link
                            to="/dashboard/dream-list"
                            onClick={closeSheet}
                            className="flex items-center gap-3 p-2 border border-white/10 bg-white/5 rounded hover:bg-white/10 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-sm">🎒</div>
                            <div className="text-sm text-white/70">
                              <strong className="text-white">{savedItems.length}</strong> saved on your Dream List
                            </div>
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
                      Share or complete an experience to start building your activity.
                    </div>
                  )}

                  <div className="mt-3 rounded-lg border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-2">
                    <p className="mb-2 text-xs text-[#fdba74]">
                      Share an experience to help grow the community.
                    </p>
                    <button
                      type="button"
                      onClick={handleShareApp}
                      className="w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground"
                    >
                      📤 Share XNEXT
                    </button>
                    {appShareToast && (
                      <p className="mt-2 text-center text-[11px] text-[#fdba74]" role="status">
                        {appShareToast}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer: hidden on map home (reduced text can live in radar frame or bottom nav if needed); full on other pages. Admin preserved in hamburger. */}
        {!isMapHome && (
          <footer
            className="border-t border-border bg-card px-4 py-2 text-[10px] text-muted-foreground"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-center">
              <Link to="/privacy-policy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
              <Link to="/terms-of-service" className="hover:text-foreground hover:underline">Terms of Service</Link>
              <Link to="/community-guidelines" className="hover:text-foreground hover:underline">Community Guidelines</Link>
              <Link to="/data-requests" className="hover:text-foreground hover:underline">Data Requests</Link>
              <a href="mailto:support@xnext.app" className="hover:text-foreground hover:underline">Contact Support</a>
              <Link to="/philosophy" className="hover:text-foreground hover:underline">Product Philosophy</Link>
            </div>
            <p className="mt-1 text-center text-[10px] opacity-70">
              Your memories belong to you. Your adventures belong to you. You can export or delete your data at any time.
            </p>
          </footer>
        )}
      </div>
    </div>
  )
}

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: React.FC<{ className?: string }>
  end?: boolean
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </NavLink>
    </li>
  )
}

// ─── Inline icons (no external dep) ──────────────────────────────────────────

const iconProps = 'h-4 w-4'

function HomeIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
    </svg>
  )
}

function QuestIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" />
    </svg>
  )
}

function DreamListIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function PulseIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h3l3-9 3 18 3-9h6" />
    </svg>
  )
}

function UsersIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
    </svg>
  )
}

function AuditIcon({ className = iconProps }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}


function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
