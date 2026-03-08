'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial'

interface ScheduleStatusBadgeProps {
  status: string
}

const statusStyleConfig: Record<ExecutionStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
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
    <Badge variant="secondary" className={statusStyleConfig[s]}>
      {t(statusKey)}
    </Badge>
  )
}
