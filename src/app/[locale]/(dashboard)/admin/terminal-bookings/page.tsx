'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookingsTab, ImportBatchesTab } from '@/components/terminal-bookings'

type TerminalBookingsTab = 'bookings' | 'import-batches'

export default function TerminalBookingsPage() {
  const router = useRouter()
  const t = useTranslations('adminTerminalBookings')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['terminal_bookings.manage'])

  const [activeTab, setActiveTab] = React.useState<TerminalBookingsTab>('bookings')

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) {
    return <TerminalBookingsPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TerminalBookingsTab)}>
        <TabsList>
          <TabsTrigger value="bookings">{t('tabBookings')}</TabsTrigger>
          <TabsTrigger value="import-batches">{t('tabImportBatches')}</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-6">
          <BookingsTab />
        </TabsContent>

        <TabsContent value="import-batches" className="space-y-6">
          <ImportBatchesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TerminalBookingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
