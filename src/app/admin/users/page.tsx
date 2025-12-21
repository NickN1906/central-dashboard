'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Entitlement {
  productId: string
  source: string
  grantedAt: string
  expiresAt: string | null
  product: { name: string }
  bundle: { name: string } | null
}

interface User {
  id: string
  primaryEmail: string
  createdAt: string
  emails: { email: string; productId: string }[]
  entitlements: Entitlement[]
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers(searchQuery = '') {
    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const url = searchQuery
        ? `/api/v1/admin/users?search=${encodeURIComponent(searchQuery)}`
        : '/api/v1/admin/users'

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setUsers(data.users || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchUsers(search)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <p className="text-gray-600">View and manage user entitlements</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit">Search</Button>
        {search && (
          <Button type="button" variant="outline" onClick={() => { setSearch(''); fetchUsers(); }}>
            Clear
          </Button>
        )}
      </form>

      {loading ? (
        <div className="animate-pulse">Loading...</div>
      ) : (
        <>
          <p className="text-sm text-gray-600">{total} users found</p>

          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{user.primaryEmail}</CardTitle>
                      <p className="text-sm text-gray-500">
                        Joined {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {user.entitlements.length} product{user.entitlements.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {user.entitlements.length > 0 ? (
                    <div className="space-y-2">
                      {user.entitlements.map((ent, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium text-sm">{ent.product.name}</p>
                            <p className="text-xs text-gray-500">
                              {ent.source}{ent.bundle ? ` (${ent.bundle.name})` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="default" className="text-xs">Active</Badge>
                            {ent.expiresAt && (
                              <p className="text-xs text-gray-500 mt-1">
                                Expires {new Date(ent.expiresAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No active entitlements</p>
                  )}

                  {user.emails.length > 1 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-gray-500 mb-1">Linked emails:</p>
                      <div className="flex flex-wrap gap-1">
                        {user.emails.map((e, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {e.email} ({e.productId})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {users.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  {search ? 'No users found matching your search.' : 'No users yet.'}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
