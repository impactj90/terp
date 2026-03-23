'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PRINTED: 'bg-blue-100 text-blue-800',
  PARTIALLY_FORWARDED: 'bg-yellow-100 text-yellow-800',
  FORWARDED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

const STATUS_KEYS: Record<string, string> = {
  DRAFT: 'statusDraft',
  PRINTED: 'statusFinalized',
  PARTIALLY_FORWARDED: 'statusPartiallyForwarded',
  FORWARDED: 'statusForwarded',
  CANCELLED: 'statusCancelled',
}

interface DocumentStatusBadgeProps {
  status: string
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const t = useTranslations('billingDocuments')
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status] as any) : status
  return (
    <Badge variant="outline" className={style}>
      {label}
    </Badge>
  )
}
