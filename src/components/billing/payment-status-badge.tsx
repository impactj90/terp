'use client'

import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  UNPAID:   { label: 'Offen',        variant: 'bg-gray-100 text-gray-800' },
  PARTIAL:  { label: 'Teilzahlung',  variant: 'bg-yellow-100 text-yellow-800' },
  PAID:     { label: 'Bezahlt',      variant: 'bg-green-100 text-green-800' },
  OVERPAID: { label: 'Überzahlt',    variant: 'bg-blue-100 text-blue-800' },
  OVERDUE:  { label: 'Überfällig',   variant: 'bg-red-100 text-red-800' },
}

interface PaymentStatusBadgeProps {
  status: string
  isOverdue?: boolean
}

export function PaymentStatusBadge({ status, isOverdue: overdue }: PaymentStatusBadgeProps) {
  const effectiveStatus = overdue && status !== 'PAID' && status !== 'OVERPAID' ? 'OVERDUE' : status
  const config = STATUS_CONFIG[effectiveStatus] ?? { label: effectiveStatus, variant: 'bg-gray-100 text-gray-800' }
  return (
    <Badge variant="outline" className={config.variant}>
      {config.label}
    </Badge>
  )
}
