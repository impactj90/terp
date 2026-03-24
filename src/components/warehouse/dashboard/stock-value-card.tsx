'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhStockValueSummary } from '@/hooks/use-wh-dashboard'
import { Euro } from 'lucide-react'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

export function StockValueCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhStockValueSummary()

  return (
    <StatsCard
      title={t('stockValue')}
      value={data ? formatCurrency(data.totalStockValue) : '—'}
      description={data ? t('trackedArticles', { count: data.trackedArticleCount }) : undefined}
      icon={Euro}
      isLoading={isLoading}
      error={error ? (error as unknown as Error) : undefined}
      onRetry={() => refetch()}
    />
  )
}
