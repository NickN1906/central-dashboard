'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface AuditLog {
  id: number
  action: string
  identityId: string | null
  productIds: string[]
  adminEmail: string | null
  details: Record<string, unknown>
  createdAt: string
}

interface WebhookLog {
  id: number
  eventId: string
  eventType: string
  status: string
  errorMessage: string | null
  processedAt: string
}

export default function LogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    try {
      const token = localStorage.getItem('admin_token')
      const [auditRes, webhookRes] = await Promise.all([
        fetch('/api/v1/admin/logs?type=audit', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/v1/admin/logs?type=webhook', { headers: { Authorization: `Bearer ${token}` } })
      ])

      const auditData = await auditRes.json()
      const webhookData = await webhookRes.json()

      setAuditLogs(auditData.logs || [])
      setWebhookLogs(webhookData.logs || [])
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Logs</h2>
        <p className="text-gray-600">View audit and webhook logs</p>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="webhook">Webhook Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-4">
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <Card key={log.id}>
                <CardContent className="py-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{log.action}</Badge>
                        {log.adminEmail && (
                          <span className="text-sm text-gray-500">by {log.adminEmail}</span>
                        )}
                      </div>
                      {log.productIds.length > 0 && (
                        <p className="text-sm text-gray-600 mt-1">
                          Products: {log.productIds.join(', ')}
                        </p>
                      )}
                      {log.identityId && (
                        <p className="text-xs text-gray-500 mt-1">
                          Identity: {log.identityId}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {auditLogs.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No audit logs yet
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="webhook" className="mt-4">
          <div className="space-y-3">
            {webhookLogs.map((log) => (
              <Card key={log.id}>
                <CardContent className="py-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            log.status === 'success'
                              ? 'default'
                              : log.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {log.status}
                        </Badge>
                        <span className="text-sm font-medium">{log.eventType}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Event: {log.eventId}
                      </p>
                      {log.errorMessage && (
                        <p className="text-sm text-red-600 mt-1">{log.errorMessage}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(log.processedAt).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {webhookLogs.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No webhook logs yet
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
