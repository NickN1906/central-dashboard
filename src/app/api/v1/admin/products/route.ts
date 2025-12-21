import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'

/**
 * GET /api/v1/admin/products
 *
 * List all products with stats
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const products = await prisma.product.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: {
          select: {
            entitlements: {
              where: { revokedAt: null }
            }
          }
        }
      }
    })

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/admin/products
 *
 * Create a new product
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await request.json()
    const {
      id,
      name,
      description,
      appUrl,
      requiresOngoingAccess = true,
      formSchema,
      zapierWebhookUrl,
      displayOrder = 0
    } = body

    if (!id || !name) {
      return NextResponse.json(
        { error: 'ID and name are required' },
        { status: 400 }
      )
    }

    // Check if ID already exists
    const existing = await prisma.product.findUnique({ where: { id } })
    if (existing) {
      return NextResponse.json(
        { error: 'Product with this ID already exists' },
        { status: 409 }
      )
    }

    const product = await prisma.product.create({
      data: {
        id,
        name,
        description,
        appUrl,
        requiresOngoingAccess,
        formSchema,
        zapierWebhookUrl,
        displayOrder
      }
    })

    // Log the action
    await prisma.auditLog.create({
      data: {
        action: 'product_created',
        productIds: [id],
        adminEmail: authResult.admin.email,
        details: { name }
      }
    })

    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
