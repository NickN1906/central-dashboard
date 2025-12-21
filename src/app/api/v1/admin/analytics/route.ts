import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'

/**
 * GET /api/v1/admin/analytics
 *
 * Get analytics overview
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    // Get total counts
    const [totalIdentities, totalEntitlements, activeEntitlements] = await Promise.all([
      prisma.identity.count(),
      prisma.entitlement.count(),
      prisma.entitlement.count({ where: { revokedAt: null } })
    ])

    // Get counts by product
    const byProduct = await prisma.entitlement.groupBy({
      by: ['productId'],
      where: { revokedAt: null },
      _count: true
    })

    // Get counts by source
    const bySource = await prisma.entitlement.groupBy({
      by: ['source'],
      where: { revokedAt: null },
      _count: true
    })

    // Get recent grants (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const recentGrants = await prisma.entitlement.findMany({
      where: {
        grantedAt: { gte: sevenDaysAgo }
      },
      include: {
        identity: { select: { primaryEmail: true } },
        product: { select: { name: true } }
      },
      orderBy: { grantedAt: 'desc' },
      take: 10
    })

    // Get expiring soon (next 30 days)
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    const expiringSoon = await prisma.entitlement.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          not: null,
          lte: thirtyDaysFromNow,
          gt: new Date()
        }
      },
      include: {
        identity: { select: { primaryEmail: true } },
        product: { select: { name: true } }
      },
      orderBy: { expiresAt: 'asc' },
      take: 10
    })

    // Get bundle claim stats
    const bundleStats = await prisma.claimToken.groupBy({
      by: ['bundleId'],
      _count: { _all: true },
      where: { claimed: true }
    })

    const bundles = await prisma.bundle.findMany({
      where: { id: { in: bundleStats.map((b) => b.bundleId) } },
      select: { id: true, name: true }
    })

    const bundleMap = Object.fromEntries(bundles.map((b) => [b.id, b.name]))

    return NextResponse.json({
      overview: {
        totalIdentities,
        totalEntitlements,
        activeEntitlements
      },
      byProduct: Object.fromEntries(
        byProduct.map((p) => [p.productId, p._count])
      ),
      bySource: Object.fromEntries(
        bySource.map((s) => [s.source, s._count])
      ),
      recentGrants: recentGrants.map((g) => ({
        email: g.identity.primaryEmail,
        product: g.product.name,
        productId: g.productId,
        source: g.source,
        grantedAt: g.grantedAt
      })),
      expiringSoon: expiringSoon.map((e) => ({
        email: e.identity.primaryEmail,
        product: e.product.name,
        productId: e.productId,
        expiresAt: e.expiresAt
      })),
      bundleClaims: bundleStats.map((b) => ({
        bundleId: b.bundleId,
        bundleName: bundleMap[b.bundleId] || 'Unknown',
        claimed: b._count._all
      }))
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
