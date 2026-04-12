'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhPurchaseOrders } from '@/hooks/use-wh-purchase-orders'
import { ShoppingCart } from 'lucide-react'

export function OpenOrdersCard() {
  const t = useTranslations('warehouseDashboard')

  const ordered = useWhPurchaseOrders({ status: 'ORDERED', pageSize: 1 })
  const partial = useWhPurchaseOrders({ status: 'PARTIALLY_RECEIVED', pageSize: 1 })

  const isLoading = ordered.isLoading || partial.isLoading
  const error = ordered.error || partial.error
  const total = (ordered.data?.total ?? 0) + (partial.data?.total ?? 0)

  return (
    <StatsCard
      title={t('openOrders')}
      value={!isLoading && !error ? String(total) : '—'}
      description={
        !isLoading && !error && partial.data
          ? t('partiallyReceived', { count: partial.data.total })
          : undefined
      }
      icon={ShoppingCart}
      isLoading={isLoading}
      error={error ? (error as unknown as Error) : undefined}
      onRetry={() => { ordered.refetch(); partial.refetch() }}
    />
  )
}
