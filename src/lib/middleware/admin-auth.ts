import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, getAdminById } from '@/lib/services/auth.service'
import { AdminUser } from '@/lib/types'

export interface AuthenticatedRequest extends NextRequest {
  admin?: AdminUser
}

/**
 * Verify admin authentication from Authorization header
 */
export async function verifyAdminAuth(
  request: NextRequest
): Promise<{ admin: AdminUser } | { error: string; status: number }> {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.substring(7)
  const payload = verifyToken(token)

  if (!payload) {
    return { error: 'Invalid or expired token', status: 401 }
  }

  const admin = await getAdminById(payload.userId)

  if (!admin) {
    return { error: 'Admin user not found', status: 401 }
  }

  return { admin }
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Higher-order function to wrap admin-protected route handlers
 */
export function withAdminAuth<T>(
  handler: (request: NextRequest, admin: AdminUser, context: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    const authResult = await verifyAdminAuth(request)

    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    return handler(request, authResult.admin, context)
  }
}
