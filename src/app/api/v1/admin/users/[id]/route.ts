import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'
import { revokeAccess, grantAccess } from '@/lib/services/entitlements.service'

/**
 * GET /api/v1/admin/users/:id
 *
 * Get user (identity) details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { id } = await params

  try {
    const identity = await prisma.identity.findUnique({
      where: { id },
      include: {
        emails: {
          include: {
            product: { select: { name: true } }
          }
        },
        entitlements: {
          include: {
            product: { select: { name: true } },
            bundle: { select: { name: true } }
          },
          orderBy: { grantedAt: 'desc' }
        },
        productSubmissions: {
          include: {
            product: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        claimTokens: {
          include: {
            bundle: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!identity) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: identity })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/admin/users/:id/revoke
 *
 * Revoke access to products
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { productIds, reason } = body

    if (!productIds || productIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one product is required' },
        { status: 400 }
      )
    }

    await revokeAccess({
      identityId: id,
      productIds,
      reason,
      adminEmail: authResult.admin.email
    })

    return NextResponse.json({
      success: true,
      message: 'Access revoked successfully'
    })
  } catch (error) {
    console.error('Error revoking access:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/admin/users/:id/extend
 *
 * Extend access expiry
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { productIds, newExpiresAt } = body

    if (!productIds || productIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one product is required' },
        { status: 400 }
      )
    }

    const expiresAt = newExpiresAt ? new Date(newExpiresAt) : null

    await Promise.all(
      productIds.map((productId: string) =>
        prisma.entitlement.updateMany({
          where: { identityId: id, productId },
          data: { expiresAt }
        })
      )
    )

    await prisma.auditLog.create({
      data: {
        action: 'extend_access',
        identityId: id,
        productIds,
        adminEmail: authResult.admin.email,
        details: { newExpiresAt: expiresAt }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Access extended successfully'
    })
  } catch (error) {
    console.error('Error extending access:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/v1/admin/users/:id/grant
 *
 * Grant access to products
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { productIds, bundleId, durationType, durationValue, source } = body

    // Determine which products to grant - either directly or via bundle
    let targetProductIds = productIds
    let targetBundleId = bundleId
    let targetDurationType = durationType
    let targetDurationValue = durationValue

    if (bundleId) {
      // Fetch bundle and use its products and duration settings
      const bundle = await prisma.bundle.findUnique({
        where: { id: bundleId }
      })

      if (!bundle) {
        return NextResponse.json(
          { error: 'Bundle not found' },
          { status: 404 }
        )
      }

      targetProductIds = bundle.productIds
      targetDurationType = bundle.durationType
      targetDurationValue = bundle.durationValue
    }

    if (!targetProductIds || targetProductIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one product is required' },
        { status: 400 }
      )
    }

    // Verify identity exists
    const identity = await prisma.identity.findUnique({
      where: { id }
    })

    if (!identity) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await grantAccess({
      identityId: id,
      productIds: targetProductIds,
      bundleId: targetBundleId,
      source: source || (bundleId ? 'bundle' : 'manual'),
      durationType: targetDurationType,
      durationValue: targetDurationValue
    })

    await prisma.auditLog.create({
      data: {
        action: 'admin_grant',
        identityId: id,
        productIds: targetProductIds,
        adminEmail: authResult.admin.email,
        details: { bundleId, durationType: targetDurationType, durationValue: targetDurationValue, source }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Access granted successfully'
    })
  } catch (error) {
    console.error('Error granting access:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
