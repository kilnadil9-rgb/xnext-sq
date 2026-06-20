import { supabase } from '../lib/supabase/client'
import type {
  Quest,
  ListingType,
  ListingTier,
} from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import { toEwktPoint, questSlug } from '../lib/geo'
import type { LatLng } from '../components/map/types'

export type { ServiceResult } from '../lib/serviceUtils'

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface ListingTypeOption {
  value: ListingType
  label: string
  icon: string
}

/** What KIND of opportunity it is (independent of the paid package). */
export const LISTING_TYPES: ListingTypeOption[] = [
  { value: 'yard_sale', label: 'Yard Sale', icon: '🏷️' },
  { value: 'local_event', label: 'Local Event', icon: '🎉' },
  { value: 'business_promo', label: 'Business Promo', icon: '🏪' },
  { value: 'market_show', label: 'Market / Show', icon: '🃏' },
  { value: 'community_event', label: 'Community Event', icon: '🤝' },
]

export interface ListingPackage {
  tier: ListingTier
  label: string
  priceLabel: string
  priceUsd: number
  durationHours: number
  isFeatured: boolean
  blurb: string
}

/** Pricing model — visibility windows enforced server-side via expires_at. */
export const LISTING_PACKAGES: ListingPackage[] = [
  { tier: 'yard_sale', label: 'Yard Sale', priceLabel: '$0.99', priceUsd: 0.99, durationHours: 24, isFeatured: false, blurb: 'Visible for 24 hours' },
  { tier: 'local_event', label: 'Local Event', priceLabel: '$4.99', priceUsd: 4.99, durationHours: 72, isFeatured: false, blurb: 'Visible up to 3 days' },
  { tier: 'business_spotlight', label: 'Business Spotlight', priceLabel: '$9.99', priceUsd: 9.99, durationHours: 168, isFeatured: false, blurb: 'Visible up to 7 days' },
  { tier: 'featured_business', label: 'Featured Business', priceLabel: '$19.99', priceUsd: 19.99, durationHours: 336, isFeatured: true, blurb: '14 days · ranks higher' },
  { tier: 'monthly_partner', label: 'Monthly Local Partner', priceLabel: '$49.99/mo', priceUsd: 49.99, durationHours: 720, isFeatured: true, blurb: 'Recurring visibility (30 days)' },
]

export function packageForTier(tier: ListingTier): ListingPackage | undefined {
  return LISTING_PACKAGES.find((p) => p.tier === tier)
}

// ── Map / radar labels for time-sensitive listings ──────────────────────────

export interface ListingBadge {
  label: string
  /** style hint: 'featured' | 'today' | 'weekend' | 'yard' | 'business' */
  kind: string
}

/** A short, inspirational label for a listing on the map/radar (or null). */
export function listingBadge(q: {
  listing_type?: ListingType | null
  is_featured?: boolean
  expires_at?: string | null
}): ListingBadge | null {
  if (!q.listing_type) return null
  if (q.is_featured) return { label: 'Featured Nearby', kind: 'featured' }

  const hoursLeft = q.expires_at
    ? (new Date(q.expires_at).getTime() - Date.now()) / 3_600_000
    : null

  if (q.listing_type === 'yard_sale') {
    return hoursLeft !== null && hoursLeft <= 24
      ? { label: 'Yard Sale · Today', kind: 'today' }
      : { label: 'Yard Sale', kind: 'yard' }
  }
  if (hoursLeft !== null && hoursLeft <= 24) return { label: 'Today Only', kind: 'today' }
  if (hoursLeft !== null && hoursLeft <= 72) return { label: 'This Weekend', kind: 'weekend' }
  if (q.listing_type === 'business_promo') return { label: 'Local Business', kind: 'business' }
  if (q.listing_type === 'market_show') return { label: 'Market / Show', kind: 'weekend' }
  return { label: 'Community Event', kind: 'weekend' }
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateListingInput {
  listing_type: ListingType
  tier: ListingTier
  title: string
  description?: string | null
  location: LatLng
  location_name?: string | null
  /** ISO start datetime; expiry is derived from the package duration. */
  starts_at: string
  business_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  media_urls?: string[]
}

export const listingService = {
  /**
   * Create a paid, time-sensitive listing. Lands as `pending_review` (NOT
   * published) — admins approve before it ever appears on the map. Reuses the
   * quests table (migration 018) so it flows through the existing map RPC.
   *
   * TODO(stripe): Stripe is not installed. We simulate a settled payment
   * (payment_status: 'paid') so the end-to-end flow is testable. Wire Stripe
   * Checkout + a webhook that sets payment_status='paid' and stripe_payment_id,
   * and start listings at payment_status='pending' until the webhook confirms.
   */
  async createListing(input: CreateListingInput): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const pkg = packageForTier(input.tier)
    if (!pkg) return { data: null, error: 'Unknown listing package.' }

    const title = input.title.trim()
    if (title.length < 3) return { data: null, error: 'Title must be at least 3 characters.' }

    const startsAt = new Date(input.starts_at)
    if (Number.isNaN(startsAt.getTime())) {
      return { data: null, error: 'Please choose a valid start date and time.' }
    }
    const expiresAt = new Date(startsAt.getTime() + pkg.durationHours * 3_600_000)

    const insertPayload = {
      organization_id: null,
      created_by: user.id,
      slug: questSlug(title),
      title,
      description: input.description?.trim() || null,
      experience_class: 'opportunity' as const,
      location_name: input.location_name?.trim() || null,
      location_point: toEwktPoint(input.location),
      location_radius_m: null,
      city: null,
      country_code: null,
      tags: [] as string[],
      is_sponsored: false,
      sponsor_id: null,
      media_urls: input.media_urls ?? [],
      external_url: null,
      status: 'pending_review' as const, // moderation gate — never auto-published
      expires_at: expiresAt.toISOString(),
      metadata: { source: 'paid_listing' },
      // ── listing fields (018) ──
      listing_type: input.listing_type,
      is_paid_listing: true,
      tier: input.tier,
      price_paid: pkg.priceUsd,
      payment_status: 'paid' as const, // TODO(stripe): real webhook sets this
      stripe_payment_id: null,
      starts_at: startsAt.toISOString(),
      is_featured: pkg.isFeatured,
      business_name: input.business_name?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
    }

    const { data, error } = await supabase
      .from('quests')
      .insert(insertPayload as never)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },
}
