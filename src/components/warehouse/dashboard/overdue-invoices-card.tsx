'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhSupplierInvoiceSummary } from '@/hooks/use-wh-supplier-invoices'
import { AlertCircle } from 'lucide-react'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

export function OverdueInvoicesCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhSupplierInvoiceSummary()

  const count = data?.overdueCount ?? 0

  return (
    <StatsCard
      title={t('overdueInvoices')}
      value={data ? String(count) : '—'}
      description={
        data
          ? count > 0
            ? t('overdueAmount', { amount: formatCurrency(data.totalOverdue) })
            : t('noOverdue')
          : undefined
      }
      icon={AlertCircle}
      trend={data ? (count > 0 ? 'down' : 'up') : undefined}
      trendValue={data ? (count > 0 ? t('overdue') : t('ok')) : undefined}
      isLoading={isLoading}
      error={error ? (error as unknown as Error) : undefined}
      onRetry={() => refetch()}
    />
  )
}
