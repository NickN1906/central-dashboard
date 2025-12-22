import { NextRequest, NextResponse } from 'next/server'
import { reportExternalSubscription } from '@/lib/services/entitlements.service'

const ADMIN_API_KEY = process.env.CENTRAL_DASHBOARD_API_KEY

/**
 * POST /api/v1/entitlements/report
 *
 * Called by external apps (Rezume, AI Coach) to report subscription changes.
 * This allows Central Dashboard to maintain visibility of ALL subscriptions
 * across the platform, not just bundles.
 *
 * Protected by API key.
 *
 * Body:
 * {
 *   email: string (required)
 *   productId: string (required) - 'rezume' or 'aicoach'
 *   action: 'grant' | 'revoke' (required)
 *   sourceApp: 'rezume' | 'aicoach' (required) - which app is reporting
 *   stripeSubscriptionId?: string
 *   stripePriceId?: string
 *   amountPaid?: number (in cents)
 *   currency?: string ('cad', 'usd')
 *   expiresAt?: string (ISO date)
 *   reason?: string (for revocations)
 * }
 */
export async function POST(request: NextRequest) {
  // Verify API key
  const apiKey = request.headers.get('x-admin-api-key')

  if (!ADMIN_API_KEY) {
    console.error('[Report] CENTRAL_DASHBOARD_API_KEY not configured')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    console.warn('[Report] Invalid or missing API key')
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()

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
    } = body

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: 'Missing required field: email' },
        { status: 400 }
      )
    }

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing required field: productId' },
        { status: 400 }
      )
    }

    if (!action || !['grant', 'revoke'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing or invalid field: action (must be "grant" or "revoke")' },
        { status: 400 }
      )
    }

    if (!sourceApp || !['rezume', 'aicoach'].includes(sourceApp)) {
      return NextResponse.json(
        { error: 'Missing or invalid field: sourceApp (must be "rezume" or "aicoach")' },
        { status: 400 }
      )
    }

    // Process the report
    const result = await reportExternalSubscription({
      email,
      productId,
      action,
      sourceApp,
      stripeSubscriptionId,
      stripePriceId,
      amountPaid: amountPaid ? parseInt(amountPaid) : undefined,
      currency,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      reason
    })

    console.log(`[Report] ${action} subscription reported from ${sourceApp} for ${email} (${productId})`)

    return NextResponse.json({
      ...result,
      email,
      productId,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Report] Error processing subscription report:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/entitlements/report
 *
 * Returns info about what this endpoint expects
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v1/entitlements/report',
    method: 'POST',
    description: 'Report subscription changes from external apps (Rezume, AI Coach)',
    authentication: 'X-Admin-Api-Key header required',
    body: {
      email: 'string (required)',
      productId: 'string (required) - "rezume" or "aicoach"',
      action: '"grant" | "revoke" (required)',
      sourceApp: '"rezume" | "aicoach" (required)',
      stripeSubscriptionId: 'string (optional)',
      stripePriceId: 'string (optional)',
      amountPaid: 'number in cents (optional)',
      currency: 'string like "cad" or "usd" (optional)',
      expiresAt: 'ISO date string (optional)',
      reason: 'string for revocations (optional)'
    },
    examples: {
      grant: {
        email: 'user@example.com',
        productId: 'rezume',
        action: 'grant',
        sourceApp: 'rezume',
        stripeSubscriptionId: 'sub_xxx',
        stripePriceId: 'price_xxx',
        amountPaid: 1999,
        currency: 'cad'
      },
      revoke: {
        email: 'user@example.com',
        productId: 'rezume',
        action: 'revoke',
        sourceApp: 'rezume',
        stripeSubscriptionId: 'sub_xxx',
        reason: 'Subscription canceled'
      }
    }
  })
}
