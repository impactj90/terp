'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

const statusStyles: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  ORDERED: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  PARTIALLY_RECEIVED: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  RECEIVED: 'bg-green-100 text-green-800 hover:bg-green-100',
  CANCELLED: 'bg-red-100 text-red-800 hover:bg-red-100',
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
    <Badge className={statusStyles[status]} variant="secondary">
      {t(statusKeys[status] as Parameters<typeof t>[0])}
    </Badge>
  )
}
