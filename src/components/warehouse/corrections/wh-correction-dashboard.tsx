'use client'

import { useTranslations } from 'next-intl'
import { AlertCircle, AlertTriangle, Info, Play, Loader2 } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { Button } from '@/components/ui/button'
import {
  useWhCorrectionSummary,
  useWhCorrectionRuns,
  useTriggerWhCorrectionRun,
} from '@/hooks'
import { useHasPermission } from '@/hooks'

function formatDateTime(date: string | Date, locale: string): string {
  return new Date(date).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WhCorrectionDashboard() {
  const t = useTranslations('warehouseCorrections')
  const { data: summary, isLoading: summaryLoading, error: summaryErrorRaw } = useWhCorrectionSummary()
  const summaryError = summaryErrorRaw ? (summaryErrorRaw as unknown as Error) : null
  const { data: runsData } = useWhCorrectionRuns({ pageSize: 1 })
  const triggerRun = useTriggerWhCorrectionRun()
  const { allowed: canRun } = useHasPermission(['wh_corrections.run'])

  const lastRun = runsData?.items?.[0]

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title={t('openErrors')}
          value={String(summary?.errors ?? 0)}
          icon={AlertCircle}
          isLoading={summaryLoading}
          error={summaryError}
          className={summary?.errors ? 'border-destructive/50' : undefined}
        />
        <StatsCard
          title={t('warnings')}
          value={String(summary?.warnings ?? 0)}
          icon={AlertTriangle}
          isLoading={summaryLoading}
          error={summaryError}
          className={summary?.warnings ? 'border-yellow-500/50' : undefined}
        />
        <StatsCard
          title={t('infos')}
          value={String(summary?.infos ?? 0)}
          icon={Info}
          isLoading={summaryLoading}
          error={summaryError}
        />
      </div>

      {/* Trigger + Last Run */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {lastRun ? (
            t('lastRun', {
              date: formatDateTime(lastRun.startedAt, 'de'),
              count: lastRun.issuesFound,
            })
          ) : (
            t('noRunYet')
          )}
        </div>
        {canRun && (
          <Button
            onClick={() => triggerRun.mutate(undefined as unknown as void)}
            disabled={triggerRun.isPending}
          >
            {triggerRun.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {t('triggerRun')}
          </Button>
        )}
      </div>
    </div>
  )
}
