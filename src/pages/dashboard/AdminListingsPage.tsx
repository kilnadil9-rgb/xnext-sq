/**
 * AdminListingsPage — /dashboard/admin/listings
 *
 * Phase 1: admins manually seed the map with real-world content (yard sales,
 * local events, businesses) so there's always something happening nearby while
 * the user base grows. No Stripe, no moderation — listings publish immediately
 * and appear on the map the moment their active window opens.
 *
 * This form is intentionally the SAME shape the future public paid form will
 * reuse (listingService.adminCreateListing shares its insert core with the paid
 * createListing). The only future difference is permission + a Stripe step.
 *
 * Access: profiles.is_admin = true (mirrors AdminReviewPage). Non-admins are
 * redirected to /dashboard.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  listingService,
  ADMIN_LISTING_TYPES,
  adminListingConfig,
  type AdminListingKind,
} from '../../services/listingService'
import { LocationPickerMap } from '../../components/map/LocationPickerMap'
import { useUserLocation } from '../../hooks/useUserLocation'
import type { LatLng } from '../../components/map/types'
import type { Quest } from '../../lib/supabase/types'

// datetime-local <-> ISO helpers (shared by the form + manager)
const pad = (n: number) => String(n).padStart(2, '0')
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const inputCls =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'mb-1 block text-sm font-medium text-foreground'

export function AdminListingsPage() {
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { position: userPos } = useUserLocation(false)

  const [kind, setKind] = useState<AdminListingKind>('yard_sale')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationName, setLocationName] = useState('')
  const [pin, setPin] = useState<LatLng | null>(null)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isFeatured, setIsFeatured] = useState(false)

  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Bumped after a successful create so the manager list below refreshes.
  const [reloadToken, setReloadToken] = useState(0)

  const cfg = useMemo(() => adminListingConfig(kind)!, [kind])
  const isBusiness = kind === 'business'

  // Redirect non-admins once the profile resolves (mirrors AdminReviewPage).
  useEffect(() => {
    if (authLoading) return
    if (!profile?.is_admin) navigate('/dashboard', { replace: true })
  }, [profile, authLoading, navigate])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setLocationName('')
    setPin(null)
    setStartsAt('')
    setEndsAt('')
    setIsFeatured(false)
    setPhoto(null)
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const handlePin = (loc: LatLng, placeName?: string) => {
    setPin(loc)
    // Autofill the address from a place search if the admin hasn't typed one.
    if (placeName && !locationName.trim()) setLocationName(placeName)
  }

  // Manual lat/lng entry (Phase 1 acceptable fallback; stays in sync with pin).
  const handleCoord = (which: 'lat' | 'lng', raw: string) => {
    const n = Number(raw)
    setPin((prev) => {
      const base = prev ?? userPos ?? { lat: 0, lng: 0 }
      return { ...base, [which]: Number.isFinite(n) ? n : base[which] }
    })
  }

  const handlePhoto = (file: File | null) => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhoto(file)
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const location = pin ?? userPos
    if (!location) {
      setError('Set a location — drop a pin on the map or enter coordinates.')
      return
    }
    if (cfg.usesStart && !startsAt) {
      setError('Choose a start date and time.')
      return
    }

    setSubmitting(true)

    // Optional image first; abort the whole submit if it fails.
    let mediaUrls: string[] = []
    if (photo) {
      const up = await listingService.uploadListingImage(photo)
      if (up.error || !up.data) {
        setSubmitting(false)
        setError(up.error ?? 'Image upload failed. Please try again.')
        return
      }
      mediaUrls = [up.data]
    }

    const result = await listingService.adminCreateListing({
      kind,
      title,
      description: description || null,
      location,
      location_name: locationName || null,
      starts_at: cfg.usesStart ? startsAt : null,
      ends_at: endsAt || null,
      is_featured: isFeatured,
      media_urls: mediaUrls,
    })

    setSubmitting(false)

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not create the listing.')
      return
    }

    // Tell the live map to refetch so the new listing appears immediately
    // (same event the Discover flow uses).
    window.dispatchEvent(
      new CustomEvent('xnext-quest-created', {
        detail: { lat: location.lat, lng: location.lng },
      }),
    )

    setSuccess(
      `“${result.data.title}” is live${
        isBusiness ? '' : ' for its active window'
      }. Add another, or open Home to see it on the map.`,
    )
    resetForm()
    setReloadToken((t) => t + 1)
  }

  // Render nothing while auth resolves (redirect fires in the effect).
  if (authLoading || !profile?.is_admin) return null

  const titleLabel = isBusiness ? 'Business name *' : 'Title *'
  const lat = pin?.lat ?? userPos?.lat
  const lng = pin?.lng ?? userPos?.lng

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Create Listing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin tool — seed the map with real yard sales, events, and businesses.
          Listings publish immediately and appear on Home during their active
          window. No payment, no review.
        </p>
      </div>

      {error && (
        <p
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          {success}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* Listing type */}
        <div>
          <span className={labelCls}>Listing type</span>
          <div className="flex flex-wrap gap-2">
            {ADMIN_LISTING_TYPES.map((t) => (
              <button
                key={t.kind}
                type="button"
                aria-pressed={kind === t.kind}
                onClick={() => setKind(t.kind)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  kind === t.kind
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title / business name */}
        <div>
          <label htmlFor="al-title" className={labelCls}>
            {titleLabel}
          </label>
          <input
            id="al-title"
            className={inputCls}
            value={title}
            maxLength={120}
            placeholder={
              isBusiness
                ? "Rosa's Taqueria"
                : kind === 'yard_sale'
                  ? 'Multi-family yard sale on Court St'
                  : 'Riverfront summer concert'
            }
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="al-desc" className={labelCls}>
            Description
          </label>
          <textarea
            id="al-desc"
            className={inputCls}
            rows={3}
            maxLength={1000}
            placeholder={
              isBusiness
                ? 'What they offer, hours, why locals should stop in.'
                : 'What to expect, what to look for, parking notes.'
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Address */}
        <div>
          <label htmlFor="al-addr" className={labelCls}>
            Address / place name
          </label>
          <input
            id="al-addr"
            className={inputCls}
            value={locationName}
            maxLength={160}
            placeholder="1450 Court St, Pasco WA"
            onChange={(e) => setLocationName(e.target.value)}
          />
        </div>

        {/* Location: map pin + manual lat/lng (kept in sync) */}
        <div>
          <span className={labelCls}>Location *</span>
          <LocationPickerMap value={pin ?? userPos} onChange={handlePin} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="al-lat" className="mb-1 block text-xs text-muted-foreground">
                Latitude
              </label>
              <input
                id="al-lat"
                className={inputCls}
                type="number"
                step="any"
                inputMode="decimal"
                value={lat ?? ''}
                placeholder="46.2396"
                onChange={(e) => handleCoord('lat', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="al-lng" className="mb-1 block text-xs text-muted-foreground">
                Longitude
              </label>
              <input
                id="al-lng"
                className={inputCls}
                type="number"
                step="any"
                inputMode="decimal"
                value={lng ?? ''}
                placeholder="-119.1006"
                onChange={(e) => handleCoord('lng', e.target.value)}
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Drop the pin on the map, search a place, or type coordinates.
          </p>
        </div>

        {/* Active window */}
        {isBusiness ? (
          <div>
            <label htmlFor="al-exp" className={labelCls}>
              Expiration (optional)
            </label>
            <input
              id="al-exp"
              type="datetime-local"
              className={inputCls}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Businesses go live now. Leave blank for a ~30-day active window.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="al-start" className={labelCls}>
                Start *
              </label>
              <input
                id="al-start"
                type="datetime-local"
                className={inputCls}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="al-end" className={labelCls}>
                End (optional)
              </label>
              <input
                id="al-end"
                type="datetime-local"
                className={inputCls}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Blank = expires at the end of the start day.
              </p>
            </div>
          </div>
        )}

        {/* Featured */}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="accent-[#f97316]"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
          />
          ⭐ Featured (ranks higher on the radar)
        </label>

        {/* Optional image */}
        <div>
          <label htmlFor="al-photo" className={labelCls}>
            Image (optional · JPG/PNG/WebP, max 5 MB)
          </label>
          <input
            id="al-photo"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="text-sm"
            onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
          />
          {photoPreview && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={photoPreview}
                alt="Listing preview"
                className="h-16 w-16 rounded object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => handlePhoto(null)}
                className="text-xs text-muted-foreground underline"
              >
                Remove image
              </button>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Publishing…' : 'Publish listing'}
        </button>
      </form>

      <ManageListings reloadToken={reloadToken} />
    </div>
  )
}

// ── Manage existing listings (edit / feature / status / delete) ───────────────

function ManageListings({ reloadToken }: { reloadToken: number }) {
  const [listings, setListings] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await listingService.listAllListings()
    if (res.error) setError(res.error)
    else setListings(res.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  const handleUpdated = (updated: Quest) =>
    setListings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  const handleDeleted = (id: string) =>
    setListings((prev) => prev.filter((l) => l.id !== id))

  return (
    <section className="mt-10 border-t border-border pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Manage listings</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && listings.length === 0 && (
        <p className="text-sm text-muted-foreground">No listings yet.</p>
      )}

      <ul className="space-y-3">
        {listings.map((l) => (
          <ListingRow
            key={l.id}
            listing={l}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ))}
      </ul>
    </section>
  )
}

function statusVisible(l: Quest): boolean {
  if (l.status !== 'published') return false
  const now = Date.now()
  if (l.starts_at && new Date(l.starts_at).getTime() > now) return false
  if (l.expires_at && new Date(l.expires_at).getTime() <= now) return false
  return true
}

function ListingRow({
  listing,
  onUpdated,
  onDeleted,
}: {
  listing: Quest
  onUpdated: (q: Quest) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const [title, setTitle] = useState(listing.title)
  const [description, setDescription] = useState(listing.description ?? '')
  const [startsAt, setStartsAt] = useState(isoToLocalInput(listing.starts_at))
  const [expiresAt, setExpiresAt] = useState(isoToLocalInput(listing.expires_at))
  const [isFeatured, setIsFeatured] = useState(Boolean(listing.is_featured))
  const [status, setStatus] = useState(listing.status)

  const thumb =
    Array.isArray(listing.media_urls) && typeof listing.media_urls[0] === 'string'
      ? listing.media_urls[0]
      : null
  const visible = statusVisible(listing)
  const typeLabel = (listing.listing_type ?? 'listing').replace(/_/g, ' ')

  const resetEdits = () => {
    setTitle(listing.title)
    setDescription(listing.description ?? '')
    setStartsAt(isoToLocalInput(listing.starts_at))
    setExpiresAt(isoToLocalInput(listing.expires_at))
    setIsFeatured(Boolean(listing.is_featured))
    setStatus(listing.status)
    setRowError(null)
  }

  const handleSave = async () => {
    if (title.trim().length < 3) {
      setRowError('Title must be at least 3 characters.')
      return
    }
    setBusy(true)
    setRowError(null)
    const res = await listingService.updateListing(listing.id, {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: localInputToIso(startsAt),
      expires_at: localInputToIso(expiresAt),
      is_featured: isFeatured,
      status,
    })
    setBusy(false)
    if (res.error || !res.data) {
      setRowError(res.error ?? 'Could not save changes.')
      return
    }
    onUpdated(res.data)
    setEditing(false)
    // New window may change map visibility — nudge the live map to refetch.
    window.dispatchEvent(new CustomEvent('xnext-quest-created'))
  }

  const handleReplaceImage = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setRowError(null)
    const up = await listingService.uploadListingImage(file)
    if (up.error || !up.data) {
      setBusy(false)
      setRowError(up.error ?? 'Image upload failed.')
      return
    }
    const res = await listingService.updateListing(listing.id, {
      media_urls: [up.data],
    })
    setBusy(false)
    if (res.error || !res.data) {
      setRowError(res.error ?? 'Could not update the image.')
      return
    }
    onUpdated(res.data)
    window.dispatchEvent(new CustomEvent('xnext-quest-created'))
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete “${listing.title}”? This cannot be undone.`)) return
    setBusy(true)
    setRowError(null)
    const res = await listingService.deleteListing(listing.id)
    setBusy(false)
    if (res.error) {
      setRowError(res.error)
      return
    }
    onDeleted(listing.id)
    window.dispatchEvent(new CustomEvent('xnext-quest-created'))
  }

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex gap-3">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
          {thumb && (
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs capitalize text-muted-foreground">{typeLabel}</span>
            {listing.is_featured && <span className="text-xs text-primary">★ Featured</span>}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                visible
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {visible ? 'Live now' : listing.status === 'published' ? 'Scheduled / expired' : listing.status}
            </span>
          </div>
          <p className="truncate font-medium text-foreground">{listing.title}</p>
          <p className="text-xs text-muted-foreground">
            {listing.starts_at ? new Date(listing.starts_at).toLocaleString() : '—'}
            {' → '}
            {listing.expires_at ? new Date(listing.expires_at).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {rowError && (
        <p className="mt-2 text-xs text-red-400" role="alert">{rowError}</p>
      )}

      {!editing ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-border px-2 py-1 hover:bg-accent"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const res = await listingService.updateListing(listing.id, {
                is_featured: !listing.is_featured,
              })
              setBusy(false)
              if (res.data) onUpdated(res.data)
            }}
            className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            {listing.is_featured ? 'Unfeature' : 'Feature'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const res = await listingService.updateListing(listing.id, {
                status: listing.status === 'published' ? 'archived' : 'published',
              })
              setBusy(false)
              if (res.data) {
                onUpdated(res.data)
                window.dispatchEvent(new CustomEvent('xnext-quest-created'))
              }
            }}
            className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            {listing.status === 'published' ? 'Archive' : 'Publish'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="rounded border border-red-500/40 px-2 py-1 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            className={inputCls}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <textarea
            className={inputCls}
            rows={2}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              Start
              <input
                type="datetime-local"
                className={inputCls}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              End / expires
              <input
                type="datetime-local"
                className={inputCls}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 text-foreground">
              <input
                type="checkbox"
                className="accent-[#f97316]"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
              />
              Featured
            </label>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Status
              <select
                className="rounded border border-border bg-card px-1 py-0.5 text-foreground"
                value={status}
                onChange={(e) => setStatus(e.target.value as Quest['status'])}
              >
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="text-muted-foreground">
              Replace image
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="ml-1 text-[11px]"
                onChange={(e) => handleReplaceImage(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                resetEdits()
                setEditing(false)
              }}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default AdminListingsPage
