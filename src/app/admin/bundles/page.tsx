'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Bundle {
  id: number
  name: string
  slug: string
  description: string | null
  stripePriceId: string
  productIds: string[]
  productNames: string[]
  durationType: string
  durationValue: number | null
  isActive: boolean
  _count: { entitlements: number; claimTokens: number }
}

interface Product {
  id: string
  name: string
  isActive: boolean
}

export default function BundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    stripePriceId: '',
    productIds: [] as string[],
    durationType: 'lifetime',
    durationValue: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const token = localStorage.getItem('admin_token')
      const [bundlesRes, productsRes] = await Promise.all([
        fetch('/api/v1/admin/bundles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/v1/admin/products', { headers: { Authorization: `Bearer ${token}` } })
      ])

      const bundlesData = await bundlesRes.json()
      const productsData = await productsRes.json()

      setBundles(bundlesData.bundles || [])
      setProducts(productsData.products || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  function toggleProduct(productId: string) {
    setFormData(prev => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter(id => id !== productId)
        : [...prev.productIds, productId]
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (formData.productIds.length === 0) {
      toast.error('Please select at least one product')
      return
    }

    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/v1/admin/bundles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          durationValue: formData.durationValue ? parseInt(formData.durationValue) : null
        })
      })

      const data = await res.json()

      if (data.bundle) {
        toast.success('Bundle created!')
        setDialogOpen(false)
        setFormData({
          name: '',
          slug: '',
          description: '',
          stripePriceId: '',
          productIds: [],
          durationType: 'lifetime',
          durationValue: ''
        })
        fetchData()
      } else {
        toast.error(data.error || 'Failed to create bundle')
      }
    } catch (error) {
      console.error('Error creating bundle:', error)
      toast.error('Failed to create bundle')
    }
  }

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bundles</h2>
          <p className="text-gray-600">Create and manage product bundles</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Create Bundle</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Bundle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Bundle Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Ultimate Career Bundle"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  placeholder="e.g., ultimate-bundle"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stripePriceId">Stripe Price ID</Label>
                <Input
                  id="stripePriceId"
                  placeholder="price_xxxxx"
                  value={formData.stripePriceId}
                  onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500">Copy this from your Stripe Dashboard</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Bundle description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Include Products</Label>
                <div className="border rounded-md p-3 space-y-2">
                  {products.filter(p => p.isActive).map((product) => (
                    <div key={product.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`product-${product.id}`}
                        checked={formData.productIds.includes(product.id)}
                        onCheckedChange={() => toggleProduct(product.id)}
                      />
                      <Label htmlFor={`product-${product.id}`}>{product.name}</Label>
                    </div>
                  ))}
                  {products.filter(p => p.isActive).length === 0 && (
                    <p className="text-sm text-gray-500">No active products. Add products first.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration Type</Label>
                  <Select
                    value={formData.durationType}
                    onValueChange={(value) => setFormData({ ...formData, durationType: value })}
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

                {formData.durationType !== 'lifetime' && (
                  <div className="space-y-2">
                    <Label htmlFor="durationValue">Duration Value</Label>
                    <Input
                      id="durationValue"
                      type="number"
                      min="1"
                      placeholder="e.g., 12"
                      value={formData.durationValue}
                      onChange={(e) => setFormData({ ...formData, durationValue: e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full">Create Bundle</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {bundles.map((bundle) => (
          <Card key={bundle.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{bundle.name}</CardTitle>
                  <p className="text-sm text-gray-500">/{bundle.slug}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={bundle.isActive ? 'default' : 'secondary'}>
                    {bundle.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline">{bundle._count.claimTokens} claims</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {bundle.productNames.map((name, i) => (
                    <Badge key={i} variant="secondary">{name}</Badge>
                  ))}
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Stripe Price: <code className="bg-gray-100 px-1 rounded">{bundle.stripePriceId}</code></p>
                  <p>Duration: {bundle.durationType === 'lifetime' ? 'Lifetime' : `${bundle.durationValue} ${bundle.durationType}`}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {bundles.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No bundles yet. Create your first bundle to start selling.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
