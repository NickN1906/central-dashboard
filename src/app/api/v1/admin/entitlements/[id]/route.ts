import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'
import { revokeEntitlementById } from '@/lib/services/entitlements.service'

/**
 * DELETE /api/v1/admin/entitlements/:id
 *
 * Revoke a specific entitlement by ID
 * This allows admin to revoke individual entitlements without affecting others
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
  const entitlementId = parseInt(id, 10)

  if (isNaN(entitlementId)) {
    return NextResponse.json(
      { error: 'Invalid entitlement ID' },
      { status: 400 }
    )
  }

  try {
    // Get reason from query params or body
    let reason = request.nextUrl.searchParams.get('reason')

    // Try to get reason from body if not in query params
    if (!reason) {
      try {
        const body = await request.json()
        reason = body.reason
      } catch {
        // No body or invalid JSON - that's fine
      }
    }

    const result = await revokeEntitlementById({
      entitlementId,
      reason: reason || 'Revoked by admin',
      adminEmail: authResult.admin.email
    })

    return NextResponse.json({
      success: true,
      message: 'Entitlement revoked successfully',
      remainingActiveEntitlements: result.remainingActive
    })
  } catch (error) {
    console.error('Error revoking entitlement:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: message === 'Entitlement not found' ? 404 : 500 }
    )
  }
}
