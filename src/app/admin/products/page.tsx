'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus, Loader2 } from 'lucide-react'

interface Product {
  id: string
  name: string
  description: string | null
  appUrl: string | null
  requiresOngoingAccess: boolean
  zapierWebhookUrl: string | null
  formSchema: unknown
  isActive: boolean
  displayOrder: number
  _count: { entitlements: number }
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    appUrl: '',
    requiresOngoingAccess: true,
    zapierWebhookUrl: '',
    displayOrder: 0,
    isActive: true
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/v1/admin/products', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormData({
      id: '',
      name: '',
      description: '',
      appUrl: '',
      requiresOngoingAccess: true,
      zapierWebhookUrl: '',
      displayOrder: 0,
      isActive: true
    })
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product)
    setFormData({
      id: product.id,
      name: product.name,
      description: product.description || '',
      appUrl: product.appUrl || '',
      requiresOngoingAccess: product.requiresOngoingAccess,
      zapierWebhookUrl: product.zapierWebhookUrl || '',
      displayOrder: product.displayOrder,
      isActive: product.isActive
    })
    setEditDialogOpen(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    setSaving('new')
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/v1/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (data.product) {
        toast.success('Product created!')
        setCreateDialogOpen(false)
        resetForm()
        fetchProducts()
      } else {
        toast.error(data.error || 'Failed to create product')
      }
    } catch (error) {
      console.error('Error creating product:', error)
      toast.error('Failed to create product')
    } finally {
      setSaving(null)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()

    if (!editingProduct) return

    setSaving(editingProduct.id)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/v1/admin/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          appUrl: formData.appUrl || null,
          requiresOngoingAccess: formData.requiresOngoingAccess,
          zapierWebhookUrl: formData.zapierWebhookUrl || null,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive
        })
      })

      const data = await res.json()

      if (data.product) {
        toast.success('Product updated! Changes may take up to 2 minutes to reflect across all apps.')
        setEditDialogOpen(false)
        setEditingProduct(null)
        resetForm()
        fetchProducts()
      } else {
        toast.error(data.error || 'Failed to update product')
      }
    } catch (error) {
      console.error('Error updating product:', error)
      toast.error('Failed to update product')
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(productId: string) {
    setSaving(productId)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/v1/admin/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await res.json()

      if (data.product) {
        toast.success('Product deactivated!')
        fetchProducts()
      } else {
        toast.error(data.error || 'Failed to delete product')
      }
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product')
    } finally {
      setSaving(null)
    }
  }

  async function toggleProductActive(product: Product) {
    setSaving(product.id)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/v1/admin/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !product.isActive })
      })

      const data = await res.json()

      if (data.product) {
        toast.success(`Product ${data.product.isActive ? 'activated' : 'deactivated'}!`)
        fetchProducts()
      } else {
        toast.error(data.error || 'Failed to update product')
      }
    } catch (error) {
      console.error('Error toggling product:', error)
      toast.error('Failed to update product')
    } finally {
      setSaving(null)
    }
  }

  const ProductForm = ({ onSubmit, submitLabel, showIdField = false }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string; showIdField?: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {showIdField && (
        <div className="space-y-2">
          <Label htmlFor="id">Product ID *</Label>
          <Input
            id="id"
            placeholder="e.g., rezume, coach, career"
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            required
          />
          <p className="text-xs text-gray-500">Unique identifier, lowercase, no spaces</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Display Name *</Label>
        <Input
          id="name"
          placeholder="e.g., Rezume Pro"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Brief description..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="appUrl">App URL</Label>
        <Input
          id="appUrl"
          type="url"
          placeholder="https://yourapp.com"
          value={formData.appUrl}
          onChange={(e) => setFormData({ ...formData, appUrl: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="zapierWebhookUrl">Zapier Webhook URL (optional)</Label>
        <Input
          id="zapierWebhookUrl"
          type="url"
          placeholder="https://hooks.zapier.com/..."
          value={formData.zapierWebhookUrl}
          onChange={(e) => setFormData({ ...formData, zapierWebhookUrl: e.target.value })}
        />
        <p className="text-xs text-gray-500">For products like Career Pathways</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayOrder">Display Order</Label>
        <Input
          id="displayOrder"
          type="number"
          min="0"
          value={formData.displayOrder}
          onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
        />
        <p className="text-xs text-gray-500">Lower numbers appear first</p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="requiresOngoingAccess"
          checked={formData.requiresOngoingAccess}
          onCheckedChange={(checked) =>
            setFormData({ ...formData, requiresOngoingAccess: !!checked })
          }
        />
        <Label htmlFor="requiresOngoingAccess">Requires ongoing access</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) =>
            setFormData({ ...formData, isActive: !!checked })
          }
        />
        <Label htmlFor="isActive">Active (visible in bundles)</Label>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
        Note: Changes may take up to 2 minutes to reflect across all connected apps.
      </div>

      <DialogFooter>
        <Button type="submit" disabled={saving !== null}>
          {saving !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Products</h2>
          <p className="text-gray-600">Manage your product ecosystem</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <ProductForm onSubmit={handleCreate} submitLabel="Create Product" showIdField />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
        Note: Changes may take up to 2 minutes to reflect across all connected apps.
      </div>

      <div className="grid gap-4">
        {products.map((product) => (
          <Card key={product.id} className={!product.isActive ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <p className="text-sm text-gray-500">{product.id}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge
                    variant={product.isActive ? 'default' : 'secondary'}
                    className="cursor-pointer"
                    onClick={() => toggleProductActive(product)}
                  >
                    {saving === product.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      product.isActive ? 'Active' : 'Inactive'
                    )}
                  </Badge>
                  <Badge variant="outline">{product._count.entitlements} users</Badge>

                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate Product?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will deactivate the product &quot;{product.name}&quot;. Users who already have this product will keep their access. You can reactivate it later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(product.id)}>
                          Deactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600 space-y-1">
                {product.description && <p>{product.description}</p>}
                {product.appUrl && (
                  <p>URL: <a href={product.appUrl} className="text-blue-600 hover:underline" target="_blank">{product.appUrl}</a></p>
                )}
                {product.zapierWebhookUrl && (
                  <p className="text-green-600">Zapier webhook configured</p>
                )}
                <p className="text-gray-400">Display order: {product.displayOrder}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        {products.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No products yet. Add your first product to get started.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product: {editingProduct?.id}</DialogTitle>
          </DialogHeader>
          <ProductForm onSubmit={handleUpdate} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>
    </div>
  )
}
