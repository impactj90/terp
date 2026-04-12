'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type BadgeVariant = 'gray' | 'blue' | 'green' | 'purple'

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  OPEN: 'gray',
  IN_PROGRESS: 'blue',
  CLOSED: 'green',
  INVOICED: 'purple',
}

const STATUS_KEYS: Record<string, string> = {
  OPEN: 'statusOpen',
  IN_PROGRESS: 'statusInProgress',
  CLOSED: 'statusClosed',
  INVOICED: 'statusInvoiced',
}

interface ServiceCaseStatusBadgeProps {
  status: string
}

export function ServiceCaseStatusBadge({ status }: ServiceCaseStatusBadgeProps) {
  const t = useTranslations('billingServiceCases')
  const variant = STATUS_VARIANTS[status] ?? 'gray'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status] as any) : status
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}
