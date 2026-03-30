'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

type BadgeVariant = 'gray' | 'blue' | 'yellow' | 'green' | 'red'

const statusVariants: Record<PurchaseOrderStatus, BadgeVariant> = {
  DRAFT: 'gray',
  ORDERED: 'blue',
  PARTIALLY_RECEIVED: 'yellow',
  RECEIVED: 'green',
  CANCELLED: 'red',
}

const statusKeys: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'statusDraft',
  ORDERED: 'statusOrdered',
  PARTIALLY_RECEIVED: 'statusPartiallyReceived',
  RECEIVED: 'statusReceived',
  CANCELLED: 'statusCancelled',
}

interface PurchaseOrderStatusBadgeProps {
  status: PurchaseOrderStatus
}

export function PurchaseOrderStatusBadge({ status }: PurchaseOrderStatusBadgeProps) {
  const t = useTranslations('warehousePurchaseOrders')
  return (
    <Badge variant={statusVariants[status]}>
      {t(statusKeys[status] as Parameters<typeof t>[0])}
    </Badge>
  )
}
