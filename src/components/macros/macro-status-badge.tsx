'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/types/legacy-api-types'

type MacroExecution = components['schemas']['schema3']
type ExecutionStatus = MacroExecution['status']

type BadgeVariant = 'gray' | 'blue' | 'green' | 'red'

interface MacroStatusBadgeProps {
  status: ExecutionStatus
}

const statusVariants: Record<ExecutionStatus, BadgeVariant> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
}

export function MacroStatusBadge({ status }: MacroStatusBadgeProps) {
  const t = useTranslations('adminMacros')
  const statusKey = `status${status.charAt(0).toUpperCase() + status.slice(1)}` as
    | 'statusPending'
    | 'statusRunning'
    | 'statusCompleted'
    | 'statusFailed'
  return (
    <Badge variant={statusVariants[status]}>
      {t(statusKey)}
    </Badge>
  )
}
