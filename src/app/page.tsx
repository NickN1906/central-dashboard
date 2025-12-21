import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Entitlements Service</CardTitle>
          <CardDescription>
            Central access management for your product ecosystem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-gray-600">
            <p>This service manages product access across:</p>
            <ul className="mt-2 space-y-1">
              <li>Rezume Pro</li>
              <li>AI Coach Pro</li>
              <li>Career Pathways</li>
            </ul>
          </div>

          <div className="pt-4 space-y-2">
            <Link href="/admin" className="block">
              <Button className="w-full">Admin Dashboard</Button>
            </Link>
          </div>

          <div className="pt-4 border-t text-center text-xs text-gray-500">
            <p>API Endpoints:</p>
            <ul className="mt-1 space-y-1">
              <li><code className="bg-gray-100 px-1 rounded">GET /api/v1/check</code></li>
              <li><code className="bg-gray-100 px-1 rounded">GET /api/v1/entitlements</code></li>
              <li><code className="bg-gray-100 px-1 rounded">POST /api/v1/webhooks/stripe</code></li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
