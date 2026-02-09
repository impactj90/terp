'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ZonesTab, ProfilesTab, AssignmentsTab } from '@/components/access-control'

type AccessControlTab = 'zones' | 'profiles' | 'assignments'

export default function AccessControlPage() {
  const router = useRouter()
  const t = useTranslations('adminAccessControl')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [activeTab, setActiveTab] = React.useState<AccessControlTab>('zones')

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  if (authLoading) {
    return <AccessControlPageSkeleton />
  }

  if (!isAdmin) {
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccessControlTab)}>
        <TabsList>
          <TabsTrigger value="zones">{t('tabZones')}</TabsTrigger>
          <TabsTrigger value="profiles">{t('tabProfiles')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="space-y-6">
          <ZonesTab />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-6">
          <ProfilesTab />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <AssignmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AccessControlPageSkeleton() {
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
