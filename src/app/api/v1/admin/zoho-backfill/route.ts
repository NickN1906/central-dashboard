import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { backfillAllContacts } from '@/lib/services/zoho.service'

const ADMIN_API_KEY = process.env.CENTRAL_DASHBOARD_API_KEY

/**
 * POST /api/v1/admin/zoho-backfill
 *
 * One-time (idempotent) backfill: push every existing identity into Zoho.
 * Runs in the background so it doesn't hit the HTTP timeout; watch the logs
 * for `[Zoho] backfill complete`. Admin-key protected.
 *
 * Optional body: { "limit": number } to process only the first N (for testing).
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-admin-api-key')
  if (!ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let limit: number | undefined
  try {
    const body = await request.json()
    if (body && typeof body.limit === 'number') limit = body.limit
  } catch {
    /* no body */
  }

  const total = await prisma.identity.count()

  // Fire-and-forget: Central runs as a persistent Node server, so this completes
  // after the response is returned.
  backfillAllContacts(limit)
    .then((r) => console.log('[Zoho] backfill complete', r))
    .catch((e) => console.error('[Zoho] backfill error', e))

  return NextResponse.json({ started: true, total, limit: limit ?? null })
}
