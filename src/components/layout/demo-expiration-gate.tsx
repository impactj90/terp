'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTenant } from '@/providers/tenant-provider'

interface TenantWithDemoFields {
  isDemo?: boolean
  demoExpiresAt?: string | Date | null
}

/**
 * Redirects authenticated users whose current tenant is an expired demo
 * to /demo-expired.
 *
 * Gate condition is `isDemo && demo_expires_at < now()` — NOT
 * `isDemo && !isActive`. A regular soft-deactivated tenant must not be
 * misclassified as "demo expired".
 *
 * Session stays intact (no logout), only navigation is redirected.
 */
export function DemoExpirationGate({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant()
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    if (!tenant) return

    const t = tenant as TenantWithDemoFields
    const isDemoTenant = t.isDemo === true
    if (!isDemoTenant) return

    const rawExpires = t.demoExpiresAt
    if (!rawExpires) return

    const expiresMs =
      typeof rawExpires === 'string'
        ? Date.parse(rawExpires)
        : rawExpires.getTime()

    if (Number.isNaN(expiresMs)) return

    if (expiresMs < Date.now()) {
      // Avoid an endless redirect loop if pathname already targets demo-expired.
      if (!pathname?.endsWith('/demo-expired')) {
        router.replace('/demo-expired')
      }
    }
  }, [tenant, router, pathname])

  return <>{children}</>
}
