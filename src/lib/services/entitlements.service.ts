import prisma from '@/lib/db'
import { calculateExpiryDate, DurationType } from '@/lib/types'
import { nanoid } from 'nanoid'
import { Prisma } from '@prisma/client'

interface AccessResult {
  hasAccess: boolean
  product: string
  source?: string
  bundleName?: string
  expires?: string | null
  grantedAt?: string
}

/**
 * Check if an email has access to a specific product
 */
export async function checkAccess(email: string, productId: string): Promise<AccessResult> {
  // Find identity email for this product
  const identityEmail = await prisma.identityEmail.findUnique({
    where: {
      email_productId: { email: email.toLowerCase(), productId }
    },
    include: {
      identity: {
        include: {
          entitlements: {
            where: { productId },
            include: {
              bundle: true
            }
          }
        }
      }
    }
  })

  if (!identityEmail) {
    // Check if there's an entitlement by primary email
    const identity = await prisma.identity.findFirst({
      where: { primaryEmail: email.toLowerCase() },
      include: {
        entitlements: {
          where: { productId },
          include: { bundle: true }
        }
      }
    })

    if (!identity || identity.entitlements.length === 0) {
      return { hasAccess: false, product: productId }
    }

    const entitlement = identity.entitlements[0]
    return checkEntitlementAccess(entitlement, productId)
  }

  if (identityEmail.identity.entitlements.length === 0) {
    return { hasAccess: false, product: productId }
  }

  const entitlement = identityEmail.identity.entitlements[0]
  return checkEntitlementAccess(entitlement, productId)
}

function checkEntitlementAccess(
  entitlement: {
    revokedAt: Date | null
    expiresAt: Date | null
    grantedAt: Date
    source: string
    bundle?: { name: string } | null
  },
  productId: string
): AccessResult {
  // Check if revoked
  if (entitlement.revokedAt) {
    return { hasAccess: false, product: productId }
  }

  // Check if expired
  if (entitlement.expiresAt && entitlement.expiresAt < new Date()) {
    return { hasAccess: false, product: productId }
  }

  return {
    hasAccess: true,
    product: productId,
    source: entitlement.source,
    bundleName: entitlement.bundle?.name,
    expires: entitlement.expiresAt?.toISOString() || null,
    grantedAt: entitlement.grantedAt.toISOString()
  }
}

/**
 * Get all entitlements for an email
 */
export async function getEntitlements(email: string) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' }
  })

  const results = await Promise.all(
    products.map(async (product) => {
      const access = await checkAccess(email, product.id)
      return {
        id: product.id,
        name: product.name,
        hasAccess: access.hasAccess,
        source: access.source,
        expires: access.expires
      }
    })
  )

  return {
    email,
    products: results
  }
}

/**
 * Grant access to products for an identity
 */
export async function grantAccess(params: {
  identityId: string
  productIds: string[]
  source: 'bundle' | 'individual' | 'promo' | 'manual'
  bundleId?: number
  durationType?: DurationType
  durationValue?: number | null
  stripeSubscriptionId?: string
}) {
  const {
    identityId,
    productIds,
    source,
    bundleId,
    durationType = 'lifetime',
    durationValue = null,
    stripeSubscriptionId
  } = params

  const expiresAt = calculateExpiryDate(durationType, durationValue)

  const entitlements = await Promise.all(
    productIds.map(async (productId) => {
      return prisma.entitlement.upsert({
        where: {
          identityId_productId: { identityId, productId }
        },
        create: {
          identityId,
          productId,
          source,
          bundleId,
          expiresAt,
          stripeSubscriptionId
        },
        update: {
          source,
          bundleId,
          expiresAt,
          stripeSubscriptionId,
          revokedAt: null,
          revokedReason: null
        }
      })
    })
  )

  // Log the action
  await prisma.auditLog.create({
    data: {
      action: 'grant',
      identityId,
      productIds,
      details: { source, bundleId, expiresAt }
    }
  })

  return entitlements
}

/**
 * Revoke access to products for an identity
 */
export async function revokeAccess(params: {
  identityId: string
  productIds: string[]
  reason?: string
  adminEmail?: string
}) {
  const { identityId, productIds, reason, adminEmail } = params

  await Promise.all(
    productIds.map((productId) =>
      prisma.entitlement.updateMany({
        where: { identityId, productId },
        data: {
          revokedAt: new Date(),
          revokedReason: reason
        }
      })
    )
  )

  await prisma.auditLog.create({
    data: {
      action: 'revoke',
      identityId,
      productIds,
      adminEmail,
      details: { reason }
    }
  })
}

/**
 * Create or get identity by email
 */
export async function getOrCreateIdentity(email: string, stripeCustomerId?: string) {
  const normalizedEmail = email.toLowerCase()

  let identity = await prisma.identity.findFirst({
    where: { primaryEmail: normalizedEmail }
  })

  if (!identity) {
    identity = await prisma.identity.create({
      data: {
        primaryEmail: normalizedEmail,
        stripeCustomerId
      }
    })
  } else if (stripeCustomerId && !identity.stripeCustomerId) {
    identity = await prisma.identity.update({
      where: { id: identity.id },
      data: { stripeCustomerId }
    })
  }

  return identity
}

/**
 * Link an email to an identity for a specific product
 */
export async function linkEmailToIdentity(
  identityId: string,
  email: string,
  productId: string
) {
  const normalizedEmail = email.toLowerCase()

  return prisma.identityEmail.upsert({
    where: {
      email_productId: { email: normalizedEmail, productId }
    },
    create: {
      identityId,
      email: normalizedEmail,
      productId
    },
    update: {
      identityId
    }
  })
}

/**
 * Create a claim token for a bundle purchase
 */
export async function createClaimToken(params: {
  identityId: string
  bundleId: number
  purchaseEmail: string
  stripeSessionId?: string
}) {
  const token = nanoid(32)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30) // 30 days to claim

  return prisma.claimToken.create({
    data: {
      token,
      identityId: params.identityId,
      bundleId: params.bundleId,
      purchaseEmail: params.purchaseEmail,
      stripeSessionId: params.stripeSessionId,
      expiresAt
    }
  })
}

/**
 * Get claim token details
 */
export async function getClaimToken(token: string) {
  return prisma.claimToken.findUnique({
    where: { token },
    include: {
      bundle: {
        include: {
          // We need to get product details manually since productIds is an array
        }
      },
      identity: true
    }
  })
}

/**
 * Process a bundle claim
 */
export async function processClaim(
  token: string,
  productEmails: Record<string, { email: string; formData?: Record<string, unknown> }>
) {
  const claimToken = await prisma.claimToken.findUnique({
    where: { token },
    include: {
      bundle: true,
      identity: true
    }
  })

  if (!claimToken) {
    throw new Error('Invalid claim token')
  }

  if (claimToken.claimed) {
    throw new Error('Token already claimed')
  }

  if (claimToken.expiresAt < new Date()) {
    throw new Error('Token expired')
  }

  const { bundle, identity } = claimToken

  // Link emails for each product
  for (const productId of bundle.productIds) {
    const productData = productEmails[productId]
    if (productData?.email) {
      await linkEmailToIdentity(identity.id, productData.email, productId)
    }

    // Store form data if provided (for products like Career Pathways)
    if (productData?.formData) {
      await prisma.productSubmission.create({
        data: {
          identityId: identity.id,
          productId,
          formData: productData.formData as Prisma.InputJsonValue
        }
      })
    }
  }

  // Grant access to all products in the bundle
  await grantAccess({
    identityId: identity.id,
    productIds: bundle.productIds,
    source: 'bundle',
    bundleId: bundle.id,
    durationType: bundle.durationType as DurationType,
    durationValue: bundle.durationValue
  })

  // Mark token as claimed
  await prisma.claimToken.update({
    where: { token },
    data: {
      claimed: true,
      claimedAt: new Date()
    }
  })

  // Log the claim
  await prisma.auditLog.create({
    data: {
      action: 'claim',
      identityId: identity.id,
      productIds: bundle.productIds,
      details: { bundleId: bundle.id, bundleName: bundle.name }
    }
  })

  return { success: true, bundle, identity }
}
