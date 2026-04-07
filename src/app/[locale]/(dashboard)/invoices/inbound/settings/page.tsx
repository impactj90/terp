'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImapConfigForm } from '@/components/invoices/imap-config-form'
import { ApprovalPolicyList } from '@/components/invoices/approval-policy-list'
import { InboundEmailLog } from '@/components/invoices/inbound-email-log'

type SettingsTab = 'imap' | 'approval-rules' | 'email-log'

export default function InboundInvoiceSettingsPage() {
  const router = useRouter()
  const t = useTranslations('inboundInvoices')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'email_imap.manage',
    'inbound_invoices.manage',
  ])

  const [activeTab, setActiveTab] = React.useState<SettingsTab>('imap')

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
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="imap">{t('settings.tabImap')}</TabsTrigger>
          <TabsTrigger value="approval-rules">{t('settings.tabApprovalRules')}</TabsTrigger>
          <TabsTrigger value="email-log">{t('settings.tabEmailLog')}</TabsTrigger>
        </TabsList>

        <TabsContent value="imap" className="space-y-6">
          <ImapConfigForm />
        </TabsContent>

        <TabsContent value="approval-rules" className="space-y-6">
          <ApprovalPolicyList />
        </TabsContent>

        <TabsContent value="email-log" className="space-y-6">
          <InboundEmailLog />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SettingsPageSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-96" />
    </div>
  )
}
