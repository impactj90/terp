'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Calendar, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useDailyValues } from '@/hooks/api'
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

    const dailyValues = data.data
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
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {t('hoursThisWeek')}
          </span>
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        </div>
        <div className="mt-2">
          <p className="text-sm text-destructive">{tc('failedToLoad')}</p>
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
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {t('hoursThisWeek')}
        </span>
        <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold">
          {formatMinutes(stats.totalNet)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {stats.remaining > 0
          ? t('remaining', { duration: formatDuration(stats.remaining) })
          : t('targetReached')}
      </p>

      {/* Simple progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={cn(
              'h-2 rounded-full transition-all',
              progressPercent >= 100
                ? 'bg-green-500'
                : progressPercent >= 80
                  ? 'bg-blue-500'
                  : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
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
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="mt-2">
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="mt-2 h-3 w-24" />
      <div className="mt-3">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="mt-1 flex justify-between">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}
