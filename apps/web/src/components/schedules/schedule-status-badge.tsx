'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type ScheduleExecution = components['schemas']['ScheduleExecution']
type ExecutionStatus = ScheduleExecution['status']

interface ScheduleStatusBadgeProps {
  status: ExecutionStatus
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
  const statusKey = `status${status.charAt(0).toUpperCase() + status.slice(1)}` as
    | 'statusPending'
    | 'statusRunning'
    | 'statusCompleted'
    | 'statusFailed'
    | 'statusPartial'
  return (
    <Badge variant="secondary" className={statusStyleConfig[status]}>
      {t(statusKey)}
    </Badge>
  )
}
