'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  CLOSED: 'bg-green-100 text-green-800',
  INVOICED: 'bg-purple-100 text-purple-800',
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
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status] as any) : status
  return (
    <Badge variant="outline" className={style}>
      {label}
    </Badge>
  )
}
