'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { TenantGuard } from '@/components/auth/tenant-guard'
import { SupportSessionBanner } from '@/components/auth/support-session-banner'
import { TenantProvider } from '@/providers/tenant-provider'
import {
  AppLayout,
  DemoBanner,
  DemoExpirationGate,
  LoadingSkeleton,
  SmtpConfigWarningBanner,
} from '@/components/layout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <TenantProvider>
        <TenantGuard loadingFallback={<LoadingSkeleton />}>
          <DemoExpirationGate>
            <AppLayout>
              <SupportSessionBanner />
              <DemoBanner />
              <SmtpConfigWarningBanner />
              {children}
            </AppLayout>
          </DemoExpirationGate>
        </TenantGuard>
      </TenantProvider>
    </ProtectedRoute>
  )
}
