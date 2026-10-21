import Stripe from 'stripe'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import {
  getOrCreateIdentity,
  createClaimToken,
  grantAccess
} from './entitlements.service'
import { sendBundlePurchaseEmail } from './email.service'
import { grantAccessAndSync, revokeAccessAndSync, scheduleCancellationOnApp } from './app-sync.service'
import { syncContactToZohoAsync } from './zoho.service'
import { inviteToHeartbeat } from './heartbeat.service'
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

  const granted = await grantAccess({
    identityId: identity.id,
    productIds: bundle.productIds,
    source: 'bundle',
    bundleId: bundle.id,
    durationType: bundle.durationType as DurationType,
    durationValue: bundle.durationValue,
    stripePriceId: priceId,
    amountPaid: session.amount_total ?? undefined,
    currency: session.currency ?? undefined,
    // A purchase must never cut short access the customer already has. A
    // one-time purchase adds its full duration on top of their current end
    // date (buying early never loses paid time); a subscription keeps the later.
    onExisting: session.mode === 'payment' ? 'extend' : 'keepLonger'
  })

  // The email shows the date access actually ends (which may be later than
  // "now + duration" when the customer already had access).
  const expiries = granted.map((e) => e.expiresAt)
  const expiresAt = expiries.some((d) => d === null)
    ? undefined
    : new Date(Math.max(...expiries.map((d) => (d as Date).getTime())))

  // One-time purchase by someone who already subscribes to one of the apps in
  // it: stop that subscription at the end of its current period so they are
  // not billed twice for access they now have. Never fails the webhook.
  const isOneTime = session.mode === 'payment'
  const endedSubscriptions = isOneTime
    ? await endOverlappingSubscriptions(identity.id, customerEmail, bundle.productIds)
    : []

  // Coaching bundles: approve the buyer on the bundle's Heartbeat sign-up link
  // so Heartbeat sends them their community invite (no manual step).
  if (bundle.heartbeatInvitationId) {
    const invite = await inviteToHeartbeat(customerEmail, bundle.heartbeatInvitationId)
    await prisma.auditLog.create({
      data: {
        action: invite.success ? 'heartbeat_invite' : 'heartbeat_invite_failed',
        identityId: identity.id,
        productIds: bundle.productIds,
        details: {
          email: customerEmail,
          bundleId: bundle.id,
          invitationId: bundle.heartbeatInvitationId,
          ...(invite.success ? {} : { error: invite.error, status: invite.status })
        }
      }
    })
  }

  // Send confirmation email with instructions
  await sendBundlePurchaseEmail({
    customerEmail,
    customerName: session.customer_details?.name || undefined,
    bundleName: bundle.name,
    productIds: bundle.productIds,
    expiresAt,
    oneTime: isOneTime,
    endedSubscriptions,
    includesCoaching: !!bundle.heartbeatInvitationId
  })

  // Sync access to connected apps (Rezume, AI Coach)
  const syncResults = await grantAccessAndSync(
    customerEmail,
    bundle.productIds,
    `Bundle purchase: ${bundle.name}`
  )
  console.log('[Stripe] App sync results:', syncResults)

  // Push bundle purchase to Zoho CRM (fire-and-forget)
  syncContactToZohoAsync(customerEmail)

  return {
    handled: true,
    action: 'access_granted',
    bundleName: bundle.name,
    products: bundle.productIds,
    syncResults
  }
}

// Apps whose own Stripe subscriptions a one-time purchase can make redundant.
const SUBSCRIPTION_APPS: Record<string, string> = {
  rezume: 'Rezume',
  aicoach: 'AI Interview Coach',
}

/**
 * For each app in a one-time purchase where the customer also has a live
 * subscription, ask that app to cancel the subscription at period end (access
 * continues until then, and the new purchase covers them after). Returns a
 * customer-facing line per subscription ended, for the confirmation email.
 */
async function endOverlappingSubscriptions(
  identityId: string,
  email: string,
  productIds: string[]
): Promise<string[]> {
  const lines: string[] = []
  try {
    const live = await prisma.entitlement.findMany({
      where: {
        identityId,
        productId: { in: productIds.filter((id) => id in SUBSCRIPTION_APPS) },
        source: 'direct',
        revokedAt: null,
        stripeSubscriptionId: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    })
    const apps = [...new Set(live.map((e) => e.sourceApp).filter((a): a is string => !!a && a in SUBSCRIPTION_APPS))]

    for (const app of apps) {
      const result = await scheduleCancellationOnApp(app, email)
      await prisma.auditLog.create({
        data: {
          action: result.success ? 'auto_cancel_overlap' : 'auto_cancel_overlap_failed',
          identityId,
          productIds: [app],
          details: { email, periodEnd: result.currentPeriodEnd ?? null, error: result.error }
        }
      })

      if (!result.success) {
        console.error(`[Stripe] Could not end overlapping ${app} subscription for ${email}:`, result.error)
        continue
      }

      if (result.currentPeriodEnd) {
        await prisma.entitlement.updateMany({
          where: { identityId, productId: app, source: 'direct', sourceApp: app, revokedAt: null },
          data: { expiresAt: new Date(result.currentPeriodEnd) }
        })
      }

      const until = result.currentPeriodEnd
        ? ` on ${new Date(result.currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
        : ' at the end of its current billing period'
      lines.push(`Your ${SUBSCRIPTION_APPS[app]} subscription will end${until} and will not renew, so you won't be charged twice.`)
    }
  } catch (error) {
    console.error('[Stripe] Error ending overlapping subscriptions:', error)
  }
  return lines
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

    // Sync access to connected apps
    const syncResults = await grantAccessAndSync(
      identity.primaryEmail,
      bundle.productIds,
      `Subscription ${subscription.status}`
    )
    console.log('[Stripe] Subscription active sync results:', syncResults)
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

    // Sync revocation to connected apps
    const syncResults = await revokeAccessAndSync(
      identity.primaryEmail,
      bundle.productIds,
      `Subscription ${subscription.status}`
    )
    console.log('[Stripe] Revocation sync results:', syncResults)
  }

  // Push updated membership to Zoho CRM (fire-and-forget)
  syncContactToZohoAsync(identity.primaryEmail)

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

  // Get entitlements to find product IDs before revoking
  const entitlements = await prisma.entitlement.findMany({
    where: {
      identityId: identity.id,
      stripeSubscriptionId: subscription.id
    },
    select: { productId: true }
  })

  const productIds = [...new Set(entitlements.map(e => e.productId))]

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

  // Sync revocation to connected apps
  if (productIds.length > 0) {
    const syncResults = await revokeAccessAndSync(
      identity.primaryEmail,
      productIds,
      'Subscription deleted'
    )
    console.log('[Stripe] Subscription deleted sync results:', syncResults)
  }

  // Push updated membership to Zoho CRM (fire-and-forget)
  syncContactToZohoAsync(identity.primaryEmail)

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
