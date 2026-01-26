'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ClockStatus = 'clocked_in' | 'clocked_out' | 'on_break' | 'on_errand'

interface ClockStatusBadgeProps {
  status: ClockStatus
  className?: string
}

const statusConfig: Record<ClockStatus, { label: string; className: string }> = {
  clocked_in: {
    label: 'Clocked In',
    className: 'bg-success text-success-foreground',
  },
  clocked_out: {
    label: 'Not Clocked In',
    className: 'bg-muted text-muted-foreground',
  },
  on_break: {
    label: 'On Break',
    className: 'bg-warning text-warning-foreground',
  },
  on_errand: {
    label: 'On Errand',
    className: 'bg-info text-info-foreground',
  },
}

export function ClockStatusBadge({ status, className }: ClockStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge className={cn('text-sm px-3 py-1', config.className, className)}>
      {config.label}
    </Badge>
  )
}
