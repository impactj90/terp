'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  WhCorrectionDashboard,
  WhCorrectionMessageList,
  WhCorrectionDetailSheet,
  WhCorrectionRunHistory,
} from '@/components/warehouse/corrections'

export default function WhCorrectionsPage() {
  const t = useTranslations('warehouseCorrections')
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['wh_corrections.view'])

  const [activeTab, setActiveTab] = React.useState<'messages' | 'runs'>('messages')
  const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/warehouse')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) return null

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* KPI Dashboard + Trigger */}
      <WhCorrectionDashboard />

      {/* Tabs: Messages / Run History */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'messages' | 'runs')}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="messages">{t('tabMessages')}</TabsTrigger>
          <TabsTrigger value="runs">{t('tabRuns')}</TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <WhCorrectionMessageList
            onSelectMessage={(id) => setSelectedMessageId(id)}
          />
        </TabsContent>

        <TabsContent value="runs">
          <WhCorrectionRunHistory />
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <WhCorrectionDetailSheet
        messageId={selectedMessageId}
        open={!!selectedMessageId}
        onClose={() => setSelectedMessageId(null)}
      />
    </div>
  )
}
