import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'
import { BUNDLE_KINDS } from '@/lib/types'

/**
 * GET /api/v1/admin/bundles/:id
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
    const bundle = await prisma.bundle.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            entitlements: true,
            claimTokens: true
          }
        }
      }
    })

    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    // Get product details
    const products = await prisma.product.findMany({
      where: { id: { in: bundle.productIds } }
    })

    return NextResponse.json({ bundle, products })
  } catch (error) {
    console.error('Error fetching bundle:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/admin/bundles/:id
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
    const {
      name,
      slug,
      description,
      stripePriceId,
      productIds,
      durationType,
      durationValue,
      kind,
      heartbeatInvitationId,
      isActive
    } = body

    if (kind !== undefined && !BUNDLE_KINDS.includes(kind)) {
      return NextResponse.json(
        { error: `kind must be one of: ${BUNDLE_KINDS.join(', ')}` },
        { status: 400 }
      )
    }

    // Check for conflicts if updating slug or stripePriceId
    if (slug) {
      const existingSlug = await prisma.bundle.findFirst({
        where: { slug, id: { not: parseInt(id) } }
      })
      if (existingSlug) {
        return NextResponse.json(
          { error: 'Bundle with this slug already exists' },
          { status: 409 }
        )
      }
    }

    if (stripePriceId) {
      const existingPrice = await prisma.bundle.findFirst({
        where: { stripePriceId, id: { not: parseInt(id) } }
      })
      if (existingPrice) {
        return NextResponse.json(
          { error: 'Bundle with this Stripe Price ID already exists' },
          { status: 409 }
        )
      }
    }

    const bundle = await prisma.bundle.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(stripePriceId !== undefined && { stripePriceId }),
        ...(productIds !== undefined && { productIds }),
        ...(durationType !== undefined && { durationType }),
        ...(durationValue !== undefined && { durationValue }),
        ...(kind !== undefined && { kind }),
        ...(heartbeatInvitationId !== undefined && { heartbeatInvitationId: heartbeatInvitationId || null }),
        ...(isActive !== undefined && { isActive })
      }
    })

    await prisma.auditLog.create({
      data: {
        action: 'bundle_updated',
        productIds: bundle.productIds,
        adminEmail: authResult.admin.email,
        details: { bundleId: bundle.id, updates: body }
      }
    })

    return NextResponse.json({ bundle })
  } catch (error) {
    console.error('Error updating bundle:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/v1/admin/bundles/:id (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { id } = await params

  try {
    const bundle = await prisma.bundle.update({
      where: { id: parseInt(id) },
      data: { isActive: false }
    })

    await prisma.auditLog.create({
      data: {
        action: 'bundle_deleted',
        productIds: bundle.productIds,
        adminEmail: authResult.admin.email,
        details: { bundleId: bundle.id }
      }
    })

    return NextResponse.json({ bundle })
  } catch (error) {
    console.error('Error deleting bundle:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
