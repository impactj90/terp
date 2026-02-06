'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { components } from '@/lib/api/types'

type OrderStatus = components['schemas']['Order']['status']

interface OrderStatusBadgeProps {
  status: OrderStatus | undefined | null
}

const statusConfig: Record<
  NonNullable<OrderStatus>,
  { labelKey: 'statusPlanned' | 'statusActive' | 'statusCompleted' | 'statusCancelled'; className: string }
> = {
  planned: {
    labelKey: 'statusPlanned' as const,
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
  active: {
    labelKey: 'statusActive' as const,
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  completed: {
    labelKey: 'statusCompleted' as const,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  cancelled: {
    labelKey: 'statusCancelled' as const,
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
}

/**
 * Badge component for displaying order status.
 */
export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const t = useTranslations('adminOrders')

  if (!status) {
    return <Badge variant="secondary">{t('statusUnknown')}</Badge>
  }

  const config = statusConfig[status]

  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}
