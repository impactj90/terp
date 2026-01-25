'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { AppLayout, LoadingSkeleton } from '@/components/layout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}
