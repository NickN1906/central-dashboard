import { NextRequest, NextResponse } from 'next/server'
import { getEntitlements } from '@/lib/services/entitlements.service'

/**
 * GET /api/v1/entitlements?email=xxx
 *
 * Get all entitlements for an email across all products.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json(
      { error: 'Missing email parameter' },
      { status: 400 }
    )
  }

  try {
    const result = await getEntitlements(email.toLowerCase())
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error getting entitlements:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
