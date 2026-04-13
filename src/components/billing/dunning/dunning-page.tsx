'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDunningSettings, useDunningTemplates } from '@/hooks'
import { DunningPreFlightBanner } from './dunning-pre-flight-banner'
import { DunningProposalTab } from './dunning-proposal-tab'
import { DunningRunsTab } from './dunning-runs-tab'
import { DunningTemplatesTab } from './dunning-templates-tab'
import { DunningSettingsTab } from './dunning-settings-tab'

type TabValue = 'proposal' | 'runs' | 'templates' | 'settings'

export function DunningPage() {
  const t = useTranslations('billingDunning')
  const [tab, setTab] = React.useState<TabValue>('proposal')

  const { data: settings } = useDunningSettings()
  const { data: templates } = useDunningTemplates()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg sm:text-2xl font-bold">{t('title')}</h1>
      </div>

      <DunningPreFlightBanner
        settings={settings ?? null}
        templates={templates ?? null}
        onGoToSettings={() => setTab('settings')}
        onGoToTemplates={() => setTab('templates')}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="proposal">{t('tabs.proposal')}</TabsTrigger>
          <TabsTrigger value="runs">{t('tabs.runs')}</TabsTrigger>
          <TabsTrigger value="templates">{t('tabs.templates')}</TabsTrigger>
          <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="proposal" className="mt-4">
          <DunningProposalTab onAfterCreateRun={() => setTab('runs')} />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <DunningRunsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <DunningTemplatesTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <DunningSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
