'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type SupplierInvoiceStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED'

type BadgeVariant = 'blue' | 'amber' | 'green' | 'gray'

const statusVariants: Record<SupplierInvoiceStatus, BadgeVariant> = {
  OPEN: 'blue',
  PARTIAL: 'amber',
  PAID: 'green',
  CANCELLED: 'gray',
}

const statusKeys: Record<SupplierInvoiceStatus, string> = {
  OPEN: 'statusOpen',
  PARTIAL: 'statusPartial',
  PAID: 'statusPaid',
  CANCELLED: 'statusCancelled',
}

interface SupplierInvoiceStatusBadgeProps {
  status: SupplierInvoiceStatus
}

export function SupplierInvoiceStatusBadge({ status }: SupplierInvoiceStatusBadgeProps) {
  const t = useTranslations('warehouseSupplierInvoices')
  return (
    <Badge variant={statusVariants[status]}>
      {t(statusKeys[status] as Parameters<typeof t>[0])}
    </Badge>
  )
}
