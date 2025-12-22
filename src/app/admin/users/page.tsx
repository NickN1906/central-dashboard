'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Plus, Trash2, Clock, Loader2 } from 'lucide-react'

interface Entitlement {
  id: number
  productId: string
  source: string
  sourceApp: string | null
  grantedAt: string
  expiresAt: string | null
  revokedAt: string | null
  product: { name: string }
  bundle: { name: string } | null
}

interface Product {
  id: string
  name: string
  isActive: boolean
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
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)

  // Grant Access Dialog
  const [grantDialogOpen, setGrantDialogOpen] = useState(false)
  const [grantingUser, setGrantingUser] = useState<User | null>(null)
  const [grantForm, setGrantForm] = useState({
    productIds: [] as string[],
    durationType: 'lifetime',
    durationValue: ''
  })

  // Edit Expiry Dialog
  const [editExpiryOpen, setEditExpiryOpen] = useState(false)
  const [editingEntitlement, setEditingEntitlement] = useState<{ user: User; entitlement: Entitlement } | null>(null)
  const [newExpiryDate, setNewExpiryDate] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const [usersRes, productsRes] = await Promise.all([
        fetch('/api/v1/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/v1/admin/products', { headers: { Authorization: `Bearer ${token}` } })
      ])

      const usersData = await usersRes.json()
      const productsData = await productsRes.json()

      setUsers(usersData.users || [])
      setTotal(usersData.total || 0)
      setProducts(productsData.products || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

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

  function openGrantDialog(user: User) {
    setGrantingUser(user)
    setGrantForm({
      productIds: [],
      durationType: 'lifetime',
      durationValue: ''
    })
    setGrantDialogOpen(true)
  }

  function toggleGrantProduct(productId: string) {
    setGrantForm(prev => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter(id => id !== productId)
        : [...prev.productIds, productId]
    }))
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault()

    if (!grantingUser || grantForm.productIds.length === 0) {
      toast.error('Please select at least one product')
      return
    }

    setSaving(grantingUser.id)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/v1/admin/users/${grantingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productIds: grantForm.productIds,
          durationType: grantForm.durationType,
          durationValue: grantForm.durationValue ? parseInt(grantForm.durationValue) : null,
          source: 'manual'
        })
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Access granted! Changes may take up to 2 minutes to reflect across all apps.')
        setGrantDialogOpen(false)
        setGrantingUser(null)
        fetchUsers(search)
      } else {
        toast.error(data.error || 'Failed to grant access')
      }
    } catch (error) {
      console.error('Error granting access:', error)
      toast.error('Failed to grant access')
    } finally {
      setSaving(null)
    }
  }

  async function handleRevokeAccess(user: User, productId: string) {
    setSaving(user.id)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/v1/admin/users/${user.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productIds: [productId],
          reason: 'Revoked by admin'
        })
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Access revoked! Changes may take up to 2 minutes to reflect across all apps.')
        fetchUsers(search)
      } else {
        toast.error(data.error || 'Failed to revoke access')
      }
    } catch (error) {
      console.error('Error revoking access:', error)
      toast.error('Failed to revoke access')
    } finally {
      setSaving(null)
    }
  }

  function openEditExpiry(user: User, entitlement: Entitlement) {
    setEditingEntitlement({ user, entitlement })
    setNewExpiryDate(entitlement.expiresAt ? entitlement.expiresAt.split('T')[0] : '')
    setEditExpiryOpen(true)
  }

  async function handleUpdateExpiry(e: React.FormEvent) {
    e.preventDefault()

    if (!editingEntitlement) return

    setSaving(editingEntitlement.user.id)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/v1/admin/users/${editingEntitlement.user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productIds: [editingEntitlement.entitlement.productId],
          newExpiresAt: newExpiryDate || null
        })
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Expiry updated! Changes may take up to 2 minutes to reflect across all apps.')
        setEditExpiryOpen(false)
        setEditingEntitlement(null)
        fetchUsers(search)
      } else {
        toast.error(data.error || 'Failed to update expiry')
      }
    } catch (error) {
      console.error('Error updating expiry:', error)
      toast.error('Failed to update expiry')
    } finally {
      setSaving(null)
    }
  }

  // Get products user doesn't have access to
  function getAvailableProducts(user: User) {
    const activeEntitlementIds = user.entitlements
      .filter(e => !e.revokedAt)
      .map(e => e.productId)
    return products.filter(p => p.isActive && !activeEntitlementIds.includes(p.id))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="text-gray-600">View and manage user entitlements</p>
        </div>
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

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
        Note: Changes may take up to 2 minutes to reflect across all connected apps.
      </div>

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
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline">
                        {user.entitlements.filter(e => !e.revokedAt).length} active
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => openGrantDialog(user)}
                        disabled={getAvailableProducts(user).length === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Grant Access
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {user.entitlements.filter(e => !e.revokedAt).length > 0 ? (
                    <div className="space-y-2">
                      {user.entitlements.filter(e => !e.revokedAt).map((ent) => (
                        <div key={ent.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{ent.product.name}</p>
                            <p className="text-xs text-gray-500">
                              {ent.source}{ent.sourceApp ? ` (${ent.sourceApp})` : ''}{ent.bundle ? ` - ${ent.bundle.name}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right mr-2">
                              <Badge variant="default" className="text-xs">Active</Badge>
                              {ent.expiresAt ? (
                                <p className="text-xs text-gray-500 mt-1">
                                  Expires {new Date(ent.expiresAt).toLocaleDateString()}
                                </p>
                              ) : (
                                <p className="text-xs text-green-600 mt-1">Lifetime</p>
                              )}
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditExpiry(user, ent)}
                              title="Edit expiry date"
                            >
                              <Clock className="h-4 w-4" />
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700"
                                  title="Revoke access"
                                >
                                  {saving === user.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke Access?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will revoke {user.primaryEmail}&apos;s access to {ent.product.name}.
                                    They will immediately lose access to this product.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleRevokeAccess(user, ent.productId)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Revoke Access
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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

      {/* Grant Access Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Access to {grantingUser?.primaryEmail}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGrantAccess} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Products *</Label>
              <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                {grantingUser && getAvailableProducts(grantingUser).map((product) => (
                  <div key={product.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`grant-${product.id}`}
                      checked={grantForm.productIds.includes(product.id)}
                      onCheckedChange={() => toggleGrantProduct(product.id)}
                    />
                    <Label htmlFor={`grant-${product.id}`}>{product.name}</Label>
                  </div>
                ))}
                {grantingUser && getAvailableProducts(grantingUser).length === 0 && (
                  <p className="text-sm text-gray-500">User already has access to all products.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration Type</Label>
                <Select
                  value={grantForm.durationType}
                  onValueChange={(value) => setGrantForm({ ...grantForm, durationType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lifetime">Lifetime</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="years">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {grantForm.durationType !== 'lifetime' && (
                <div className="space-y-2">
                  <Label htmlFor="durationValue">Duration Value</Label>
                  <Input
                    id="durationValue"
                    type="number"
                    min="1"
                    placeholder="e.g., 12"
                    value={grantForm.durationValue}
                    onChange={(e) => setGrantForm({ ...grantForm, durationValue: e.target.value })}
                    required
                  />
                </div>
              )}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
              Note: Changes may take up to 2 minutes to reflect across all connected apps.
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGrantDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving !== null}>
                {saving !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Grant Access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Expiry Dialog */}
      <Dialog open={editExpiryOpen} onOpenChange={setEditExpiryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Expiry Date</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateExpiry} className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                {editingEntitlement?.entitlement.product.name} for {editingEntitlement?.user.primaryEmail}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date</Label>
              <Input
                id="expiryDate"
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
              />
              <p className="text-xs text-gray-500">Leave empty for lifetime access</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
              Note: Changes may take up to 2 minutes to reflect across all connected apps.
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditExpiryOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving !== null}>
                {saving !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
