'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial'

type BadgeVariant = 'gray' | 'blue' | 'green' | 'red' | 'amber'

interface ScheduleStatusBadgeProps {
  status: string
}

const statusVariants: Record<ExecutionStatus, BadgeVariant> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
  partial: 'amber',
}

export function ScheduleStatusBadge({ status }: ScheduleStatusBadgeProps) {
  const t = useTranslations('adminSchedules')
  const s = status as ExecutionStatus
  const statusKey = `status${s.charAt(0).toUpperCase() + s.slice(1)}` as
    | 'statusPending'
    | 'statusRunning'
    | 'statusCompleted'
    | 'statusFailed'
    | 'statusPartial'
  return (
    <Badge variant={statusVariants[s]}>
      {t(statusKey)}
    </Badge>
  )
}
