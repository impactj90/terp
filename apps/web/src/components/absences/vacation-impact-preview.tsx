'use client'

import * as React from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { isSameDay, isWeekend } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']

interface VacationImpactPreviewProps {
  /** Current vacation balance */
  currentBalance?: number
  /** Total annual vacation entitlement */
  totalEntitlement?: number
  /** Requested days (calculated from date range) */
  requestedDays: number
  /** Whether this is a half-day request */
  isHalfDay?: boolean
  /** Selected absence type */
  absenceType?: AbsenceType
  /** Loading state */
  isLoading?: boolean
  /** Additional className */
  className?: string
}

/**
 * Calculate working days between two dates, excluding weekends and holidays.
 */
export function calculateWorkingDays(
  from: Date,
  to: Date,
  holidays: Date[] = []
): number {
  let count = 0
  const current = new Date(from)

  while (current <= to) {
    const weekend = isWeekend(current)
    const isHoliday = holidays.some((h) => isSameDay(h, current))

    if (!weekend && !isHoliday) {
      count++
    }

    current.setDate(current.getDate() + 1)
  }

  return count
}

export function VacationImpactPreview({
  currentBalance = 0,
  totalEntitlement = 30,
  requestedDays,
  isHalfDay = false,
  absenceType,
  isLoading = false,
  className,
}: VacationImpactPreviewProps) {
  const t = useTranslations('absences')

  // Calculate the actual deduction
  // Note: affects_vacation_balance may be undefined when false due to omitempty in JSON serialization
  const affectsBalance = absenceType?.affects_vacation_balance === true
  const deduction = affectsBalance
    ? isHalfDay
      ? 0.5
      : requestedDays
    : 0
  const projectedBalance = currentBalance - deduction
  const isNegativeBalance = projectedBalance < 0
  const isLowBalance = projectedBalance > 0 && projectedBalance <= 3

  // Calculate progress percentages
  const usedPercent = Math.min(
    ((totalEntitlement - currentBalance) / totalEntitlement) * 100,
    100
  )
  const requestedPercent = Math.min(
    (deduction / totalEntitlement) * 100,
    100 - usedPercent
  )
  const remainingPercent = Math.max(100 - usedPercent - requestedPercent, 0)

  if (isLoading) {
    return (
      <div className={cn('animate-pulse space-y-3', className)}>
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-4 w-24 bg-muted rounded" />
      </div>
    )
  }

  // If absence type doesn't affect balance, show info message
  if (absenceType && !affectsBalance) {
    return (
      <Alert variant="default" className={className}>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>{absenceType.name}</strong> {t('doesNotAffectBalance')}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <h4 className="text-sm font-medium">{t('balanceImpact')}</h4>

      {/* Balance breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('currentBalance')}</span>
          <span className="font-medium">{t('countDays', { count: currentBalance })}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('requested')}</span>
          <span className="font-medium text-destructive">
            - {t('countDays', { count: isHalfDay ? 0.5 : requestedDays })}
          </span>
        </div>
        <div className="border-t my-2" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('afterRequest')}</span>
          <span
            className={cn(
              'font-medium',
              isNegativeBalance && 'text-destructive',
              isLowBalance && 'text-yellow-600 dark:text-yellow-500'
            )}
          >
            {t('countDays', { count: projectedBalance })}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
          {/* Used portion */}
          <div
            className="h-full bg-gray-400 dark:bg-gray-600"
            style={{ width: `${usedPercent}%` }}
          />
          {/* Requested portion (will be deducted) */}
          <div
            className={cn(
              'h-full',
              isNegativeBalance ? 'bg-destructive' : 'bg-orange-400'
            )}
            style={{ width: `${requestedPercent}%` }}
          />
          {/* Remaining portion */}
          <div
            className="h-full bg-green-500"
            style={{ width: `${remainingPercent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('daysRemainingProgress', { remaining: projectedBalance, total: totalEntitlement })}
        </p>
      </div>

      {/* Warnings */}
      {isNegativeBalance && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('negativeBalanceWarning')}
          </AlertDescription>
        </Alert>
      )}

      {isLowBalance && !isNegativeBalance && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('lowBalanceWarning', { count: projectedBalance })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
