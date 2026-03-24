'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhStockValueSummary } from '@/hooks/use-wh-dashboard'
import { AlertTriangle } from 'lucide-react'

export function BelowMinStockCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhStockValueSummary()

  const count = data?.belowMinStockCount ?? 0

  return (
    <StatsCard
      title={t('belowMinStock')}
      value={data ? String(count) : '—'}
      description={count > 0 ? t('belowMinStockDesc') : t('allStockOk')}
      icon={AlertTriangle}
      trend={data ? (count > 0 ? 'down' : 'up') : undefined}
      trendValue={data ? (count > 0 ? t('actionRequired') : t('ok')) : undefined}
      isLoading={isLoading}
      error={error ? (error as unknown as Error) : undefined}
      onRetry={() => refetch()}
    />
  )
}
