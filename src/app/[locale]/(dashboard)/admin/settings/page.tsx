'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { SystemSettingsForm, CleanupToolsSection } from '@/components/settings'

export default function SettingsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['settings.manage'])
  const t = useTranslations('adminSettings')

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) {
    return <SettingsPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Settings form with collapsible sections */}
      <SystemSettingsForm />

      {/* Separator */}
      <hr className="my-8" />

      {/* Cleanup tools */}
      <CleanupToolsSection />
    </div>
  )
}

function SettingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  )
}
