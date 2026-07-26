import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getOrCreateIdentity, linkEmailToIdentity } from '@/lib/services/entitlements.service'

const ADMIN_API_KEY = process.env.CENTRAL_DASHBOARD_API_KEY

/**
 * POST /api/v1/identities
 *
 * Register/track a user (Identity) in the Central Dashboard even when they have
 * NO paid entitlement. External apps (Rezume, etc.) call this on every signup —
 * free plan included — so Central stays the single source of truth for CRM.
 *
 * Auth: `x-admin-api-key` header must equal CENTRAL_DASHBOARD_API_KEY.
 *
 * Body:
 *   email            string  (required)
 *   productId        string  (required) e.g. 'rezume'
 *   fullName         string  (optional)
 *   marketingConsent boolean (optional)
 *   source           string  (optional) e.g. 'rezume_signup'
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-admin-api-key')

  if (!ADMIN_API_KEY) {
    console.error('[Identities] CENTRAL_DASHBOARD_API_KEY not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    console.warn('[Identities] Invalid or missing API key')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { email, productId, fullName, marketingConsent, source } = body || {}

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Missing required field: email' }, { status: 400 })
    }
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'Missing required field: productId' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Get or create the identity by email
    const identity = await getOrCreateIdentity(normalizedEmail)

    // Enrich with CRM fields — only overwrite when a value is provided, and
    // never clobber an existing signup source.
    const updateData: { fullName?: string; marketingConsent?: boolean; signupSource?: string } = {}
    if (typeof fullName === 'string' && fullName.trim()) updateData.fullName = fullName.trim()
    if (typeof marketingConsent === 'boolean') updateData.marketingConsent = marketingConsent
    if (typeof source === 'string' && source.trim() && !identity.signupSource) {
      updateData.signupSource = source.trim()
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.identity.update({ where: { id: identity.id }, data: updateData })
    }

    // Associate the email with the product so Central knows they're a user of it.
    // Best-effort: skip if the product row doesn't exist (FK would fail).
    let linked = false
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (product) {
      await linkEmailToIdentity(identity.id, normalizedEmail, productId)
      linked = true
    } else {
      console.warn(`[Identities] Product '${productId}' not found — identity created but email not linked`)
    }

    return NextResponse.json({ success: true, identityId: identity.id, linked })
  } catch (error) {
    console.error('[Identities] Error registering identity:', error)
    return NextResponse.json({ error: 'Failed to register identity' }, { status: 500 })
  }
}
