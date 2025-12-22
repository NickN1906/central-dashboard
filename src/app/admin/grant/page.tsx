'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  isActive: boolean
}

export default function GrantPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    productIds: [] as string[],
    source: 'manual',
    reason: '',
    durationType: 'lifetime',
    durationValue: ''
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
      setProducts(data.products?.filter((p: Product) => p.isActive) || [])
    } catch (error) {
      console.error('Error fetching products:', error)
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

    setSubmitting(true)

    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/v1/admin/users', {
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

      if (data.success) {
        toast.success('Access granted successfully!')
        setFormData({
          email: '',
          productIds: [],
          source: 'manual',
          reason: '',
          durationType: 'lifetime',
          durationValue: ''
        })
      } else {
        toast.error(data.error || 'Failed to grant access')
      }
    } catch (error) {
      console.error('Error granting access:', error)
      toast.error('Failed to grant access')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Grant Access</h2>
        <p className="text-gray-600">Manually grant product access to users</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grant Product Access</CardTitle>
          <CardDescription>
            Use this for promos, support cases, or manual upgrades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">User Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <p className="text-xs text-gray-500">
                If user doesn&apos;t exist, an identity will be created
              </p>
            </div>

            <div className="space-y-2">
              <Label>Products to Grant</Label>
              <div className="border rounded-md p-3 space-y-2">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`product-${product.id}`}
                      checked={formData.productIds.includes(product.id)}
                      onCheckedChange={() => toggleProduct(product.id)}
                    />
                    <Label htmlFor={`product-${product.id}`}>{product.name}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={formData.source}
                onValueChange={(value) => setFormData({ ...formData, source: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Grant</SelectItem>
                  <SelectItem value="promo">Promotion</SelectItem>
                  <SelectItem value="direct">Direct Purchase</SelectItem>
                </SelectContent>
              </Select>
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

            <div className="space-y-2">
              <Label htmlFor="reason">Reason/Notes (optional)</Label>
              <Textarea
                id="reason"
                placeholder="Why is this access being granted?"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Granting Access...' : 'Grant Access'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
