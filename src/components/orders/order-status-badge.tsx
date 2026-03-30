'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type OrderStatus = 'planned' | 'active' | 'completed' | 'cancelled'

type BadgeVariant = 'gray' | 'green' | 'blue' | 'red' | 'secondary'

interface OrderStatusBadgeProps {
  status: string | undefined | null
}

const statusConfig: Record<
  OrderStatus,
  { labelKey: 'statusPlanned' | 'statusActive' | 'statusCompleted' | 'statusCancelled'; variant: BadgeVariant }
> = {
  planned: {
    labelKey: 'statusPlanned' as const,
    variant: 'gray',
  },
  active: {
    labelKey: 'statusActive' as const,
    variant: 'green',
  },
  completed: {
    labelKey: 'statusCompleted' as const,
    variant: 'blue',
  },
  cancelled: {
    labelKey: 'statusCancelled' as const,
    variant: 'red',
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

  const config = statusConfig[status as OrderStatus]

  return (
    <Badge variant={config.variant}>
      {t(config.labelKey)}
    </Badge>
  )
}
