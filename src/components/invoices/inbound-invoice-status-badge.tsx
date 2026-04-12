'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type InboundInvoiceStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPORTED' | 'CANCELLED'

const statusVariants: Record<InboundInvoiceStatus, string> = {
  DRAFT: 'gray',
  PENDING_APPROVAL: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  EXPORTED: 'blue',
  CANCELLED: 'outline',
}

const statusKeys: Record<InboundInvoiceStatus, string> = {
  DRAFT: 'status.draft',
  PENDING_APPROVAL: 'status.pendingApproval',
  APPROVED: 'status.approved',
  REJECTED: 'status.rejected',
  EXPORTED: 'status.exported',
  CANCELLED: 'status.cancelled',
}

interface Props {
  status: string
}

export function InboundInvoiceStatusBadge({ status }: Props) {
  const t = useTranslations('inboundInvoices')
  const s = status as InboundInvoiceStatus
  return (
    <Badge variant={statusVariants[s] as Parameters<typeof Badge>[0]['variant']}>
      {t(statusKeys[s] as Parameters<typeof t>[0])}
    </Badge>
  )
}
