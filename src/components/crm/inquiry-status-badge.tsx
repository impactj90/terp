'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { CircleDot, Loader, CheckCircle, XCircle } from 'lucide-react'

const STATUS_CONFIG: Record<string, { icon: typeof CircleDot; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  OPEN: { icon: CircleDot, variant: 'default' },
  IN_PROGRESS: { icon: Loader, variant: 'secondary' },
  CLOSED: { icon: CheckCircle, variant: 'outline' },
  CANCELLED: { icon: XCircle, variant: 'destructive' },
}

interface InquiryStatusBadgeProps {
  status: string
}

export function InquiryStatusBadge({ status }: InquiryStatusBadgeProps) {
  const t = useTranslations('crmInquiries')
  const config = STATUS_CONFIG[status]

  const statusLabels: Record<string, string> = {
    OPEN: t('statusOpen'),
    IN_PROGRESS: t('statusInProgress'),
    CLOSED: t('statusClosed'),
    CANCELLED: t('statusCancelled'),
  }

  const Icon = config?.icon ?? CircleDot
  const label = statusLabels[status] ?? status

  return (
    <Badge variant={config?.variant ?? 'secondary'} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}
