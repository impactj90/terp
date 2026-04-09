'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { TenantProvider } from '@/providers/tenant-provider'
import { LoadingSkeleton } from '@/components/layout'

/**
 * Layout for the /demo-expired page.
 *
 * Uses ProtectedRoute + TenantProvider so the page has access to the
 * logged-in user and the currently selected tenant, but deliberately
 * skips the dashboard's TenantGuard + AppLayout chrome: the user's demo
 * has expired and they should not be able to navigate the product.
 */
export default function DemoExpiredLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <TenantProvider>{children}</TenantProvider>
    </ProtectedRoute>
  )
}
