'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { TenantGuard } from '@/components/auth/tenant-guard'
import { TenantProvider } from '@/providers/tenant-provider'
import { AppLayout, LoadingSkeleton } from '@/components/layout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <TenantProvider>
        <TenantGuard loadingFallback={<LoadingSkeleton />}>
          <AppLayout>{children}</AppLayout>
        </TenantGuard>
      </TenantProvider>
    </ProtectedRoute>
  )
}
