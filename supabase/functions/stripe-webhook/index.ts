// ============================================================
// XNEXT — stripe-webhook Edge Function
// Same Stripe account as VHS Live, separated by metadata.app = "xnext".
// ============================================================
// Verifies the Stripe signature, then on a settled payment marks ONLY the
// payment fields. It never publishes — admin approval controls `status`.
//
// Visibility still requires: status = 'published' (admin) AND
// payment_status = 'paid' (this webhook) AND now within [starts_at, expires_at]
// (enforced in find_quests_nearby, migration 018).
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected by runtime)
//
// Deploy with JWT OFF (Stripe can't send a Supabase JWT):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   Dashboard → Edge Functions → stripe-webhook → JWT: OFF
//
// Stripe Dashboard webhook events:
//   checkout.session.completed , invoice.payment_succeeded
// ============================================================

import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('[xnext/stripe-webhook] Missing environment secrets')
    return new Response('Server misconfigured', { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 })

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const body = await req.text()
  let event: Stripe.Event
  try {
    // The async + SubtleCrypto provider form is REQUIRED in Deno.
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  } catch (err) {
    console.error('[xnext/stripe-webhook] Signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  // service-role client bypasses RLS to update payment fields only.
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Mark ONLY payment fields. Never touches `status` (no auto-publish).
  const markPaid = async (listingId: string, paymentRef: string) => {
    const { error } = await supabase
      .from('quests')
      .update({
        payment_status: 'paid',
        stripe_payment_id: paymentRef,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .eq('is_paid_listing', true)
    if (error) console.error('[xnext/stripe-webhook] mark paid failed:', error.message)
    else console.log(`[xnext/stripe-webhook] ✅ listing ${listingId} marked paid`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status !== 'paid') return new Response('OK', { status: 200 })

      const meta = session.metadata ?? {}
      if (meta.app !== 'xnext' || meta.payment_type !== 'paid_listing' || !meta.listing_id) {
        return new Response('OK', { status: 200 }) // not an XNEXT listing payment
      }
      const ref =
        (typeof session.payment_intent === 'string' && session.payment_intent) ||
        (typeof session.subscription === 'string' && session.subscription) ||
        session.id
      await markPaid(meta.listing_id, ref)
    } else if (event.type === 'invoice.payment_succeeded') {
      // Monthly partner renewals: resolve the listing via the subscription metadata.
      const invoice = event.data.object as Stripe.Invoice
      const sub = typeof invoice.subscription === 'string' ? invoice.subscription : null
      if (sub) {
        const subscription = await stripe.subscriptions.retrieve(sub)
        const meta = subscription.metadata ?? {}
        if (meta.app === 'xnext' && meta.payment_type === 'paid_listing' && meta.listing_id) {
          await markPaid(meta.listing_id, sub)
        }
      }
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[xnext/stripe-webhook] handler error:', err)
    return new Response('handler error', { status: 500 })
  }
})
