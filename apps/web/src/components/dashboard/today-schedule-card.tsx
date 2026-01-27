'use client'

import { useTranslations } from 'next-intl'
import { Clock, AlertCircle, RefreshCw, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEmployeeDayView } from '@/hooks/api'
import { formatMinutes, formatTime, getToday } from '@/lib/time-utils'

interface TodayScheduleCardProps {
  employeeId?: string
  className?: string
}

/**
 * Dashboard card showing today's schedule and current status.
 */
export function TodayScheduleCard({
  employeeId,
  className,
}: TodayScheduleCardProps) {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const today = getToday()

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useEmployeeDayView(employeeId ?? '', today, !!employeeId)

  if (isLoading || !employeeId) {
    return <TodayScheduleCardSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {t('todaysSchedule')}
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

  // Get data from response
  const bookings = data?.bookings ?? []
  const dailyValue = data?.daily_value
  const isHoliday = data?.is_holiday ?? false
  const isWeekend = dailyValue?.is_weekend ?? false
  const isAbsence = dailyValue?.is_absence ?? false

  // Filter to work bookings only (in/out direction, not break or errand)
  const workBookings = bookings.filter(
    (b) => b.booking_type?.direction === 'in' || b.booking_type?.direction === 'out'
  )

  // Sort by time
  const sortedBookings = [...workBookings].sort((a, b) => a.edited_time - b.edited_time)

  // Check if clocked in: last booking is 'in'
  const lastBooking = sortedBookings[sortedBookings.length - 1]
  const isClockedIn = lastBooking?.booking_type?.direction === 'in'

  // Get first in and last out
  const firstIn = sortedBookings.find((b) => b.booking_type?.direction === 'in')
  const lastOut = [...sortedBookings].reverse().find((b) => b.booking_type?.direction === 'out')

  // Get target hours from daily value
  const targetMinutes = dailyValue?.target_minutes ?? 0
  const netMinutes = dailyValue?.net_minutes ?? 0

  // Format status badge
  const getStatusBadge = () => {
    if (isHoliday) {
      return <Badge variant="secondary">{t('holiday')}</Badge>
    }
    if (isWeekend) {
      return <Badge variant="secondary">{t('weekend')}</Badge>
    }
    if (isAbsence) {
      return <Badge variant="secondary">{t('absence')}</Badge>
    }
    if (isClockedIn) {
      return <Badge className="bg-green-500 text-white hover:bg-green-500">{t('clockedIn')}</Badge>
    }
    if (bookings.length > 0) {
      return <Badge variant="outline">{t('completed')}</Badge>
    }
    return <Badge variant="outline">{t('notStarted')}</Badge>
  }

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {t('todaysSchedule')}
        </span>
        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>

      {/* Status and target */}
      <div className="mt-2 flex items-center justify-between">
        {getStatusBadge()}
        <span className="text-sm text-muted-foreground">
          {formatMinutes(targetMinutes)} {t('target')}
        </span>
      </div>

      {/* Bookings timeline */}
      {sortedBookings.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {firstIn && (
            <div className="flex items-center gap-2 text-sm">
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-muted-foreground">{t('inLabel')}</span>
              <span className="font-medium">
                {firstIn.time_string ?? formatTime(firstIn.edited_time)}
              </span>
            </div>
          )}
          {lastOut && !isClockedIn && (
            <div className="flex items-center gap-2 text-sm">
              <Moon className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-muted-foreground">{t('outLabel')}</span>
              <span className="font-medium">
                {lastOut.time_string ?? formatTime(lastOut.edited_time)}
              </span>
            </div>
          )}
          {netMinutes > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              {t('worked')} <span className="font-medium text-foreground">{formatMinutes(netMinutes)}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {isHoliday || isWeekend || isAbsence
            ? t('noWorkScheduled')
            : t('noBookingsYet')}
        </p>
      )}

      {/* Errors indicator */}
      {dailyValue?.has_errors && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
          <AlertCircle className="h-3 w-3" />
          <span>{t('needsAttention')}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Skeleton loading state for TodayScheduleCard.
 */
export function TodayScheduleCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="mt-3 space-y-1.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  )
}
