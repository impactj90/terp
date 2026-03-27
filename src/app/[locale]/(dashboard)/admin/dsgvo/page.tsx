'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldAlert, Eye } from 'lucide-react'
import { DsgvoInfoCard } from '@/components/dsgvo/dsgvo-info-card'
import { RetentionRulesTable } from '@/components/dsgvo/retention-rules-table'
import { RetentionPreviewDialog } from '@/components/dsgvo/retention-preview-dialog'
import { RetentionLogsTable } from '@/components/dsgvo/retention-logs-table'

export default function DsgvoRetentionPage() {
  const t = useTranslations('dsgvo')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'dsgvo.view',
  ])

  const [previewOpen, setPreviewOpen] = React.useState(false)

  if (authLoading || permLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            {t('page.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('page.subtitle')}
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="mr-2 h-4 w-4" />
          {t('preview.title')}
        </Button>
      </div>

      {/* Info Card */}
      <DsgvoInfoCard />

      {/* Retention Rules */}
      <Card>
        <CardHeader>
          <CardTitle>{t('rules.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RetentionRulesTable />
        </CardContent>
      </Card>

      {/* Deletion Logs */}
      <Card>
        <CardHeader>
          <CardTitle>{t('logs.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RetentionLogsTable />
        </CardContent>
      </Card>

      {/* Preview & Execute Dialog */}
      <RetentionPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  )
}
