import { supabase } from '../lib/supabase/client'
import type {
  Quest,
  ListingType,
  ListingTier,
  ExperienceClass,
  PaymentStatus,
  QuestStatus,
} from '../lib/supabase/types'
import type { ServiceResult } from '../lib/serviceUtils'
import { extractMessage } from '../lib/serviceUtils'
import { toEwktPoint, questSlug } from '../lib/geo'
import type { LatLng } from '../components/map/types'

// Stripe publishable key (client-safe). Required for future Elements but present for the integration.
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

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
  /** Stripe Price ID (create matching products/prices in the shared Stripe account; use distinct from VHS Live). */
  stripePriceId: string
}

/** Pricing model — visibility windows enforced server-side via expires_at. */
export const LISTING_PACKAGES: ListingPackage[] = [
  { tier: 'yard_sale', label: 'Yard Sale', priceLabel: '$0.99', priceUsd: 0.99, durationHours: 24, isFeatured: false, blurb: 'Visible for 24 hours', stripePriceId: 'price_1TkEsRLmIJ4bGVIs2MLjvCwD' },
  { tier: 'local_event', label: 'Local Event', priceLabel: '$4.99', priceUsd: 4.99, durationHours: 72, isFeatured: false, blurb: 'Visible up to 3 days', stripePriceId: 'price_xnext_localevent_499' },
  { tier: 'business_spotlight', label: 'Business Spotlight', priceLabel: '$9.99', priceUsd: 9.99, durationHours: 168, isFeatured: false, blurb: 'Visible up to 7 days', stripePriceId: 'price_xnext_spotlight_999' },
  { tier: 'featured_business', label: 'Featured Business', priceLabel: '$19.99', priceUsd: 19.99, durationHours: 336, isFeatured: true, blurb: '14 days · ranks higher', stripePriceId: 'price_xnext_featured_1999' },
  { tier: 'monthly_partner', label: 'Monthly Local Partner', priceLabel: '$49.99/mo', priceUsd: 49.99, durationHours: 720, isFeatured: true, blurb: '30 days · 3 photos · tickets + website link', stripePriceId: 'price_xnext_partner_mo_4999' },
]

// ── Monthly Local Partner perks (venues, concerts, race events, attractions) ─
// Partner listings get richer presentation; everyone else keeps the basic flow.
export const PARTNER_TIER: ListingTier = 'monthly_partner'
export const PARTNER_MAX_PHOTOS = 3
export const BASIC_MAX_PHOTOS = 1

export function isPartnerTier(tier: ListingTier | null | undefined): boolean {
  return tier === PARTNER_TIER
}

/** Loose http(s) URL check for partner links (external site / tickets). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export function packageForTier(tier: ListingTier): ListingPackage | undefined {
  return LISTING_PACKAGES.find((p) => p.tier === tier)
}

// ── Admin / Phase-1 manual listings ──────────────────────────────────────────
// Phase 1: admins seed the map by hand (no Stripe, no moderation). The SAME
// listing core powers the future public paid flow — only the publication mode
// (status + payment) differs. Keep this catalog as the single source of truth so
// the eventual user form reuses it unchanged.

export type AdminListingKind = 'yard_sale' | 'local_event' | 'business'

export interface AdminListingTypeConfig {
  kind: AdminListingKind
  label: string
  icon: string
  /** Persisted listing_type (maps onto the shared quests columns). */
  listing_type: ListingType
  /** Persisted tier — categorisation only for admin (no price is charged). */
  tier: ListingTier
  experience_class: ExperienceClass
  /** Yard sales / events start at a chosen time; businesses start immediately. */
  usesStart: boolean
  /**
   * Fallback active window when no explicit end is given:
   *   'end_of_day' → expires at 23:59:59 of the start day (yard sales, events)
   *   <number>     → that many hours after start (businesses ≈ 30 days)
   */
  defaultDuration: 'end_of_day' | number
}

export const ADMIN_LISTING_TYPES: AdminListingTypeConfig[] = [
  {
    kind: 'yard_sale',
    label: 'Yard Sale',
    icon: '🏷️',
    listing_type: 'yard_sale',
    tier: 'yard_sale',
    experience_class: 'opportunity',
    usesStart: true,
    defaultDuration: 'end_of_day',
  },
  {
    kind: 'local_event',
    label: 'Local Event',
    icon: '🎉',
    listing_type: 'local_event',
    tier: 'local_event',
    experience_class: 'connection',
    usesStart: true,
    defaultDuration: 'end_of_day',
  },
  {
    kind: 'business',
    label: 'Business',
    icon: '🏪',
    listing_type: 'business_promo',
    tier: 'business_spotlight',
    experience_class: 'opportunity',
    usesStart: false,
    defaultDuration: 24 * 30, // ≈ 30 days
  },
]

export function adminListingConfig(
  kind: AdminListingKind,
): AdminListingTypeConfig | undefined {
  return ADMIN_LISTING_TYPES.find((c) => c.kind === kind)
}

/** Last instant (local) of the calendar day that `d` falls on. */
function endOfLocalDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

/**
 * Resolve the active window for an admin listing from the raw form values.
 * - start: chosen start for yard sales/events; "now" for businesses.
 * - end: explicit end if given, otherwise the per-type default
 *   (end-of-day for yard sales/events, +30 days for businesses).
 */
export function resolveAdminWindow(
  cfg: AdminListingTypeConfig,
  startsAtInput?: string | null,
  endsAtInput?: string | null,
): { starts: Date; expires: Date } {
  const starts =
    cfg.usesStart && startsAtInput ? new Date(startsAtInput) : new Date()

  let expires: Date
  if (endsAtInput) {
    expires = new Date(endsAtInput)
  } else if (cfg.defaultDuration === 'end_of_day') {
    expires = endOfLocalDay(starts)
  } else {
    expires = new Date(starts.getTime() + cfg.defaultDuration * 3_600_000)
  }
  return { starts, expires }
}

// ── Shared listing-insert core (admin + future paid flows) ───────────────────
// Every listing — admin-seeded or user-paid — is one row in `quests`. This
// builder is the single place that shape is defined, so the two entry points
// can never drift apart. Callers supply the publication mode (status / payment).

interface ListingInsertCore {
  userId: string
  title: string
  description: string | null
  experience_class: ExperienceClass
  location: LatLng
  location_name: string | null
  listing_type: ListingType
  tier: ListingTier
  /** ISO timestamps. */
  starts_at: string
  expires_at: string
  is_featured: boolean
  is_paid_listing: boolean
  payment_status: PaymentStatus
  price_paid: number | null
  status: QuestStatus
  /** Set when a row is born already-published (admin); null otherwise. */
  published_at: string | null
  business_name: string | null
  contact_email: string | null
  contact_phone: string | null
  media_urls: string[]
  /** Partner-only links (023). Both null for basic tiers + admin listings. */
  external_url: string | null
  ticket_url: string | null
  /** metadata.source provenance tag, e.g. 'admin_listing' | 'paid_listing'. */
  source: string
}

function buildListingInsert(core: ListingInsertCore) {
  return {
    organization_id: null,
    created_by: core.userId,
    slug: questSlug(core.title),
    title: core.title,
    description: core.description,
    experience_class: core.experience_class,
    location_name: core.location_name,
    location_point: toEwktPoint(core.location),
    location_radius_m: null,
    city: null,
    country_code: null,
    tags: [] as string[],
    is_sponsored: false,
    sponsor_id: null,
    media_urls: core.media_urls,
    external_url: core.external_url,
    status: core.status,
    published_at: core.published_at,
    expires_at: core.expires_at,
    metadata: { source: core.source },
    // ── listing fields (migration 018) ──
    listing_type: core.listing_type,
    is_paid_listing: core.is_paid_listing,
    tier: core.tier,
    price_paid: core.price_paid,
    payment_status: core.payment_status,
    stripe_payment_id: null,
    starts_at: core.starts_at,
    is_featured: core.is_featured,
    business_name: core.business_name,
    contact_email: core.contact_email,
    contact_phone: core.contact_phone,
    // Partner-only ticket link (migration 023); RPC gates display to the tier.
    ticket_url: core.ticket_url,
  }
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
  tier?: ListingTier | null
}): ListingBadge | null {
  if (!q.listing_type) return null
  // Monthly Local Partner (venues, concerts, major events) outranks the
  // generic featured label — stronger event/venue presentation.
  if (isPartnerTier(q.tier)) return { label: 'Local Partner', kind: 'featured' }
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
  /** Monthly Local Partner only: approved external link (venue/event site). */
  external_url?: string | null
  /** Monthly Local Partner only: ticket purchase link ("Buy Tickets"). */
  ticket_url?: string | null
}

/**
 * Admin manual listing (Phase 1). Same shape the public paid form will reuse,
 * minus payment. `title` doubles as the business name for the business kind.
 */
export interface AdminCreateListingInput {
  kind: AdminListingKind
  title: string
  description?: string | null
  location: LatLng
  location_name?: string | null
  /** Required for yard sales/events; ignored for businesses (start = now). */
  starts_at?: string | null
  /** Optional end. When omitted the per-type default window applies. */
  ends_at?: string | null
  is_featured?: boolean
  media_urls?: string[]
}

/** Fields an admin can edit on an existing listing (all optional). */
export interface UpdateListingInput {
  title?: string
  description?: string | null
  /** ISO timestamps. */
  starts_at?: string | null
  expires_at?: string | null
  is_featured?: boolean
  status?: QuestStatus
  media_urls?: string[]
}

export const listingService = {
  /**
   * Create a paid, time-sensitive listing. Lands as `pending_review` (NOT
   * published) — admins approve before it ever appears on the map. Reuses the
   * quests table (migration 018) so it flows through the existing map RPC.
   *
   * Payment starts as 'pending'. Client then calls createCheckoutSession to get
   * Stripe URL. The webhook (using metadata) sets payment_status='paid' and
   * stripe_payment_id on success. Visibility requires status=published AND
   * payment_status=paid AND active time window.
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

    // ── Monthly Local Partner perks — everyone else keeps the basic flow ────
    const partner = isPartnerTier(input.tier)
    const maxPhotos = partner ? PARTNER_MAX_PHOTOS : BASIC_MAX_PHOTOS
    const mediaUrls = (input.media_urls ?? []).slice(0, maxPhotos)

    const externalUrl = partner ? input.external_url?.trim() || null : null
    const ticketUrl = partner ? input.ticket_url?.trim() || null : null
    if (!partner && (input.external_url?.trim() || input.ticket_url?.trim())) {
      return {
        data: null,
        error: 'External and ticket links are a Monthly Local Partner perk — choose that package to include them.',
      }
    }
    if (externalUrl && !isValidHttpUrl(externalUrl)) {
      return { data: null, error: 'External link must be a valid http(s) URL.' }
    }
    if (ticketUrl && !isValidHttpUrl(ticketUrl)) {
      return { data: null, error: 'Ticket link must be a valid http(s) URL.' }
    }

    // Built via the shared core so the paid row shape stays in lockstep with
    // admin listings — only status/payment/source differ below.
    const insertPayload = buildListingInsert({
      userId: user.id,
      title,
      description: input.description?.trim() || null,
      experience_class: 'opportunity',
      location: input.location,
      location_name: input.location_name?.trim() || null,
      listing_type: input.listing_type,
      tier: input.tier,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_featured: pkg.isFeatured,
      is_paid_listing: true,
      payment_status: 'pending', // settles via Stripe webhook
      price_paid: pkg.priceUsd,
      status: 'pending_review', // moderation gate — never auto-published
      published_at: null,
      business_name: input.business_name?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      media_urls: mediaUrls,
      // Links ride along on the pending_review row, but only ever DISPLAY
      // after admin approval (RPC returns published rows only).
      external_url: externalUrl,
      ticket_url: ticketUrl,
      source: 'paid_listing',
    })

    const { data, error } = await supabase
      .from('quests')
      .insert(insertPayload as never)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Admin manual listing (Phase 1) — no Stripe, no moderation. Publishes
   * immediately and appears on the map as soon as its active window opens
   * (enforced by find_quests_nearby: status='published' AND starts_at<=now()
   * AND expires_at>now() AND is_paid_listing=false). Expiry:
   *   - yard sale / event: explicit end, else end of the start day
   *   - business: explicit end, else ≈30 days from now
   * RLS: inserts as the admin's own row (created_by = auth.uid()), covered by
   * the existing "Users can manage their own quests" policy.
   */
  async adminCreateListing(
    input: AdminCreateListingInput,
  ): Promise<ServiceResult<Quest>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const cfg = adminListingConfig(input.kind)
    if (!cfg) return { data: null, error: 'Unknown listing type.' }

    const title = input.title.trim()
    if (title.length < 3) {
      return { data: null, error: 'Title must be at least 3 characters.' }
    }

    const { lat, lng } = input.location ?? ({} as LatLng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        data: null,
        error: 'Set a location — drop a pin or enter latitude/longitude.',
      }
    }

    if (cfg.usesStart && !input.starts_at) {
      return { data: null, error: 'Choose a start date and time.' }
    }

    const { starts, expires } = resolveAdminWindow(
      cfg,
      input.starts_at,
      input.ends_at,
    )
    if (Number.isNaN(starts.getTime())) {
      return { data: null, error: 'Please choose a valid start date and time.' }
    }
    if (Number.isNaN(expires.getTime())) {
      return { data: null, error: 'Please choose a valid end date and time.' }
    }
    if (expires.getTime() <= starts.getTime()) {
      return { data: null, error: 'End time must be after the start time.' }
    }

    const insertPayload = buildListingInsert({
      userId: user.id,
      title,
      description: input.description?.trim() || null,
      experience_class: cfg.experience_class,
      location: { lat, lng },
      location_name: input.location_name?.trim() || null,
      listing_type: cfg.listing_type,
      tier: cfg.tier,
      starts_at: starts.toISOString(),
      expires_at: expires.toISOString(),
      is_featured: Boolean(input.is_featured),
      is_paid_listing: false, // admin listings are free — bypasses the paid gate
      payment_status: 'unpaid',
      price_paid: null,
      status: 'published', // live immediately (within its active window)
      published_at: new Date().toISOString(),
      business_name: cfg.kind === 'business' ? title : null,
      contact_email: null,
      contact_phone: null,
      media_urls: input.media_urls ?? [],
      external_url: null,
      ticket_url: null,
      source: 'admin_listing',
    })

    const { data, error } = await supabase
      .from('quests')
      .insert(insertPayload as never)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /**
   * Upload a listing image to the public quest-photos bucket and return its
   * public URL. Reuses the existing `discoveries/{uid}/` path — the only prefix
   * the storage RLS policy (migration 017) permits — so no migration is needed.
   */
  async uploadListingImage(file: File): Promise<ServiceResult<string>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const allowedExt = /\.(jpe?g|png|webp)$/i
    if (!allowedMimes.includes(file.type) && !allowedExt.test(file.name)) {
      return { data: null, error: 'Image must be JPG, PNG, or WebP.' }
    }
    if (file.size > 5 * 1024 * 1024) {
      return { data: null, error: 'Image must be 5 MB or smaller.' }
    }

    const safeName = file.name
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .toLowerCase()
      .slice(0, 80)
    const path = `discoveries/${user.id}/${Date.now()}-listing-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('quest-photos')
      .upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })
    if (uploadError) {
      return { data: null, error: uploadError.message || 'Upload failed.' }
    }

    const { data: urlData } = supabase.storage
      .from('quest-photos')
      .getPublicUrl(path)
    return { data: urlData.publicUrl, error: null }
  },

  /**
   * Create a Stripe Checkout session for a *pending* paid listing.
   * Returns { url } to redirect the user to Stripe-hosted checkout.
   * Uses the shared Stripe account but isolates via metadata.app = "xnext".
   */
  async createCheckoutSession(params: { listingId: string; priceId: string; listingType?: string }): Promise<ServiceResult<{ url: string }>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    if (!supabaseUrl) return { data: null, error: 'Supabase URL not configured' }

    const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken ?? ''}`,
      },
      body: JSON.stringify({
        price_id: params.priceId,
        listing_id: params.listingId,
        user_id: user.id,
        listing_type: params.listingType,
      }),
    })

    let data: { url?: string; error?: string } = {}
    try { data = await res.json() } catch {}

    if (!res.ok || !data.url) {
      return { data: null, error: data.error || `Checkout failed (${res.status})` }
    }
    return { data: { url: data.url }, error: null }
  },

  // ── Admin management: list / edit / delete ─────────────────────────────────
  // Admins see + edit every listing (migration 018 admin SELECT/UPDATE);
  // delete is covered by 001 for own rows and 020's admin DELETE policy for any.

  /** All listing rows (listing_type IS NOT NULL), newest first. */
  async listAllListings(limit = 200): Promise<ServiceResult<Quest[]>> {
    const { data, error } = await supabase
      .from('quests')
      .select('*')
      .not('listing_type', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return { data: null, error: extractMessage(error) }
    return { data: data ?? [], error: null }
  },

  /** Edit an existing listing in place. Pass only the fields you're changing. */
  async updateListing(
    id: string,
    patch: UpdateListingInput,
  ): Promise<ServiceResult<Quest>> {
    const updatePayload: Record<string, unknown> = {
      ...patch,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('quests')
      .update(updatePayload as never)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error: extractMessage(error) }
    return { data, error: null }
  },

  /** Permanently remove a listing. */
  async deleteListing(id: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('quests').delete().eq('id', id)
    if (error) return { data: null, error: extractMessage(error) }
    return { data: null, error: null }
  },
}
