import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/services/entitlements.service'

/**
 * GET /api/v1/check?email=xxx&product=xxx
 *
 * Check if an email has access to a specific product.
 * This is the main endpoint that apps (Rezume, AI Coach) call on login.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const email = searchParams.get('email')
  const product = searchParams.get('product')

  if (!email) {
    return NextResponse.json(
      { error: 'Missing email parameter' },
      { status: 400 }
    )
  }

  if (!product) {
    return NextResponse.json(
      { error: 'Missing product parameter' },
      { status: 400 }
    )
  }

  try {
    const result = await checkAccess(email.toLowerCase(), product)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error checking access:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
