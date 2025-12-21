import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyAdminAuth } from '@/lib/middleware/admin-auth'

/**
 * GET /api/v1/admin/logs
 *
 * Get audit logs and webhook logs
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const searchParams = request.nextUrl.searchParams
  const type = searchParams.get('type') || 'audit' // 'audit' or 'webhook'
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const action = searchParams.get('action')
  const status = searchParams.get('status')

  try {
    if (type === 'webhook') {
      const where: Record<string, unknown> = {}
      if (status) where.status = status

      const [logs, total] = await Promise.all([
        prisma.webhookLog.findMany({
          where,
          orderBy: { processedAt: 'desc' },
          take: limit,
          skip: offset
        }),
        prisma.webhookLog.count({ where })
      ])

      return NextResponse.json({ logs, total, limit, offset })
    }

    // Audit logs
    const where: Record<string, unknown> = {}
    if (action) where.action = action

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.auditLog.count({ where })
    ])

    return NextResponse.json({ logs, total, limit, offset })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
