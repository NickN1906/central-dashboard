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
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const priceId = searchParams.get('price_id')
    const successUrl = searchParams.get('success_url') || `${process.env.NEXT_PUBLIC_APP_URL || 'https://central-dashboard-bbbb57a5985e.herokuapp.com'}/checkout/success`
    const cancelUrl = searchParams.get('cancel_url') || `${process.env.NEXT_PUBLIC_APP_URL || 'https://central-dashboard-bbbb57a5985e.herokuapp.com'}/checkout/cancelled`

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

    // Central Dashboard is the master - use bundle's durationType to determine checkout mode
    // durationType: 'days', 'months', 'years' = subscription | 'lifetime' = one-time payment
    const isSubscription = bundle.durationType !== 'lifetime'

    console.log(`[Checkout] Bundle "${bundle.name}" durationType: ${bundle.durationType} (${isSubscription ? 'subscription' : 'payment'} mode)`)

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
      // customer_creation only works in payment mode, not subscription mode
      ...(isSubscription ? {} : { customer_creation: 'always' }),
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
