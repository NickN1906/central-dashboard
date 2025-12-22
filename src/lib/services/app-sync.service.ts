/**
 * App Sync Service
 *
 * Syncs subscription status to all connected apps (Rezume, AI Coach)
 * when access is granted or revoked in Central Dashboard.
 *
 * This ensures Central Dashboard is the single source of truth
 * for all subscription states across the platform.
 */

// App configuration - URLs and product IDs
const APP_CONFIG: Record<
  string,
  { name: string; baseUrl: string; productId: string }
> = {
  rezume: {
    name: 'Rezume',
    baseUrl:
      process.env.REZUME_API_URL ||
      'https://resume-builder-canada-8cba721a29e8.herokuapp.com',
    productId: 'rezume',
  },
  aicoach: {
    name: 'AI Interview Coach',
    baseUrl:
      process.env.AICOACH_API_URL ||
      'https://your-ai-interview-coach-1a43e5c7a178.herokuapp.com',
    productId: 'aicoach',
  },
}

const ADMIN_API_KEY = process.env.CENTRAL_DASHBOARD_API_KEY

interface SyncResult {
  app: string
  success: boolean
  error?: string
  response?: unknown
}

interface SyncOptions {
  email: string
  tier: 'free' | 'pro'
  source: 'bundle' | 'direct' | 'revoked'
  reason?: string
}

/**
 * Sync subscription status to a single app
 */
async function syncToApp(
  appKey: string,
  options: SyncOptions
): Promise<SyncResult> {
  const config = APP_CONFIG[appKey]

  if (!config) {
    return { app: appKey, success: false, error: `Unknown app: ${appKey}` }
  }

  if (!ADMIN_API_KEY) {
    console.error(
      `[AppSync] CENTRAL_DASHBOARD_API_KEY not configured - cannot sync to ${config.name}`
    )
    return { app: config.name, success: false, error: 'API key not configured' }
  }

  try {
    const response = await fetch(
      `${config.baseUrl}/api/admin/sync-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Api-Key': ADMIN_API_KEY,
        },
        body: JSON.stringify({
          email: options.email,
          tier: options.tier,
          source: options.source,
          reason: options.reason,
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `[AppSync] Failed to sync to ${config.name}: ${response.status} - ${errorText}`
      )
      return {
        app: config.name,
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      }
    }

    const data = await response.json()
    console.log(`[AppSync] Successfully synced to ${config.name}:`, data)

    return { app: config.name, success: true, response: data }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error(`[AppSync] Error syncing to ${config.name}:`, errorMessage)
    return { app: config.name, success: false, error: errorMessage }
  }
}

/**
 * Sync subscription status to multiple apps based on product IDs
 */
export async function syncToApps(
  productIds: string[],
  options: Omit<SyncOptions, 'source'> & { source?: SyncOptions['source'] }
): Promise<SyncResult[]> {
  const results: SyncResult[] = []

  // Determine which apps to sync based on product IDs
  const appsToSync = new Set<string>()

  for (const productId of productIds) {
    const appKey = productId.toLowerCase()
    if (APP_CONFIG[appKey]) {
      appsToSync.add(appKey)
    }
  }

  if (appsToSync.size === 0) {
    console.log(
      `[AppSync] No matching apps found for products: ${productIds.join(', ')}`
    )
    return results
  }

  console.log(
    `[AppSync] Syncing ${options.tier} access for ${options.email} to: ${Array.from(appsToSync).join(', ')}`
  )

  // Sync to all apps in parallel
  const syncPromises = Array.from(appsToSync).map((appKey) =>
    syncToApp(appKey, {
      ...options,
      source: options.source || 'bundle',
    } as SyncOptions)
  )

  const syncResults = await Promise.allSettled(syncPromises)

  for (const result of syncResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      results.push({
        app: 'unknown',
        success: false,
        error: result.reason?.message || 'Promise rejected',
      })
    }
  }

  // Log summary
  const successCount = results.filter((r) => r.success).length
  const failCount = results.length - successCount
  console.log(
    `[AppSync] Sync complete: ${successCount} succeeded, ${failCount} failed`
  )

  return results
}

/**
 * Grant access and sync to apps
 */
export async function grantAccessAndSync(
  email: string,
  productIds: string[],
  reason?: string
): Promise<SyncResult[]> {
  return syncToApps(productIds, {
    email,
    tier: 'pro',
    source: 'bundle',
    reason: reason || 'Bundle access granted via Central Dashboard',
  })
}

/**
 * Revoke access and sync to apps
 */
export async function revokeAccessAndSync(
  email: string,
  productIds: string[],
  reason?: string
): Promise<SyncResult[]> {
  return syncToApps(productIds, {
    email,
    tier: 'free',
    source: 'revoked',
    reason: reason || 'Access revoked via Central Dashboard',
  })
}

/**
 * Clear caches on all apps for a user
 */
export async function clearCachesOnApps(
  email: string,
  productIds: string[]
): Promise<SyncResult[]> {
  const results: SyncResult[] = []

  const appsToSync = new Set<string>()
  for (const productId of productIds) {
    const appKey = productId.toLowerCase()
    if (APP_CONFIG[appKey]) {
      appsToSync.add(appKey)
    }
  }

  if (!ADMIN_API_KEY) {
    console.error('[AppSync] CENTRAL_DASHBOARD_API_KEY not configured')
    return results
  }

  for (const appKey of appsToSync) {
    const config = APP_CONFIG[appKey]
    try {
      const response = await fetch(`${config.baseUrl}/api/admin/clear-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Api-Key': ADMIN_API_KEY,
        },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        results.push({ app: config.name, success: true })
      } else {
        results.push({
          app: config.name,
          success: false,
          error: `HTTP ${response.status}`,
        })
      }
    } catch (error) {
      results.push({
        app: config.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}
