import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import prisma from '@/lib/db'

/**
 * GET /checkout
 *
 * Creates a Stripe checkout session and redirects to Stripe's hosted checkout page.
 * This is the main entry point for purchasing 123jobs bundles.
 *
 * Query params:
 * - price_id: Stripe price ID (required)
 * - success_url: URL to redirect to after successful payment (optional)
 * - cancel_url: URL to redirect to if payment is cancelled (optional)
 * - allow_promotion_codes: Enable coupon/promo codes at checkout (optional, defaults to true)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const priceId = searchParams.get('price_id')
    const successUrl = searchParams.get('success_url') || `${process.env.NEXT_PUBLIC_APP_URL || 'https://central-dashboard-bbbb57a5985e.herokuapp.com'}/checkout/success`
    const cancelUrl = searchParams.get('cancel_url') || `${process.env.NEXT_PUBLIC_APP_URL || 'https://central-dashboard-bbbb57a5985e.herokuapp.com'}/checkout/cancelled`
    // Enable promotion codes by default - can be disabled by passing allow_promotion_codes=false
    const allowPromotionCodes = searchParams.get('allow_promotion_codes') !== 'false'

    if (!priceId) {
      return NextResponse.json(
        { error: 'Missing required parameter: price_id' },
        { status: 400 }
      )
    }

    // Verify the price_id exists in our bundles table
    const bundle = await prisma.bundle.findUnique({
      where: { stripePriceId: priceId }
    })

    if (!bundle) {
      return NextResponse.json(
        { error: 'Invalid price_id - no matching bundle found' },
        { status: 400 }
      )
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[Checkout] STRIPE_SECRET_KEY not configured')
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 500 }
      )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover'
    })

    // The Stripe price decides the checkout mode: a recurring price needs a
    // subscription checkout, a one-time price a payment checkout. (Time-limited
    // one-time bundles like "6 months" are one-time prices, so durationType
    // alone can't tell us.)
    const price = await stripe.prices.retrieve(priceId)
    const isSubscription = price.type === 'recurring'

    console.log(`[Checkout] Bundle "${bundle.name}" price type: ${price.type} (${isSubscription ? 'subscription' : 'payment'} mode)`)

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        bundle_id: bundle.id.toString(),
        bundle_name: bundle.name,
        product_ids: bundle.productIds.join(','),
      },
      billing_address_collection: 'required',
      // Stripe only calculates tax when automatic_tax is enabled on the session
      // itself — account-wide Stripe Tax does not apply to API-created checkouts.
      automatic_tax: { enabled: true },
      // Enable coupon/promo codes at checkout
      allow_promotion_codes: allowPromotionCodes,
      // customer_creation / invoice_creation only work in payment mode. The
      // invoice gives one-time buyers a proper receipt showing the tax charged.
      ...(isSubscription ? {} : { customer_creation: 'always', invoice_creation: { enabled: true } }),
    })

    if (!session.url) {
      console.error('[Checkout] Stripe session created but no URL returned')
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    // Redirect to Stripe checkout
    return NextResponse.redirect(session.url)

  } catch (error) {
    console.error('[Checkout] Error creating checkout session:', error)

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: `Stripe error: ${error.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
