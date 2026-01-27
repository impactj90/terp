'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  /** Whether the employee is active */
  isActive: boolean
  /** Employee exit date (ISO string) */
  exitDate?: string | null
  /** Additional class name */
  className?: string
}

/**
 * Badge component for displaying employee status.
 *
 * - Active: Green badge
 * - Inactive: Gray badge
 * - Exited: Red badge (if exit_date is in the past)
 *
 * @example
 * ```tsx
 * <StatusBadge isActive={true} />
 * <StatusBadge isActive={false} exitDate="2024-01-01" />
 * ```
 */
export function StatusBadge({ isActive, exitDate, className }: StatusBadgeProps) {
  const t = useTranslations('adminEmployees')
  const hasExited = exitDate ? new Date(exitDate) < new Date() : false

  if (hasExited) {
    return (
      <Badge variant="destructive" className={cn(className)}>
        {t('statusExited')}
      </Badge>
    )
  }

  if (!isActive) {
    return (
      <Badge variant="secondary" className={cn(className)}>
        {t('statusInactive')}
      </Badge>
    )
  }

  return (
    <Badge variant="default" className={cn('bg-green-600 hover:bg-green-600/90', className)}>
      {t('statusActive')}
    </Badge>
  )
}
