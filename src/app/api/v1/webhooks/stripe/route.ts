import { NextRequest, NextResponse } from 'next/server'
import {
  verifyWebhookSignature,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  logWebhookEvent
} from '@/lib/services/stripe.service'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = verifyWebhookSignature(payload, signature)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    )
  }

  try {
    let result: { handled: boolean; [key: string]: unknown } = { handled: false }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        result = await handleCheckoutCompleted(session)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        result = await handleSubscriptionUpdated(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        result = await handleSubscriptionDeleted(subscription)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
        await logWebhookEvent(event.id, event.type, event.data, 'ignored')
        return NextResponse.json({ received: true, handled: false })
    }

    await logWebhookEvent(
      event.id,
      event.type,
      event.data,
      result.handled ? 'success' : 'ignored'
    )

    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook processing error:', message)

    await logWebhookEvent(event.id, event.type, event.data, 'failed', message)

    return NextResponse.json(
      { error: `Processing Error: ${message}` },
      { status: 500 }
    )
  }
}
