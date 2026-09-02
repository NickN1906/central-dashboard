import { NextRequest, NextResponse } from 'next/server'
import { scheduleCancellation } from '@/lib/services/entitlements.service'
import { syncContactToZohoAsync } from '@/lib/services/zoho.service'

const ADMIN_API_KEY = process.env.CENTRAL_DASHBOARD_API_KEY

// Apps allowed to initiate a self-serve cancellation on behalf of their user.
const VALID_SOURCE_APPS = ['rezume', 'aicoach', '123jobs-resume', '123jobs-interview']

/**
 * POST /api/v1/entitlements/cancel
 *
 * Self-serve, user-initiated subscription cancellation, routed through Central
 * (the source of truth). Central asks the source app to schedule an
 * END-OF-PERIOD Stripe cancellation (cancel_at_period_end) and records the
 * pending cancellation. Access is retained until the period ends, when Stripe's
 * subscription.deleted webhook performs the final revoke.
 *
 * This is DISTINCT from the admin hard-revoke (immediate) path.
 *
 * Auth: `x-admin-api-key` header must equal CENTRAL_DASHBOARD_API_KEY.
 *
 * Body:
 *   email      string (required)
 *   productId  string (required) e.g. 'aicoach'
 *   sourceApp  string (required) one of VALID_SOURCE_APPS
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-admin-api-key')

  if (!ADMIN_API_KEY) {
    console.error('[Cancel] CENTRAL_DASHBOARD_API_KEY not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    console.warn('[Cancel] Invalid or missing API key')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { email, productId, sourceApp } = body || {}

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Missing required field: email' }, { status: 400 })
    }
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'Missing required field: productId' }, { status: 400 })
    }
    if (!sourceApp || !VALID_SOURCE_APPS.includes(sourceApp)) {
      return NextResponse.json(
        { error: `Missing or invalid field: sourceApp (must be one of: ${VALID_SOURCE_APPS.join(', ')})` },
        { status: 400 }
      )
    }

    const result = await scheduleCancellation({
      email: email.toLowerCase(),
      productId,
      sourceApp
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to schedule cancellation' },
        { status: 502 }
      )
    }

    // Keep CRM in sync (fire-and-forget).
    syncContactToZohoAsync(email.toLowerCase())

    console.log(`[Cancel] Scheduled end-of-period cancellation from ${sourceApp} for ${email} (${productId}), period end: ${result.periodEnd}`)

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: true,
      periodEnd: result.periodEnd,
      email,
      productId,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Cancel] Error processing cancellation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
