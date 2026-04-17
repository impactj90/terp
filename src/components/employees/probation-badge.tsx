'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProbationStatus } from '@/lib/services/probation-service'

interface ProbationBadgeProps {
  status: ProbationStatus
  className?: string
}

export function ProbationBadge({ status, className }: ProbationBadgeProps) {
  const t = useTranslations('adminEmployees')

  if (status !== 'in_probation' && status !== 'ends_in_30_days') {
    return null
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        status === 'ends_in_30_days'
          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50'
          : 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-50',
        className
      )}
    >
      {t('probationBadge')}
    </Badge>
  )
}
