import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  listingService,
  LISTING_TYPES,
  LISTING_PACKAGES,
} from '../../services/listingService'
import type { ListingType, ListingTier } from '../../lib/supabase/types'
import { LocationPickerMap } from '../../components/map/LocationPickerMap'
import { useUserLocation } from '../../hooks/useUserLocation'
import type { LatLng } from '../../components/map/types'

const inputCls =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'mb-1 block text-sm font-medium text-foreground'

/**
 * /dashboard/post-event — submit a paid, time-sensitive listing.
 * Discovery-first: these are framed as nearby opportunities, not ads. Lands as
 * Pending Review (admins approve before it appears).
 */
export function PostListingPage() {
  const navigate = useNavigate()
  const { position: userPos } = useUserLocation(false)

  const [listingType, setListingType] = useState<ListingType>('yard_sale')
  const [tier, setTier] = useState<ListingTier>('yard_sale')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [locationName, setLocationName] = useState('')
  const [pin, setPin] = useState<LatLng | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const pkg = LISTING_PACKAGES.find((p) => p.tier === tier)!

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const location = pin ?? userPos
    if (!location) {
      setError('Set a location — drop a pin on the map below.')
      return
    }
    if (!startsAt) {
      setError('Choose when it starts.')
      return
    }
    setSubmitting(true)
    const result = await listingService.createListing({
      listing_type: listingType,
      tier,
      title,
      description: description || null,
      location,
      location_name: locationName || null,
      starts_at: startsAt,
      business_name: businessName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
    })
    setSubmitting(false)
    if (result.error || !result.data) {
      setError(result.error ?? 'Could not create the listing.')
      return
    }
    setSuccess(true)
    setTimeout(() => navigate('/dashboard/quests/mine'), 1400)
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h1 className="text-xl font-semibold text-foreground">Submitted for review</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your {pkg.label.toLowerCase()} listing is pending approval. Once approved it appears on
          the map during its active window, then disappears automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Post a Local Adventure</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Yard sales, pop-ups, markets, and local events — shared as nearby opportunities, not ads.
          Reviewed before going live.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* Type */}
        <div>
          <span className={labelCls}>What is it?</span>
          <div className="flex flex-wrap gap-2">
            {LISTING_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={listingType === t.value}
                onClick={() => setListingType(t.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  listingType === t.value
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="l-title" className={labelCls}>Title *</label>
          <input id="l-title" className={inputCls} value={title} maxLength={120}
            placeholder="Multi-family yard sale on Court St"
            onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div>
          <label htmlFor="l-desc" className={labelCls}>Description</label>
          <textarea id="l-desc" className={inputCls} rows={3} maxLength={1000}
            placeholder="Tools, furniture, kids' clothes. Early birds welcome."
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="l-start" className={labelCls}>Starts *</label>
            <input id="l-start" type="datetime-local" className={inputCls}
              value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="l-addr" className={labelCls}>Address / place name</label>
            <input id="l-addr" className={inputCls} value={locationName} maxLength={120}
              placeholder="1450 Court St, Pasco"
              onChange={(e) => setLocationName(e.target.value)} />
          </div>
        </div>

        <div>
          <span className={labelCls}>Location *</span>
          <LocationPickerMap value={pin ?? userPos} onChange={(loc) => setPin(loc)} />
          <p className="mt-1 text-xs text-muted-foreground">
            Drag the pin to the exact spot.
          </p>
        </div>

        {/* Package picker */}
        <div>
          <span className={labelCls}>Choose a package</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {LISTING_PACKAGES.map((p) => (
              <button
                key={p.tier}
                type="button"
                aria-pressed={tier === p.tier}
                onClick={() => setTier(p.tier)}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  tier === p.tier
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {p.isFeatured ? '⭐ ' : ''}{p.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
                <span className="text-sm font-bold text-primary">{p.priceLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contact (for business tiers) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="l-biz" className={labelCls}>Business name</label>
            <input id="l-biz" className={inputCls} value={businessName} maxLength={120}
              placeholder="Optional" onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="l-email" className={labelCls}>Contact email</label>
            <input id="l-email" type="email" className={inputCls} value={contactEmail}
              placeholder="Optional" onChange={(e) => setContactEmail(e.target.value)} />
          </div>
        </div>
        <div className="sm:w-1/2 sm:pr-2">
          <label htmlFor="l-phone" className={labelCls}>Contact phone</label>
          <input id="l-phone" className={inputCls} value={contactPhone}
            placeholder="Optional" onChange={(e) => setContactPhone(e.target.value)} />
        </div>

        {/* Payment placeholder (TODO: Stripe Checkout) */}
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
          Payment is a placeholder for now — submitting simulates a paid listing so you can test the
          flow. Stripe Checkout will be wired here next.
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : `Pay ${pkg.priceLabel} & submit for review`}
        </button>

        <p className="text-center text-[11px] text-muted-foreground">
          Listings are reviewed before going live.{' '}
          <Link to="/dashboard/quests/mine" className="underline">See your submissions</Link>.
        </p>
      </form>
    </div>
  )
}

export default PostListingPage
