'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type Status = 'UNPAID' | 'PARTIAL' | 'PAID'

const VARIANTS: Record<Status, 'gray' | 'yellow' | 'green'> = {
  UNPAID: 'gray',
  PARTIAL: 'yellow',
  PAID: 'green',
}

interface Props {
  status: Status | string
}

export function InboundInvoicePaymentStatusBadge({ status }: Props) {
  const t = useTranslations('inboundInvoices')
  const normalized = (status as Status) in VARIANTS ? (status as Status) : 'UNPAID'
  return (
    <Badge variant={VARIANTS[normalized]}>
      {t(`paymentStatus.${normalized.toLowerCase()}` as 'paymentStatus.unpaid')}
    </Badge>
  )
}
