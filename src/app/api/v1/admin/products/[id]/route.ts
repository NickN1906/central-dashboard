import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'

/**
 * GET /api/v1/admin/products/:id
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
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            entitlements: { where: { revokedAt: null } },
            productSubmissions: true
          }
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/admin/products/:id
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
      description,
      appUrl,
      requiresOngoingAccess,
      formSchema,
      zapierWebhookUrl,
      isActive,
      displayOrder
    } = body

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(appUrl !== undefined && { appUrl }),
        ...(requiresOngoingAccess !== undefined && { requiresOngoingAccess }),
        ...(formSchema !== undefined && { formSchema }),
        ...(zapierWebhookUrl !== undefined && { zapierWebhookUrl }),
        ...(isActive !== undefined && { isActive }),
        ...(displayOrder !== undefined && { displayOrder })
      }
    })

    await prisma.auditLog.create({
      data: {
        action: 'product_updated',
        productIds: [id],
        adminEmail: authResult.admin.email,
        details: body
      }
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/v1/admin/products/:id (soft delete)
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
    // Soft delete by setting isActive to false
    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false }
    })

    await prisma.auditLog.create({
      data: {
        action: 'product_deleted',
        productIds: [id],
        adminEmail: authResult.admin.email
      }
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
