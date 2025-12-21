// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Check access response
export interface CheckAccessResponse {
  hasAccess: boolean
  product: string
  source?: string
  bundleName?: string
  expires?: string | null
  grantedAt?: string
}

// Entitlements response
export interface EntitlementsResponse {
  email: string
  products: {
    id: string
    name: string
    hasAccess: boolean
    source?: string
    expires?: string | null
  }[]
}

// Claim token response
export interface ClaimTokenResponse {
  valid: boolean
  error?: string
  bundle?: {
    name: string
    products: {
      id: string
      name: string
      requiresEmail: boolean
      formSchema: FormField[] | null
    }[]
  }
  purchaseEmail?: string
  expiresAt?: string
}

// Form field schema for products like Career Pathways
export interface FormField {
  name: string
  type: 'text' | 'email' | 'url' | 'select' | 'textarea' | 'number'
  label: string
  required: boolean
  placeholder?: string
  options?: string[] // For select type
}

// Claim activation request
export interface ClaimActivationRequest {
  products: {
    [productId: string]: {
      email: string
      formData?: Record<string, unknown>
    }
  }
}

// Admin types
export interface AdminUser {
  id: number
  email: string
  name: string | null
}

export interface ProductWithStats {
  id: string
  name: string
  description: string | null
  appUrl: string | null
  requiresOngoingAccess: boolean
  isActive: boolean
  displayOrder: number
  _count: {
    entitlements: number
  }
}

export interface BundleWithStats {
  id: number
  name: string
  slug: string
  description: string | null
  stripePriceId: string
  productIds: string[]
  durationType: string
  durationValue: number | null
  isActive: boolean
  _count: {
    entitlements: number
    claimTokens: number
  }
}

export interface IdentityWithDetails {
  id: string
  primaryEmail: string
  stripeCustomerId: string | null
  createdAt: Date
  emails: {
    email: string
    productId: string
    verified: boolean
  }[]
  entitlements: {
    productId: string
    source: string
    grantedAt: Date
    expiresAt: Date | null
    revokedAt: Date | null
    bundle?: {
      name: string
    } | null
  }[]
}

// Analytics types
export interface AnalyticsOverview {
  totalIdentities: number
  totalEntitlements: number
  byProduct: Record<string, number>
  bySource: Record<string, number>
  recentGrants: {
    email: string
    productId: string
    source: string
    grantedAt: Date
  }[]
  expiringSoon: {
    email: string
    productId: string
    expiresAt: Date
  }[]
}

// Duration calculation
export type DurationType = 'days' | 'months' | 'years' | 'lifetime'

export function calculateExpiryDate(
  durationType: DurationType,
  durationValue: number | null
): Date | null {
  if (durationType === 'lifetime' || !durationValue) {
    return null
  }

  const now = new Date()

  switch (durationType) {
    case 'days':
      return new Date(now.setDate(now.getDate() + durationValue))
    case 'months':
      return new Date(now.setMonth(now.getMonth() + durationValue))
    case 'years':
      return new Date(now.setFullYear(now.getFullYear() + durationValue))
    default:
      return null
  }
}
