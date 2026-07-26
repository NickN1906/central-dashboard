import prisma from '@/lib/db'

/**
 * Zoho CRM sync (Central Dashboard -> Zoho Contacts).
 *
 * Central is the single source of truth for every user (free + paid + bundle,
 * across all apps). This pushes each identity into Zoho Contacts, classifying
 * HOW they arrived (direct-free / direct-paid / bundle) into their existing
 * fields — enriching, never clobbering foreign fields.
 */

const ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zohocloud.ca'
const API_URL = process.env.ZOHO_API_URL || 'https://www.zohoapis.ca'
const MODULE = process.env.ZOHO_CRM_MODULE || 'Contacts'

// Product id -> display name
const PRODUCT_NAMES: Record<string, string> = {
  rezume: 'Rezume',
  aicoach: 'AI Interview Coach',
  careerpathway: 'Career Pathway',
  'careerpathway ': 'Career Pathway',
  '123jobs-resume': '123Jobs Resume',
  '123jobs-interview': '123Jobs Interview',
}

// App / signupSource -> label used in Lead_Source
const APP_LABEL: Record<string, string> = {
  rezume: 'Rezume',
  rezume_signup: 'Rezume',
  aicoach: 'AI Coach',
  aicoach_signup: 'AI Coach',
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    })
    const res = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = await res.json()
    if (!data.access_token) {
      console.error('[Zoho] token refresh failed', data)
      return null
    }
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
    return cachedToken.token
  } catch (e) {
    console.error('[Zoho] token refresh error', e)
    return null
  }
}

interface ClassifiedSource {
  membershipType: 'Free' | 'Paid' | 'Bundle'
  leadSource: string | null
  aiProducts: string
}

interface EntitlementLite {
  source: string
  sourceApp: string | null
  productId: string
  revokedAt: Date | null
  expiresAt: Date | null
}

function classify(
  signupSource: string | null,
  emailProductIds: string[],
  entitlements: EntitlementLite[]
): ClassifiedSource {
  const now = new Date()
  const nonRevoked = entitlements.filter((e) => !e.revokedAt)
  const active = nonRevoked.filter((e) => !e.expiresAt || e.expiresAt > now)

  // AI_Products: everything they've been linked to or (ever) entitled to.
  const products = new Set<string>()
  emailProductIds.forEach((p) => PRODUCT_NAMES[p] && products.add(PRODUCT_NAMES[p]))
  nonRevoked.forEach((e) => PRODUCT_NAMES[e.productId] && products.add(PRODUCT_NAMES[e.productId]))
  if (signupSource === 'rezume_signup') products.add('Rezume')
  if (signupSource === 'aicoach_signup') products.add('AI Interview Coach')

  // Membership_Type = CURRENT tier, from active entitlements.
  let membershipType: ClassifiedSource['membershipType'] = 'Free'
  if (active.some((e) => e.source === 'bundle')) membershipType = 'Bundle'
  else if (active.some((e) => ['direct', 'manual', 'promo'].includes(e.source))) membershipType = 'Paid'

  // Lead_Source = ACQUISITION channel (how they came in): bundle > direct > free.
  // Manual/promo are admin grants, not acquisition channels, so they don't set it.
  let leadSource: string | null = null
  if (nonRevoked.some((e) => e.source === 'bundle')) {
    leadSource = 'Bundle'
  } else {
    const direct = nonRevoked.find((e) => e.source === 'direct')
    if (direct) {
      leadSource = `${APP_LABEL[direct.sourceApp || ''] || 'Rezume'} - Paid`
    } else if (APP_LABEL[signupSource || '']) {
      leadSource = `${APP_LABEL[signupSource || '']} - Free`
    }
  }

  return { membershipType, leadSource, aiProducts: Array.from(products).join(', ') }
}

async function zohoRequest(path: string, token: string, init?: RequestInit) {
  return fetch(`${API_URL}/crm/v6/${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}

/**
 * Sync a single identity (by email) into Zoho Contacts.
 *
 * - OUR fields (AI_Products, Membership_Type, Lead_Source) are always set to the
 *   current computed value.
 * - FOREIGN fields (First/Last name) are enrich-only: filled only when blank,
 *   never overwritten.
 */
export async function syncContactToZoho(email: string): Promise<void> {
  try {
    const token = await getAccessToken()
    if (!token) return

    const normalized = email.toLowerCase().trim()
    // Never push test/placeholder addresses to the CRM.
    if (normalized.endsWith('@example.com') || normalized.includes('@test.') || normalized.endsWith('.test')) {
      return
    }
    const identity = await prisma.identity.findFirst({
      where: { primaryEmail: normalized },
      include: { emails: true, entitlements: true },
    })
    if (!identity) return

    const { membershipType, leadSource, aiProducts } = classify(
      (identity as { signupSource?: string | null }).signupSource ?? null,
      identity.emails.map((e) => e.productId),
      identity.entitlements.map((e) => ({
        source: e.source,
        sourceApp: e.sourceApp,
        productId: e.productId,
        revokedAt: e.revokedAt,
        expiresAt: e.expiresAt,
      }))
    )

    const nameParts = (identity.fullName || '').trim().split(/\s+/).filter(Boolean)
    const firstName = nameParts.length > 1 ? nameParts[0] : ''
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0] || ''

    // Look up an existing contact by email
    const searchRes = await zohoRequest(`${MODULE}/search?email=${encodeURIComponent(normalized)}`, token)
    let existing: Record<string, unknown> | null = null
    if (searchRes.status === 200) {
      const sd = await searchRes.json()
      existing = sd?.data?.[0] || null
    }

    if (existing) {
      // Enrich: our fields always; foreign fields only if blank.
      const fields: Record<string, unknown> = {}
      if (aiProducts) fields.AI_Products = aiProducts
      fields.Membership_Type = membershipType
      if (leadSource) fields.Lead_Source = leadSource
      if (firstName && !existing.First_Name) fields.First_Name = firstName
      if (lastName && !existing.Last_Name) fields.Last_Name = lastName

      await zohoRequest(`${MODULE}/${existing.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ data: [fields], trigger: [] }),
      })
    } else {
      const data: Record<string, unknown> = {
        Email: normalized,
        Last_Name: lastName || firstName || normalized.split('@')[0],
        Membership_Type: membershipType,
      }
      if (firstName) data.First_Name = firstName
      if (aiProducts) data.AI_Products = aiProducts
      if (leadSource) data.Lead_Source = leadSource

      await zohoRequest(MODULE, token, {
        method: 'POST',
        body: JSON.stringify({ data: [data], trigger: [] }),
      })
    }
  } catch (e) {
    console.error('[Zoho] syncContactToZoho failed', e)
  }
}

/** Fire-and-forget wrapper — never blocks or throws into callers. */
export function syncContactToZohoAsync(email: string): void {
  syncContactToZoho(email).catch((e) => console.error('[Zoho] async sync error', e))
}

/**
 * Backfill: push every identity into Zoho. Returns counts. Intended to be run
 * once from an admin endpoint. Processes sequentially to respect Zoho rate limits.
 */
export async function backfillAllContacts(limit?: number): Promise<{ processed: number; total: number }> {
  const identities = await prisma.identity.findMany({
    select: { primaryEmail: true },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  })
  let processed = 0
  for (const id of identities) {
    await syncContactToZoho(id.primaryEmail)
    processed++
    // gentle pacing for Zoho API limits
    await new Promise((r) => setTimeout(r, 250))
  }
  return { processed, total: identities.length }
}
