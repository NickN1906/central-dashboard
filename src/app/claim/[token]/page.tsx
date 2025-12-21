'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface FormField {
  name: string
  type: 'text' | 'email' | 'url' | 'select' | 'textarea' | 'number'
  label: string
  required: boolean
  placeholder?: string
  options?: string[]
}

interface Product {
  id: string
  name: string
  requiresEmail: boolean
  formSchema: FormField[] | null
}

interface ClaimData {
  valid: boolean
  error?: string
  bundle?: {
    name: string
    products: Product[]
  }
  purchaseEmail?: string
  expiresAt?: string
}

interface ProductFormData {
  email: string
  sameAsPurchase: boolean
  formData: Record<string, string>
}

export default function ClaimPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [claimData, setClaimData] = useState<ClaimData | null>(null)
  const [productForms, setProductForms] = useState<Record<string, ProductFormData>>({})
  const [success, setSuccess] = useState(false)
  const [activatedProducts, setActivatedProducts] = useState<{ product: string; email: string; status: string }[]>([])

  useEffect(() => {
    fetchClaimData()
  }, [token])

  async function fetchClaimData() {
    try {
      const res = await fetch(`/api/v1/claim/${token}`)
      const data = await res.json()
      setClaimData(data)

      if (data.valid && data.bundle) {
        // Initialize form data for each product
        const forms: Record<string, ProductFormData> = {}
        data.bundle.products.forEach((product: Product) => {
          forms[product.id] = {
            email: data.purchaseEmail || '',
            sameAsPurchase: true,
            formData: {}
          }
        })
        setProductForms(forms)
      }
    } catch (error) {
      console.error('Error fetching claim data:', error)
      setClaimData({ valid: false, error: 'Failed to load claim data' })
    } finally {
      setLoading(false)
    }
  }

  function updateProductForm(productId: string, updates: Partial<ProductFormData>) {
    setProductForms(prev => ({
      ...prev,
      [productId]: { ...prev[productId], ...updates }
    }))
  }

  function updateFormField(productId: string, fieldName: string, value: string) {
    setProductForms(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        formData: { ...prev[productId].formData, [fieldName]: value }
      }
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Build the products payload
      const products: Record<string, { email: string; formData?: Record<string, string> }> = {}

      Object.entries(productForms).forEach(([productId, form]) => {
        products[productId] = {
          email: form.sameAsPurchase ? (claimData?.purchaseEmail || '') : form.email,
          ...(Object.keys(form.formData).length > 0 && { formData: form.formData })
        }
      })

      const res = await fetch(`/api/v1/claim/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      })

      const data = await res.json()

      if (data.success) {
        setSuccess(true)
        setActivatedProducts(data.activated)
        toast.success('Bundle activated successfully!')
      } else {
        toast.error(data.error || 'Failed to activate bundle')
      }
    } catch (error) {
      console.error('Error activating bundle:', error)
      toast.error('Failed to activate bundle')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!claimData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Claim</CardTitle>
            <CardDescription>
              {claimData?.error || 'This claim link is invalid or has expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              If you believe this is an error, please contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <CardTitle className="text-2xl">Bundle Activated!</CardTitle>
              <CardDescription>
                Your {claimData.bundle?.name} has been activated successfully.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activatedProducts.map((product) => (
                <div key={product.product} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{product.product}</p>
                    <p className="text-sm text-gray-600">{product.email}</p>
                  </div>
                  <Badge variant={product.status === 'ready' ? 'default' : 'secondary'}>
                    {product.status === 'ready' ? 'Ready' : 'Processing'}
                  </Badge>
                </div>
              ))}

              <div className="pt-4 text-center text-sm text-gray-600">
                <p>You can now log in to each product using the email addresses above.</p>
                <p className="mt-2">Products marked as "Processing" will be ready shortly.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Activate Your Bundle
          </h1>
          <p className="mt-2 text-gray-600">
            {claimData.bundle?.name}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {claimData.bundle?.products.map((product, index) => (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <Badge variant="outline">Step {index + 1}/{claimData.bundle?.products.length}</Badge>
                </div>
                <CardDescription>
                  {product.formSchema ? 'Complete the form below to activate this product.' : 'Enter the email you\'ll use for this product.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Email field */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`same-email-${product.id}`}
                      checked={productForms[product.id]?.sameAsPurchase}
                      onCheckedChange={(checked) =>
                        updateProductForm(product.id, { sameAsPurchase: !!checked })
                      }
                    />
                    <Label htmlFor={`same-email-${product.id}`} className="text-sm">
                      Use purchase email ({claimData.purchaseEmail})
                    </Label>
                  </div>

                  {!productForms[product.id]?.sameAsPurchase && (
                    <div>
                      <Label htmlFor={`email-${product.id}`}>Email for {product.name}</Label>
                      <Input
                        id={`email-${product.id}`}
                        type="email"
                        placeholder="your@email.com"
                        value={productForms[product.id]?.email || ''}
                        onChange={(e) => updateProductForm(product.id, { email: e.target.value })}
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Dynamic form fields */}
                {product.formSchema?.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={`${product.id}-${field.name}`}>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>

                    {field.type === 'textarea' ? (
                      <Textarea
                        id={`${product.id}-${field.name}`}
                        placeholder={field.placeholder}
                        value={productForms[product.id]?.formData[field.name] || ''}
                        onChange={(e) => updateFormField(product.id, field.name, e.target.value)}
                        required={field.required}
                      />
                    ) : field.type === 'select' && field.options ? (
                      <Select
                        value={productForms[product.id]?.formData[field.name] || ''}
                        onValueChange={(value) => updateFormField(product.id, field.name, value)}
                        required={field.required}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={field.placeholder || 'Select...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`${product.id}-${field.name}`}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={productForms[product.id]?.formData[field.name] || ''}
                        onChange={(e) => updateFormField(product.id, field.name, e.target.value)}
                        required={field.required}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? 'Activating...' : 'Activate My Bundle'}
          </Button>
        </form>
      </div>
    </div>
  )
}
