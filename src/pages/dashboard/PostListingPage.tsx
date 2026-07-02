import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  listingService,
  LISTING_TYPES,
  LISTING_PACKAGES,
  PARTNER_MAX_PHOTOS,
  isPartnerTier,
  isValidHttpUrl,
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

  // Monthly Local Partner perks (photos + links). Hidden for basic tiers.
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [externalUrl, setExternalUrl] = useState('')
  const [ticketUrl, setTicketUrl] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pkg = LISTING_PACKAGES.find((p) => p.tier === tier)!
  const partner = isPartnerTier(tier)

  const handleAddPhotos = (files: FileList | null) => {
    if (!files) return
    const next = [...photos, ...Array.from(files)].slice(0, PARTNER_MAX_PHOTOS)
    setPhotos(next)
    setPhotoPreviews(next.map((f) => URL.createObjectURL(f)))
  }

  const handleRemovePhoto = (index: number) => {
    const next = photos.filter((_, i) => i !== index)
    setPhotos(next)
    setPhotoPreviews(next.map((f) => URL.createObjectURL(f)))
  }

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
    // Partner link sanity checks before any upload/insert work.
    if (partner && externalUrl.trim() && !isValidHttpUrl(externalUrl.trim())) {
      setError('External link must be a valid http(s) URL, e.g. https://yourvenue.com')
      return
    }
    if (partner && ticketUrl.trim() && !isValidHttpUrl(ticketUrl.trim())) {
      setError('Ticket link must be a valid http(s) URL, e.g. https://tickets.example.com/event')
      return
    }
    setSubmitting(true)

    // Upload partner photos first (up to 3); fail fast on any upload error.
    const mediaUrls: string[] = []
    if (partner) {
      for (const file of photos.slice(0, PARTNER_MAX_PHOTOS)) {
        const up = await listingService.uploadListingImage(file)
        if (up.error || !up.data) {
          setSubmitting(false)
          setError(up.error ?? 'Photo upload failed.')
          return
        }
        mediaUrls.push(up.data)
      }
    }

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
      media_urls: mediaUrls,
      external_url: partner ? externalUrl.trim() || null : null,
      ticket_url: partner ? ticketUrl.trim() || null : null,
    })
    if (result.error || !result.data) {
      setSubmitting(false)
      setError(result.error ?? 'Could not create the listing.')
      return
    }

    // Now initiate real Stripe Checkout (payment_status starts 'pending' in DB)
    const co = await listingService.createCheckoutSession({
      listingId: result.data.id,
      priceId: pkg.stripePriceId,
      listingType: listingType,
    })
    setSubmitting(false)
    if (co.error || !co.data?.url) {
      setError(co.error ?? 'Could not start Stripe checkout.')
      return
    }

    // Redirect to Stripe (webhook will mark paid on success)
    window.location.href = co.data.url
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

        {/* Monthly Local Partner perks — venues, concerts, race events.
            Basic tiers keep the simple flow (no photos, no links). */}
        {partner && (
          <div className="flex flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-foreground">
              ⭐ Local Partner extras
            </p>

            <div>
              <span className={labelCls}>Photos (up to {PARTNER_MAX_PHOTOS})</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={photos.length >= PARTNER_MAX_PHOTOS}
                onChange={(e) => {
                  handleAddPhotos(e.target.files)
                  e.target.value = ''
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
              />
              {photoPreviews.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {photoPreviews.map((src, i) => (
                    <div key={src} className="relative">
                      <img
                        src={src}
                        alt={`Listing photo ${i + 1}`}
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() => handleRemovePhoto(i)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-[10px] text-white"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="l-external" className={labelCls}>Website / event link</label>
              <input id="l-external" type="url" className={inputCls} value={externalUrl}
                placeholder="https://yourvenue.com/event"
                onChange={(e) => setExternalUrl(e.target.value)} />
            </div>

            <div>
              <label htmlFor="l-ticket" className={labelCls}>Ticket purchase link</label>
              <input id="l-ticket" type="url" className={inputCls} value={ticketUrl}
                placeholder="https://tickets.example.com/your-event"
                onChange={(e) => setTicketUrl(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown as a "Buy Tickets" button. Links only appear after admin approval.
              </p>
            </div>
          </div>
        )}

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

        {/* Stripe payment note */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          Secure checkout via Stripe. Your listing is created in "pending review". It becomes visible on the map only after admin approval + confirmed payment + active time window.
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Redirecting to payment…' : `Pay ${pkg.priceLabel} & submit for review`}
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
