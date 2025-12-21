import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { processClaim } from '@/lib/services/entitlements.service'
import { triggerZapierWebhook } from '@/lib/services/zapier.service'
import { ClaimTokenResponse, FormField } from '@/lib/types'

/**
 * GET /api/v1/claim/:token
 *
 * Get claim token details for the claim portal.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  try {
    const claimToken = await prisma.claimToken.findUnique({
      where: { token },
      include: {
        bundle: true,
        identity: true
      }
    })

    if (!claimToken) {
      return NextResponse.json<ClaimTokenResponse>({
        valid: false,
        error: 'Invalid claim token'
      })
    }

    if (claimToken.claimed) {
      return NextResponse.json<ClaimTokenResponse>({
        valid: false,
        error: 'Token already claimed'
      })
    }

    if (claimToken.expiresAt < new Date()) {
      return NextResponse.json<ClaimTokenResponse>({
        valid: false,
        error: 'Token expired'
      })
    }

    // Get product details
    const products = await prisma.product.findMany({
      where: {
        id: { in: claimToken.bundle.productIds },
        isActive: true
      },
      orderBy: { displayOrder: 'asc' }
    })

    return NextResponse.json<ClaimTokenResponse>({
      valid: true,
      bundle: {
        name: claimToken.bundle.name,
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          requiresEmail: true,
          formSchema: p.formSchema as FormField[] | null
        }))
      },
      purchaseEmail: claimToken.purchaseEmail,
      expiresAt: claimToken.expiresAt.toISOString()
    })
  } catch (error) {
    console.error('Error getting claim token:', error)
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/claim/:token/activate
 *
 * Activate the bundle claim with product emails and form data.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  try {
    const body = await request.json()
    const { products: productData } = body as {
      products: Record<string, { email: string; formData?: Record<string, unknown> }>
    }

    if (!productData || Object.keys(productData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No product data provided' },
        { status: 400 }
      )
    }

    // Process the claim
    const result = await processClaim(token, productData)

    // Trigger Zapier for products that have webhooks configured
    const productsWithWebhooks = await prisma.product.findMany({
      where: {
        id: { in: result.bundle.productIds },
        zapierWebhookUrl: { not: null }
      }
    })

    const zapierResults = await Promise.allSettled(
      productsWithWebhooks.map(async (product) => {
        const data = productData[product.id]
        if (data?.formData) {
          return triggerZapierWebhook(
            product.id,
            { ...data.formData, email: data.email },
            result.identity.id
          )
        }
        return { skipped: true }
      })
    )

    // Prepare response with status per product
    const activatedProducts = result.bundle.productIds.map((productId) => {
      const data = productData[productId]
      const product = productsWithWebhooks.find((p) => p.id === productId)

      return {
        product: productId,
        email: data?.email || result.identity.primaryEmail,
        status: product?.zapierWebhookUrl ? 'processing' : 'ready'
      }
    })

    return NextResponse.json({
      success: true,
      activated: activatedProducts,
      message: 'Bundle activated successfully!'
    })
  } catch (error) {
    console.error('Error activating claim:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    )
  }
}
