import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'
import { grantAccess, getOrCreateIdentity } from '@/lib/services/entitlements.service'
import { DurationType } from '@/lib/types'

/**
 * GET /api/v1/admin/users
 *
 * Search and list users (identities)
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search')
  const product = searchParams.get('product')
  const source = searchParams.get('source')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { primaryEmail: { contains: search, mode: 'insensitive' } },
        { emails: { some: { email: { contains: search, mode: 'insensitive' } } } }
      ]
    }

    if (product || source) {
      where.entitlements = {
        some: {
          ...(product && { productId: product }),
          ...(source && { source }),
          revokedAt: null
        }
      }
    }

    const [identities, total] = await Promise.all([
      prisma.identity.findMany({
        where,
        include: {
          emails: {
            select: { email: true, productId: true, verified: true }
          },
          entitlements: {
            where: { revokedAt: null },
            include: {
              bundle: { select: { name: true } },
              product: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.identity.count({ where })
    ])

    return NextResponse.json({
      users: identities,
      total,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/admin/users/grant
 *
 * Manually grant access to products
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await request.json()
    const {
      email,
      productIds,
      source = 'manual',
      reason,
      durationType = 'lifetime',
      durationValue
    } = body

    if (!email || !productIds || productIds.length === 0) {
      return NextResponse.json(
        { error: 'Email and at least one product are required' },
        { status: 400 }
      )
    }

    // Create or get identity
    const identity = await getOrCreateIdentity(email)

    // Link email to identity for each product
    for (const productId of productIds) {
      await prisma.identityEmail.upsert({
        where: {
          email_productId: { email: email.toLowerCase(), productId }
        },
        create: {
          identityId: identity.id,
          email: email.toLowerCase(),
          productId
        },
        update: {}
      })
    }

    // Grant access
    const entitlements = await grantAccess({
      identityId: identity.id,
      productIds,
      source: source as 'bundle' | 'direct' | 'promo' | 'manual',
      durationType: durationType as DurationType,
      durationValue
    })

    // Log the manual grant
    await prisma.auditLog.create({
      data: {
        action: 'manual_grant',
        identityId: identity.id,
        productIds,
        adminEmail: authResult.admin.email,
        details: { email, reason, durationType, durationValue }
      }
    })

    return NextResponse.json({
      success: true,
      identity,
      entitlements
    })
  } catch (error) {
    console.error('Error granting access:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
