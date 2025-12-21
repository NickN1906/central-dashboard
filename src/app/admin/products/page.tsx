'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    appUrl: '',
    requiresOngoingAccess: true,
    zapierWebhookUrl: '',
    displayOrder: 0
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

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
        setDialogOpen(false)
        setFormData({
          id: '',
          name: '',
          description: '',
          appUrl: '',
          requiresOngoingAccess: true,
          zapierWebhookUrl: '',
          displayOrder: 0
        })
        fetchProducts()
      } else {
        toast.error(data.error || 'Failed to create product')
      }
    } catch (error) {
      console.error('Error creating product:', error)
      toast.error('Failed to create product')
    }
  }

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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Product</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="id">Product ID</Label>
                <Input
                  id="id"
                  placeholder="e.g., rezume, coach, career"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500">Unique identifier, lowercase, no spaces</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
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

              <Button type="submit" className="w-full">Create Product</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <p className="text-sm text-gray-500">{product.id}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={product.isActive ? 'default' : 'secondary'}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline">{product._count.entitlements} users</Badge>
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
    </div>
  )
}
