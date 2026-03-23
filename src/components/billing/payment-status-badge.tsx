'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

const STATUS_STYLES: Record<string, string> = {
  UNPAID: 'bg-gray-100 text-gray-800',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  OVERPAID: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
}

const STATUS_KEYS: Record<string, string> = {
  UNPAID: 'statusOpen',
  PARTIAL: 'statusPartial',
  PAID: 'statusPaid',
  OVERPAID: 'statusOverpaid',
  OVERDUE: 'statusOverdue',
}

interface PaymentStatusBadgeProps {
  status: string
  isOverdue?: boolean
}

export function PaymentStatusBadge({ status, isOverdue: overdue }: PaymentStatusBadgeProps) {
  const t = useTranslations('billingOpenItems')
  const effectiveStatus = overdue && status !== 'PAID' && status !== 'OVERPAID' ? 'OVERDUE' : status
  const style = STATUS_STYLES[effectiveStatus] ?? 'bg-gray-100 text-gray-800'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = STATUS_KEYS[effectiveStatus] ? t(STATUS_KEYS[effectiveStatus] as any) : effectiveStatus
  return (
    <Badge variant="outline" className={style}>
      {label}
    </Badge>
  )
}
