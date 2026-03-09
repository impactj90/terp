'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ClockStatus = 'clocked_in' | 'clocked_out' | 'on_break' | 'on_errand'

interface ClockStatusBadgeProps {
  status: ClockStatus
  className?: string
}

const statusConfig: Record<ClockStatus, { labelKey: string; className: string }> = {
  clocked_in: {
    labelKey: 'statusClockedIn',
    className: 'bg-success text-success-foreground',
  },
  clocked_out: {
    labelKey: 'statusNotClockedIn',
    className: 'bg-muted text-muted-foreground',
  },
  on_break: {
    labelKey: 'statusOnBreak',
    className: 'bg-warning text-warning-foreground',
  },
  on_errand: {
    labelKey: 'statusOnErrand',
    className: 'bg-info text-info-foreground',
  },
}

export function ClockStatusBadge({ status, className }: ClockStatusBadgeProps) {
  const t = useTranslations('timeClock')
  const config = statusConfig[status]

  return (
    <Badge className={cn('text-sm px-3 py-1', config.className, className)}>
      {t(config.labelKey as Parameters<typeof t>[0])}
    </Badge>
  )
}
