'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type BadgeVariant = 'gray' | 'yellow' | 'green' | 'blue' | 'red'

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  UNPAID: 'gray',
  PARTIAL: 'yellow',
  PAID: 'green',
  OVERPAID: 'blue',
  OVERDUE: 'red',
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
  const variant = STATUS_VARIANTS[effectiveStatus] ?? 'gray'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = STATUS_KEYS[effectiveStatus] ? t(STATUS_KEYS[effectiveStatus] as any) : effectiveStatus
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}
