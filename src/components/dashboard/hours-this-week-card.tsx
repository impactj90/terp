'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Calendar, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useDailyValues } from '@/hooks'
import {
  formatMinutes,
  formatDuration,
  getWeekStart,
  getWeekEnd,
  formatDate,
} from '@/lib/time-utils'

interface HoursThisWeekCardProps {
  employeeId?: string
  className?: string
}

/**
 * Dashboard card showing hours worked this week with progress visualization.
 */
export function HoursThisWeekCard({
  employeeId,
  className,
}: HoursThisWeekCardProps) {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const weekStart = formatDate(getWeekStart())
  const weekEnd = formatDate(getWeekEnd())

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useDailyValues({
    employeeId,
    from: weekStart,
    to: weekEnd,
    enabled: !!employeeId,
  })

  const stats = useMemo(() => {
    if (!data?.data) {
      return { totalNet: 0, totalTarget: 0, remaining: 0, daysWorked: 0 }
    }

    // The API returns the entire month — filter to only this week's dates
    const weekStartDate = getWeekStart()
    const weekEndDate = getWeekEnd()

    const dailyValues = data.data.filter((dv) => {
      if (!dv.date) return false
      const dvDate = new Date(dv.date)
      return dvDate >= weekStartDate && dvDate <= weekEndDate
    })

    let totalNet = 0
    let totalTarget = 0
    let daysWorked = 0

    for (const dv of dailyValues) {
      totalNet += dv.net_minutes ?? 0
      totalTarget += dv.target_minutes ?? 0
      if ((dv.net_minutes ?? 0) > 0) {
        daysWorked++
      }
    }

    const remaining = Math.max(0, totalTarget - totalNet)
    return { totalNet, totalTarget, remaining, daysWorked }
  }, [data])

  if (isLoading || !employeeId) {
    return <HoursThisWeekCardSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-4 sm:p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">
            {t('hoursThisWeek')}
          </span>
          <AlertCircle className="h-3.5 w-3.5 text-destructive sm:h-4 sm:w-4" aria-hidden="true" />
        </div>
        <div className="mt-1.5 sm:mt-2">
          <p className="text-xs text-destructive sm:text-sm">{tc('failedToLoad')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          {tc('retry')}
        </Button>
      </div>
    )
  }

  const progressPercent = stats.totalTarget > 0
    ? Math.min(100, (stats.totalNet / stats.totalTarget) * 100)
    : 0

  return (
    <div className={cn('rounded-lg border bg-card p-4 sm:p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">
          {t('hoursThisWeek')}
        </span>
        <Calendar className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" aria-hidden="true" />
      </div>
      <div className="mt-1.5 sm:mt-2">
        <span className="text-xl font-bold sm:text-2xl">
          {formatMinutes(stats.totalNet)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
        {stats.remaining > 0
          ? t('remaining', { duration: formatDuration(stats.remaining) })
          : t('targetReached')}
      </p>

      {/* Simple progress bar */}
      <div className="mt-2 sm:mt-3">
        <div className="h-1.5 w-full rounded-full bg-muted sm:h-2">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progressPercent >= 100
                ? 'bg-green-500'
                : progressPercent >= 80
                  ? 'bg-blue-500'
                  : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground sm:text-xs">
          <span>{t('daysCount', { count: stats.daysWorked })}</span>
          <span>
            {formatMinutes(stats.totalTarget)} {t('target')}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton loading state for HoursThisWeekCard.
 */
export function HoursThisWeekCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 sm:p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-20 sm:h-4 sm:w-28" />
        <Skeleton className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <div className="mt-1.5 sm:mt-2">
        <Skeleton className="h-6 w-14 sm:h-8 sm:w-20" />
      </div>
      <Skeleton className="mt-1.5 h-3 w-20 sm:mt-2 sm:w-24" />
      <div className="mt-2 sm:mt-3">
        <Skeleton className="h-1.5 w-full rounded-full sm:h-2" />
        <div className="mt-1 flex justify-between">
          <Skeleton className="h-3 w-10 sm:w-12" />
          <Skeleton className="h-3 w-12 sm:w-16" />
        </div>
      </div>
    </div>
  )
}
