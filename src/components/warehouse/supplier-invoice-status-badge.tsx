'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type SupplierInvoiceStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED'

const statusStyles: Record<SupplierInvoiceStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  PARTIAL: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  PAID: 'bg-green-100 text-green-800 hover:bg-green-100',
  CANCELLED: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
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
    <Badge className={statusStyles[status]} variant="secondary">
      {t(statusKeys[status] as Parameters<typeof t>[0])}
    </Badge>
  )
}
