import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'
import { sendBundlePurchaseEmail } from '@/lib/services/email.service'

/**
 * POST /api/v1/admin/test-email
 *
 * Send a test bundle purchase email to preview the design
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
      customerName = 'Test User',
      bundleName = 'A-Game Ultimate Career Bundle',
      productIds = ['rezume', 'aicoach', 'careerpathway'],
      daysUntilExpiry = 365
    } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      )
    }

    // Calculate expiry date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + daysUntilExpiry)

    const success = await sendBundlePurchaseEmail({
      customerEmail: email,
      customerName,
      bundleName,
      productIds,
      expiresAt
    })

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent to ${email}`
      })
    } else {
      return NextResponse.json(
        { error: 'Failed to send email. Check Resend API configuration.' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error sending test email:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
