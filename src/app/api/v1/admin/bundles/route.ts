import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'

/**
 * GET /api/v1/admin/bundles
 *
 * List all bundles with stats
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const bundles = await prisma.bundle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            entitlements: true,
            claimTokens: { where: { claimed: true } }
          }
        }
      }
    })

    // Get product names for each bundle
    const allProductIds = [...new Set(bundles.flatMap((b) => b.productIds))]
    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, name: true }
    })
    const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]))

    const bundlesWithProductNames = bundles.map((bundle) => ({
      ...bundle,
      productNames: bundle.productIds.map((id) => productMap[id] || id)
    }))

    return NextResponse.json({ bundles: bundlesWithProductNames })
  } catch (error) {
    console.error('Error fetching bundles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/admin/bundles
 *
 * Create a new bundle
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await request.json()
    const {
      name,
      slug,
      description,
      stripePriceId,
      productIds,
      durationType = 'lifetime',
      durationValue
    } = body

    if (!name || !slug || !stripePriceId || !productIds || productIds.length === 0) {
      return NextResponse.json(
        { error: 'Name, slug, stripePriceId, and at least one product are required' },
        { status: 400 }
      )
    }

    // Check if slug or stripePriceId already exists
    const existingSlug = await prisma.bundle.findUnique({ where: { slug } })
    if (existingSlug) {
      return NextResponse.json(
        { error: 'Bundle with this slug already exists' },
        { status: 409 }
      )
    }

    const existingPrice = await prisma.bundle.findUnique({ where: { stripePriceId } })
    if (existingPrice) {
      return NextResponse.json(
        { error: 'Bundle with this Stripe Price ID already exists' },
        { status: 409 }
      )
    }

    // Verify all product IDs exist
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    })
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: 'One or more product IDs are invalid' },
        { status: 400 }
      )
    }

    const bundle = await prisma.bundle.create({
      data: {
        name,
        slug,
        description,
        stripePriceId,
        productIds,
        durationType,
        durationValue
      }
    })

    await prisma.auditLog.create({
      data: {
        action: 'bundle_created',
        productIds,
        adminEmail: authResult.admin.email,
        details: { bundleId: bundle.id, name, stripePriceId }
      }
    })

    return NextResponse.json({ bundle }, { status: 201 })
  } catch (error) {
    console.error('Error creating bundle:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
