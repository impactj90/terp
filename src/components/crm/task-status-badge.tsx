'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { CircleDot, Loader, CheckCircle, XCircle, ClipboardCheck, MessageSquare } from 'lucide-react'

const STATUS_CONFIG: Record<string, { icon: typeof CircleDot; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  OPEN: { icon: CircleDot, variant: 'default' },
  IN_PROGRESS: { icon: Loader, variant: 'secondary' },
  COMPLETED: { icon: CheckCircle, variant: 'outline' },
  CANCELLED: { icon: XCircle, variant: 'destructive' },
}

const TYPE_CONFIG: Record<string, { icon: typeof ClipboardCheck; label: string }> = {
  TASK: { icon: ClipboardCheck, label: 'Aufgabe' },
  MESSAGE: { icon: MessageSquare, label: 'Nachricht' },
}

interface TaskStatusBadgeProps {
  status: string
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const t = useTranslations('crmTasks')
  const config = STATUS_CONFIG[status]

  const statusLabels: Record<string, string> = {
    OPEN: t('statusOpen'),
    IN_PROGRESS: t('statusInProgress'),
    COMPLETED: t('statusCompleted'),
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

interface TaskTypeBadgeProps {
  type: string
}

export function TaskTypeBadge({ type }: TaskTypeBadgeProps) {
  const t = useTranslations('crmTasks')
  const config = TYPE_CONFIG[type]

  const typeLabels: Record<string, string> = {
    TASK: t('typeTask'),
    MESSAGE: t('typeMessage'),
  }

  const Icon = config?.icon ?? ClipboardCheck
  const label = typeLabels[type] ?? type

  return (
    <Badge variant="outline" className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}
