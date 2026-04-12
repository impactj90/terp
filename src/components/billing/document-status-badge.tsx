'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type BadgeVariant = 'gray' | 'blue' | 'yellow' | 'green' | 'red'

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: 'gray',
  PRINTED: 'blue',
  PARTIALLY_FORWARDED: 'yellow',
  FORWARDED: 'green',
  CANCELLED: 'red',
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
  const variant = STATUS_VARIANTS[status] ?? 'gray'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status] as any) : status
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}
