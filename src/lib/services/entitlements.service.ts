import prisma from '@/lib/db'
import { calculateExpiryDate, DurationType } from '@/lib/types'
import { nanoid } from 'nanoid'
import { Prisma } from '@prisma/client'
import { revokeAccessAndSync } from './app-sync.service'

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
 * Filters to only check non-revoked, non-expired entitlements
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
            where: {
              productId,
              revokedAt: null, // Only non-revoked entitlements
              OR: [
                { expiresAt: null }, // Never expires
                { expiresAt: { gt: new Date() } } // Not yet expired
              ]
            },
            include: {
              bundle: true
            },
            orderBy: { grantedAt: 'desc' } // Most recent first
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
          where: {
            productId,
            revokedAt: null, // Only non-revoked entitlements
            OR: [
              { expiresAt: null }, // Never expires
              { expiresAt: { gt: new Date() } } // Not yet expired
            ]
          },
          include: { bundle: true },
          orderBy: { grantedAt: 'desc' } // Most recent first
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
  source: 'bundle' | 'direct' | 'promo' | 'manual'
  sourceApp?: 'central' | 'rezume' | 'aicoach' | '123jobs-resume' | '123jobs-interview'
  bundleId?: number
  durationType?: DurationType
  durationValue?: number | null
  stripeSubscriptionId?: string
  stripePriceId?: string
  amountPaid?: number
  currency?: string
}) {
  const {
    identityId,
    productIds,
    source,
    sourceApp = 'central',
    bundleId,
    durationType = 'lifetime',
    durationValue = null,
    stripeSubscriptionId,
    stripePriceId,
    amountPaid,
    currency
  } = params

  const expiresAt = calculateExpiryDate(durationType, durationValue)

  const entitlements = await Promise.all(
    productIds.map(async (productId) => {
      // Use a composite key that includes source and sourceApp
      // This allows multiple entitlements from different sources
      const existingEntitlement = await prisma.entitlement.findFirst({
        where: {
          identityId,
          productId,
          source,
          sourceApp
        }
      })

      if (existingEntitlement) {
        return prisma.entitlement.update({
          where: { id: existingEntitlement.id },
          data: {
            bundleId,
            expiresAt,
            stripeSubscriptionId,
            stripePriceId,
            amountPaid,
            currency,
            revokedAt: null,
            revokedReason: null
          }
        })
      }

      return prisma.entitlement.create({
        data: {
          identityId,
          productId,
          source,
          sourceApp,
          bundleId,
          expiresAt,
          stripeSubscriptionId,
          stripePriceId,
          amountPaid,
          currency
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
      details: { source, sourceApp, bundleId, expiresAt, stripePriceId, amountPaid, currency }
    }
  })

  return entitlements
}

/**
 * Report a subscription from an external app (Rezume, AI Coach, 123jobs apps)
 * This is called when apps grant their own subscriptions
 */
export async function reportExternalSubscription(params: {
  email: string
  productId: string
  action: 'grant' | 'revoke'
  sourceApp: 'rezume' | 'aicoach' | '123jobs-resume' | '123jobs-interview'
  stripeSubscriptionId?: string
  stripePriceId?: string
  amountPaid?: number
  currency?: string
  expiresAt?: Date
  reason?: string
}) {
  const {
    email,
    productId,
    action,
    sourceApp,
    stripeSubscriptionId,
    stripePriceId,
    amountPaid,
    currency,
    expiresAt,
    reason
  } = params

  const normalizedEmail = email.toLowerCase()

  // Get or create identity
  const identity = await getOrCreateIdentity(normalizedEmail)

  // Link email to identity for this product
  await prisma.identityEmail.upsert({
    where: {
      email_productId: { email: normalizedEmail, productId }
    },
    create: {
      identityId: identity.id,
      email: normalizedEmail,
      productId
    },
    update: {}
  })

  if (action === 'grant') {
    // Find or create entitlement for this source
    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        identityId: identity.id,
        productId,
        source: 'direct',
        sourceApp
      }
    })

    if (existingEntitlement) {
      await prisma.entitlement.update({
        where: { id: existingEntitlement.id },
        data: {
          stripeSubscriptionId,
          stripePriceId,
          amountPaid,
          currency,
          expiresAt,
          revokedAt: null,
          revokedReason: null
        }
      })
    } else {
      await prisma.entitlement.create({
        data: {
          identityId: identity.id,
          productId,
          source: 'direct',
          sourceApp,
          stripeSubscriptionId,
          stripePriceId,
          amountPaid,
          currency,
          expiresAt
        }
      })
    }

    // Log the action
    await prisma.auditLog.create({
      data: {
        action: 'external_grant',
        identityId: identity.id,
        productIds: [productId],
        details: { sourceApp, stripeSubscriptionId, stripePriceId, amountPaid, currency, expiresAt }
      }
    })

    return { success: true, action: 'granted', sourceApp }
  } else {
    // Revoke - only revoke entitlements from this specific source
    await prisma.entitlement.updateMany({
      where: {
        identityId: identity.id,
        productId,
        source: 'direct',
        sourceApp,
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {})
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason || `Revoked by ${sourceApp}`
      }
    })

    // Log the action
    await prisma.auditLog.create({
      data: {
        action: 'external_revoke',
        identityId: identity.id,
        productIds: [productId],
        details: { sourceApp, reason, stripeSubscriptionId }
      }
    })

    return { success: true, action: 'revoked', sourceApp }
  }
}

/**
 * Revoke a specific entitlement by ID
 * Also syncs to the relevant app
 */
export async function revokeEntitlementById(params: {
  entitlementId: number
  reason?: string
  adminEmail?: string
}) {
  const { entitlementId, reason, adminEmail } = params

  // Get entitlement with identity info
  const entitlement = await prisma.entitlement.findUnique({
    where: { id: entitlementId },
    include: {
      identity: true
    }
  })

  if (!entitlement) {
    throw new Error('Entitlement not found')
  }

  // Revoke in database
  await prisma.entitlement.update({
    where: { id: entitlementId },
    data: {
      revokedAt: new Date(),
      revokedReason: reason
    }
  })

  await prisma.auditLog.create({
    data: {
      action: 'revoke_single',
      identityId: entitlement.identityId,
      productIds: [entitlement.productId],
      adminEmail,
      details: {
        reason,
        source: entitlement.source,
        sourceApp: entitlement.sourceApp,
        entitlementId
      }
    }
  })

  // Check if there are other active entitlements for this product
  const remainingActive = await prisma.entitlement.count({
    where: {
      identityId: entitlement.identityId,
      productId: entitlement.productId,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    }
  })

  // Only sync revocation to app if no other active entitlements remain
  if (remainingActive === 0 && entitlement.identity.primaryEmail) {
    const syncResults = await revokeAccessAndSync(
      entitlement.identity.primaryEmail,
      [entitlement.productId],
      reason || `Access revoked via Central Dashboard${adminEmail ? ` by ${adminEmail}` : ''}`
    )
    console.log('[Entitlements] App sync results:', syncResults)
  }

  return { success: true, entitlementId, remainingActive }
}

/**
 * Revoke access to products for an identity
 * Also syncs to apps to cancel any active Stripe subscriptions
 */
export async function revokeAccess(params: {
  identityId: string
  productIds: string[]
  reason?: string
  adminEmail?: string
}) {
  const { identityId, productIds, reason, adminEmail } = params

  // Get the identity to get the email for syncing
  const identity = await prisma.identity.findUnique({
    where: { id: identityId }
  })

  // Revoke in database
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

  // Sync to apps - this will cancel any active Stripe subscriptions
  if (identity?.primaryEmail) {
    const syncResults = await revokeAccessAndSync(
      identity.primaryEmail,
      productIds,
      reason || `Access revoked via Central Dashboard${adminEmail ? ` by ${adminEmail}` : ''}`
    )

    // Log sync results
    console.log('[Entitlements] App sync results:', syncResults)

    // Also log sync results to audit log
    await prisma.auditLog.create({
      data: {
        action: 'app_sync_revoke',
        identityId,
        productIds,
        adminEmail,
        details: {
          reason,
          syncResults: syncResults.map(r => ({
            app: r.app,
            success: r.success,
            error: r.error
          }))
        }
      }
    })
  }
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
