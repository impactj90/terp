'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  status: string
  className?: string
}

const COLOR: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-900 hover:bg-gray-100',
  EXPORTED: 'bg-blue-100 text-blue-900 hover:bg-blue-100',
  BOOKED: 'bg-green-100 text-green-900 hover:bg-green-100',
  CANCELLED: 'bg-gray-200 text-gray-700 line-through hover:bg-gray-200',
}

export function PaymentRunStatusBadge({ status, className }: Props) {
  const t = useTranslations('paymentRuns.status')
  const key = status as 'DRAFT' | 'EXPORTED' | 'BOOKED' | 'CANCELLED'
  return (
    <Badge className={cn(COLOR[status] ?? '', className)}>{t(key)}</Badge>
  )
}
