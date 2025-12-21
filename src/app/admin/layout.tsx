'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/products', label: 'Products', icon: '📦' },
  { href: '/admin/bundles', label: 'Bundles', icon: '🎁' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/grant', label: 'Grant Access', icon: '➕' },
  { href: '/admin/logs', label: 'Logs', icon: '📜' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<{ email: string; name: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const token = localStorage.getItem('admin_token')
    const storedAdmin = localStorage.getItem('admin_user')

    if (!token || !storedAdmin) {
      router.push('/admin/login')
      return
    }

    setAdmin(JSON.parse(storedAdmin))
    setLoading(false)
  }

  function handleLogout() {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    router.push('/admin/login')
  }

  // Allow login and setup pages to render without auth
  if (pathname === '/admin/login' || pathname === '/admin/setup') {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Entitlements Admin
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{admin?.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-[calc(100vh-4rem)] border-r">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
