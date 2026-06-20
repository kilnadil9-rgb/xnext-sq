// ============================================================
// XNEXT — create-checkout-session Edge Function
// Reuses the VHS Live Stripe pattern (hosted Checkout + metadata) on the SAME
// Stripe account, separated by metadata.app = "xnext".
// ============================================================
// Request (POST, JSON) — sent by listingService.createCheckoutSession:
//   { price_id, listing_id, user_id, listing_type }
//   Authorization: Bearer <supabase user JWT>   (JWT verification stays ON)
//
// Response: { url }  — redirect the user to Stripe-hosted Checkout.
//
// Secrets (Supabase Edge Function secrets):
//   STRIPE_SECRET_KEY, SITE_URL
//   (SUPABASE_URL / SUPABASE_ANON_KEY are injected by the runtime)
//
// Deploy (keep JWT ON so only signed-in users can start checkout):
//   supabase functions deploy create-checkout-session
// ============================================================

import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

type ListingTier =
  | 'yard_sale'
  | 'local_event'
  | 'business_spotlight'
  | 'featured_business'
  | 'monthly_partner'

// Authoritative, server-side allow-list. Replace placeholder IDs with the real
// XNEXT Price IDs (same Stripe account, distinct products from VHS Live).
const XNEXT_PRICE_MAP: Record<string, { mode: 'payment' | 'subscription'; tier: ListingTier }> = {
  price_1TkEsRLmIJ4bGVIs2MLjvCwD: { mode: 'payment',   tier: 'yard_sale' },
  price_xnext_localevent_499:  { mode: 'payment',      tier: 'local_event' },
  price_xnext_spotlight_999:   { mode: 'payment',      tier: 'business_spotlight' },
  price_xnext_featured_1999:   { mode: 'payment',      tier: 'featured_business' },
  price_xnext_partner_mo_4999: { mode: 'subscription', tier: 'monthly_partner' },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { price_id, listing_id, listing_type } = (await req.json()) as {
      price_id?: string
      listing_id?: string
      listing_type?: string
    }

    if (!price_id || !listing_id) {
      return json({ error: 'price_id and listing_id are required' }, 400)
    }

    // Validate the price against the server-side allow-list.
    const priceInfo = XNEXT_PRICE_MAP[price_id]
    if (!priceInfo) return json({ error: 'Invalid price_id for XNEXT' }, 400)

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return json({ error: 'Stripe not configured' }, 500)

    // Verify the caller and confirm the listing is theirs + awaiting payment.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    const { data: listing, error: listErr } = await supabase
      .from('quests')
      .select('id, created_by, is_paid_listing, payment_status')
      .eq('id', listing_id)
      .single()
    if (listErr || !listing) return json({ error: 'Listing not found' }, 404)
    if (listing.created_by !== user.id) return json({ error: 'Not your listing' }, 403)
    if (!listing.is_paid_listing) return json({ error: 'Not a paid listing' }, 400)
    if (listing.payment_status === 'paid') return json({ error: 'Listing already paid' }, 409)

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2024-06-20',
      // REQUIRED in Deno — the default Node HTTP client does not work here.
      httpClient: Stripe.createFetchHttpClient(),
    })

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://xnext.app'

    // One metadata object reused on the session AND the subscription so both
    // checkout.session.completed and invoice.payment_succeeded can resolve it.
    const metadata = {
      app: 'xnext',
      payment_type: 'paid_listing',
      listing_type: listing_type || priceInfo.tier,
      listing_id,
      tier: priceInfo.tier,
      user_id: user.id,
      price_id,
    }

    const session = await stripe.checkout.sessions.create({
      mode: priceInfo.mode,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${siteUrl}/dashboard/quests/mine?listing=${listing_id}&checkout=success`,
      cancel_url: `${siteUrl}/dashboard/post-event?listing=${listing_id}&checkout=cancelled`,
      client_reference_id: user.id,
      metadata,
      ...(priceInfo.mode === 'subscription'
        ? { subscription_data: { metadata } }
        : {}),
    })

    return json({ url: session.url })
  } catch (err) {
    console.error('[xnext/create-checkout-session]', err)
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
