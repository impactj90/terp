'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SmtpConfigForm } from '@/components/email/smtp-config-form'
import { EmailTemplateList } from '@/components/email/email-template-list'

type EmailTab = 'smtp' | 'templates'

export default function EmailSettingsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'email_smtp.view',
  ])
  const t = useTranslations('adminEmailSettings')
  const [activeTab, setActiveTab] = React.useState<EmailTab>('smtp')

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) {
    return <PageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as EmailTab)}
      >
        <TabsList>
          <TabsTrigger value="smtp">{t('tabSmtp')}</TabsTrigger>
          <TabsTrigger value="templates">{t('tabTemplates')}</TabsTrigger>
        </TabsList>

        <TabsContent value="smtp" className="space-y-6">
          <SmtpConfigForm />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <EmailTemplateList />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64" />
    </div>
  )
}
