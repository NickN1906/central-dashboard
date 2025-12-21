'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Analytics {
  overview: {
    totalIdentities: number
    totalEntitlements: number
    activeEntitlements: number
  }
  byProduct: Record<string, number>
  bySource: Record<string, number>
  recentGrants: {
    email: string
    product: string
    source: string
    grantedAt: string
  }[]
  expiringSoon: {
    email: string
    product: string
    expiresAt: string
  }[]
  bundleClaims: {
    bundleId: number
    bundleName: string
    claimed: number
  }[]
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/v1/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-600">Overview of your entitlements system</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Users</CardDescription>
            <CardTitle className="text-3xl">
              {analytics?.overview.totalIdentities || 0}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Entitlements</CardDescription>
            <CardTitle className="text-3xl">
              {analytics?.overview.activeEntitlements || 0}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bundle Claims</CardDescription>
            <CardTitle className="text-3xl">
              {analytics?.bundleClaims.reduce((acc, b) => acc + b.claimed, 0) || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* By Product & Source */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Users by Product</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics?.byProduct && Object.entries(analytics.byProduct).map(([product, count]) => (
                <div key={product} className="flex justify-between items-center">
                  <span className="text-sm font-medium">{product}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {(!analytics?.byProduct || Object.keys(analytics.byProduct).length === 0) && (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics?.bySource && Object.entries(analytics.bySource).map(([source, count]) => (
                <div key={source} className="flex justify-between items-center">
                  <span className="text-sm font-medium capitalize">{source}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {(!analytics?.bySource || Object.keys(analytics.bySource).length === 0) && (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Expiring */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Grants</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics?.recentGrants.map((grant, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-medium">{grant.email}</p>
                    <p className="text-gray-500">{grant.product}</p>
                  </div>
                  <Badge variant="outline">{grant.source}</Badge>
                </div>
              ))}
              {(!analytics?.recentGrants || analytics.recentGrants.length === 0) && (
                <p className="text-sm text-gray-500">No recent grants</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expiring Soon</CardTitle>
            <CardDescription>Next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics?.expiringSoon.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-medium">{item.email}</p>
                    <p className="text-gray-500">{item.product}</p>
                  </div>
                  <Badge variant="destructive">
                    {new Date(item.expiresAt).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
              {(!analytics?.expiringSoon || analytics.expiringSoon.length === 0) && (
                <p className="text-sm text-gray-500">No expiring entitlements</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
