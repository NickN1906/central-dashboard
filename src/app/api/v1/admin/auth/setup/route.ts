import { NextRequest, NextResponse } from 'next/server'
import { createAdminUser, hasAnyAdmin } from '@/lib/services/auth.service'

/**
 * POST /api/v1/admin/auth/setup
 *
 * Initial admin setup - only works when no admin exists
 */
export async function POST(request: NextRequest) {
  try {
    // Check if any admin already exists
    const adminExists = await hasAnyAdmin()
    if (adminExists) {
      return NextResponse.json(
        { error: 'Admin already exists. Use login instead.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, name, setupKey } = body

    // Verify setup key
    const expectedSetupKey = process.env.ADMIN_SETUP_KEY
    if (!expectedSetupKey || setupKey !== expectedSetupKey) {
      return NextResponse.json(
        { error: 'Invalid setup key' },
        { status: 401 }
      )
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const user = await createAdminUser(email, password, name)

    return NextResponse.json({
      success: true,
      message: 'Admin account created successfully',
      user
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/admin/auth/setup
 *
 * Check if initial setup is needed
 */
export async function GET() {
  try {
    const adminExists = await hasAnyAdmin()
    return NextResponse.json({
      setupRequired: !adminExists
    })
  } catch (error) {
    console.error('Setup check error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
