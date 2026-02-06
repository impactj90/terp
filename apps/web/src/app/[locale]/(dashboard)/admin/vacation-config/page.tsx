'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SpecialCalculationsTab,
  CalculationGroupsTab,
  CappingRulesTab,
  CappingRuleGroupsTab,
  EmployeeExceptionsTab,
  VacationPreviewsTab,
} from '@/components/vacation-config'

type VacationConfigTab =
  | 'special-calculations'
  | 'calculation-groups'
  | 'capping-rules'
  | 'capping-rule-groups'
  | 'exceptions'
  | 'previews'

export default function VacationConfigPage() {
  const router = useRouter()
  const t = useTranslations('adminVacationConfig')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [activeTab, setActiveTab] = React.useState<VacationConfigTab>('special-calculations')

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  if (authLoading) {
    return <VacationConfigPageSkeleton />
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VacationConfigTab)}>
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="special-calculations">{t('tabSpecialCalculations')}</TabsTrigger>
          <TabsTrigger value="calculation-groups">{t('tabCalculationGroups')}</TabsTrigger>
          <TabsTrigger value="capping-rules">{t('tabCappingRules')}</TabsTrigger>
          <TabsTrigger value="capping-rule-groups">{t('tabCappingRuleGroups')}</TabsTrigger>
          <TabsTrigger value="exceptions">{t('tabExceptions')}</TabsTrigger>
          <TabsTrigger value="previews">{t('tabPreviews')}</TabsTrigger>
        </TabsList>

        <TabsContent value="special-calculations" className="space-y-6">
          <SpecialCalculationsTab />
        </TabsContent>

        <TabsContent value="calculation-groups" className="space-y-6">
          <CalculationGroupsTab />
        </TabsContent>

        <TabsContent value="capping-rules" className="space-y-6">
          <CappingRulesTab />
        </TabsContent>

        <TabsContent value="capping-rule-groups" className="space-y-6">
          <CappingRuleGroupsTab />
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-6">
          <EmployeeExceptionsTab />
        </TabsContent>

        <TabsContent value="previews" className="space-y-6">
          <VacationPreviewsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function VacationConfigPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full max-w-3xl" />
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
