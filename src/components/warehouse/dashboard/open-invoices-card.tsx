'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhSupplierInvoiceSummary } from '@/hooks/use-wh-supplier-invoices'
import { FileText } from 'lucide-react'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

export function OpenInvoicesCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhSupplierInvoiceSummary()

  return (
    <StatsCard
      title={t('openInvoices')}
      value={data ? formatCurrency(data.totalOpen) : '—'}
      description={data ? t('invoiceCount', { count: data.invoiceCount }) : undefined}
      icon={FileText}
      isLoading={isLoading}
      error={error ? (error as unknown as Error) : undefined}
      onRetry={() => refetch()}
    />
  )
}
