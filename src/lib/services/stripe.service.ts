import Stripe from 'stripe'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import {
  getOrCreateIdentity,
  createClaimToken,
  grantAccess
} from './entitlements.service'
import { sendBundlePurchaseEmail } from './email.service'
import { DurationType } from '@/lib/types'

let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover'
    })
  }
  return _stripe
}

export const stripe = { get instance() { return getStripe() } }

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  }

  return stripe.instance.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  )
}

/**
 * Handle checkout.session.completed event
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerEmail = session.customer_details?.email
  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  if (!customerEmail) {
    throw new Error('No customer email in session')
  }

  // Get line items to find the price ID
  const lineItems = await stripe.instance.checkout.sessions.listLineItems(session.id, {
    limit: 1
  })

  if (!lineItems.data.length) {
    throw new Error('No line items in session')
  }

  const priceId = lineItems.data[0].price?.id
  if (!priceId) {
    throw new Error('No price ID in line items')
  }

  // Find bundle with this price ID
  const bundle = await prisma.bundle.findUnique({
    where: { stripePriceId: priceId }
  })

  if (!bundle) {
    // Not a bundle purchase - might be an individual product
    console.log(`No bundle found for price: ${priceId}`)
    return { handled: false, reason: 'Not a bundle purchase' }
  }

  // Create or get identity
  const identity = await getOrCreateIdentity(customerEmail, stripeCustomerId || undefined)

  // Check if any product in the bundle requires a form (like Career Pathways)
  const productsWithForms = await prisma.product.findMany({
    where: {
      id: { in: bundle.productIds },
      NOT: { formSchema: { equals: Prisma.DbNull } }
    }
  })

  if (productsWithForms.length > 0) {
    // Bundle has products requiring form input - create claim token
    const claimToken = await createClaimToken({
      identityId: identity.id,
      bundleId: bundle.id,
      purchaseEmail: customerEmail,
      stripeSessionId: session.id
    })

    // TODO: Send email with claim link
    console.log(`Claim token created: ${claimToken.token}`)

    return {
      handled: true,
      action: 'claim_token_created',
      token: claimToken.token,
      bundleName: bundle.name
    }
  }

  // No forms required - grant access immediately
  // But still link the email to the identity for each product
  for (const productId of bundle.productIds) {
    await prisma.identityEmail.upsert({
      where: {
        email_productId: { email: customerEmail.toLowerCase(), productId }
      },
      create: {
        identityId: identity.id,
        email: customerEmail.toLowerCase(),
        productId
      },
      update: {}
    })
  }

  // Calculate expiry date for email
  const expiresAt = new Date()
  if (bundle.durationType === 'days') {
    expiresAt.setDate(expiresAt.getDate() + bundle.durationValue)
  } else if (bundle.durationType === 'months') {
    expiresAt.setMonth(expiresAt.getMonth() + bundle.durationValue)
  } else if (bundle.durationType === 'years') {
    expiresAt.setFullYear(expiresAt.getFullYear() + bundle.durationValue)
  }

  await grantAccess({
    identityId: identity.id,
    productIds: bundle.productIds,
    source: 'bundle',
    bundleId: bundle.id,
    durationType: bundle.durationType as DurationType,
    durationValue: bundle.durationValue
  })

  // Send confirmation email with instructions
  await sendBundlePurchaseEmail({
    customerEmail,
    customerName: session.customer_details?.name || undefined,
    bundleName: bundle.name,
    productIds: bundle.productIds,
    expiresAt: bundle.durationType !== 'lifetime' ? expiresAt : undefined
  })

  return {
    handled: true,
    action: 'access_granted',
    bundleName: bundle.name,
    products: bundle.productIds
  }
}

/**
 * Handle subscription events (for subscription-based bundles)
 */
export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id

  const identity = await prisma.identity.findFirst({
    where: { stripeCustomerId }
  })

  if (!identity) {
    console.log(`No identity found for customer: ${stripeCustomerId}`)
    return { handled: false }
  }

  // Get the price ID from subscription
  const priceId = subscription.items.data[0]?.price.id
  if (!priceId) {
    return { handled: false }
  }

  const bundle = await prisma.bundle.findUnique({
    where: { stripePriceId: priceId }
  })

  if (!bundle) {
    return { handled: false }
  }

  // Update entitlement based on subscription status
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    await grantAccess({
      identityId: identity.id,
      productIds: bundle.productIds,
      source: 'bundle',
      bundleId: bundle.id,
      durationType: bundle.durationType as DurationType,
      durationValue: bundle.durationValue,
      stripeSubscriptionId: subscription.id
    })
  } else if (
    subscription.status === 'canceled' ||
    subscription.status === 'unpaid' ||
    subscription.status === 'past_due'
  ) {
    // Revoke access
    for (const productId of bundle.productIds) {
      await prisma.entitlement.updateMany({
        where: {
          identityId: identity.id,
          productId,
          stripeSubscriptionId: subscription.id
        },
        data: {
          revokedAt: new Date(),
          revokedReason: `Subscription ${subscription.status}`
        }
      })
    }
  }

  return { handled: true }
}

/**
 * Handle subscription deleted
 */
export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id

  const identity = await prisma.identity.findFirst({
    where: { stripeCustomerId }
  })

  if (!identity) {
    return { handled: false }
  }

  // Revoke all entitlements linked to this subscription
  await prisma.entitlement.updateMany({
    where: {
      identityId: identity.id,
      stripeSubscriptionId: subscription.id
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'Subscription deleted'
    }
  })

  return { handled: true }
}

/**
 * Log webhook event
 */
export async function logWebhookEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
  status: 'success' | 'failed' | 'ignored',
  errorMessage?: string
) {
  return prisma.webhookLog.upsert({
    where: { eventId },
    create: {
      eventId,
      eventType,
      payload: payload as object,
      status,
      errorMessage
    },
    update: {
      status,
      errorMessage
    }
  })
}
