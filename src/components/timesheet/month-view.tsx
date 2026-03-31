'use client'

import { useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDailyValues, useMonthlyValues } from '@/hooks'
import {
  formatDate,
  getMonthDates,
  getMonthRange,
  isToday,
  isWeekend,
} from '@/lib/time-utils'
import { QueryError } from '@/components/ui/query-error'
import { ErrorBadge } from './error-badge'
import { TimeDisplay } from './time-display'
import { ProgressSummary } from './progress-summary'

// Type for daily value from API
interface DailyValueData {
  value_date: string
  target_minutes?: number
  gross_minutes?: number
  break_minutes?: number
  net_minutes?: number
  balance_minutes?: number
  is_holiday?: boolean
  is_absence?: boolean
  has_errors?: boolean
  errors?: Array<{ id: string; error_type: string; message: string; severity?: 'warning' | 'error' }>
}

interface MonthViewProps {
  year: number
  month: number // 1-12
  employeeId?: string
  onDayClick?: (date: Date) => void
}

export function MonthView({
  year,
  month,
  employeeId,
  onDayClick,
}: MonthViewProps) {
  const t = useTranslations('timesheet')
  const tc = useTranslations('common')
  const locale = useLocale()
  const referenceDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const { start, end } = useMemo(() => getMonthRange(referenceDate), [referenceDate])
  const dates = useMemo(() => getMonthDates(referenceDate), [referenceDate])

  const { data: dailyValuesData, isLoading: isLoadingDailyValues, isError: isDailyError, refetch: refetchDaily } = useDailyValues({
    employeeId,
    from: formatDate(start),
    to: formatDate(end),
    enabled: !!employeeId,
  })

  const { data: monthlyValuesData, isLoading: isLoadingMonthlyValues, isError: isMonthlyError, refetch: refetchMonthly } = useMonthlyValues({
    employeeId,
    year,
    month,
    enabled: !!employeeId,
  })

  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, DailyValueData>()
    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        map.set(dv.value_date, dv as DailyValueData)
      }
    }
    return map
  }, [dailyValuesData])

  const monthlyValue = monthlyValuesData?.data?.[0]

  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1)
    const startingDayOfWeek = firstDayOfMonth.getDay()
    const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1

    const grid: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = Array(adjustedStartDay).fill(null)

    for (const date of dates) {
      currentWeek.push(date)
      if (currentWeek.length === 7) {
        grid.push(currentWeek)
        currentWeek = []
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      grid.push(currentWeek)
    }

    return grid
  }, [year, month, dates])

  const isLoading = isLoadingDailyValues || isLoadingMonthlyValues

  if (isDailyError || isMonthlyError) {
    return (
      <QueryError
        message={t('loadFailed')}
        onRetry={() => { refetchDaily(); refetchMonthly() }}
      />
    )
  }

  const weekDays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(2024, 0, 1 + i)
      return formatter.format(date)
    })
  }, [locale])

  return (
    <div className="space-y-5">
      {/* Monthly summary at top */}
      {monthlyValue ? (
        <div className="space-y-3">
          <ProgressSummary
            targetMinutes={monthlyValue.target_minutes}
            grossMinutes={monthlyValue.gross_minutes}
            breakMinutes={monthlyValue.break_minutes}
            netMinutes={monthlyValue.net_minutes}
            balanceMinutes={monthlyValue.balance_minutes}
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground px-1">
            <span>{t('workingDays', { count: monthlyValue.working_days ?? 0 })}</span>
            <span>{t('workedDays', { count: monthlyValue.worked_days ?? 0 })}</span>
            <span>{t('absenceDays', { count: monthlyValue.absence_days ?? 0 })}</span>
            <span>{t('holidayDays', { count: monthlyValue.holiday_days ?? 0 })}</span>
            <span className="text-muted-foreground/50">{t('statusLabel')}: {monthlyValue.status}</span>
          </div>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-[88px] w-full rounded-xl" />
      ) : null}

      {/* Mobile: compact day list */}
      <div className="space-y-1 sm:hidden">
        {dates.map((date) => {
          const dateString = formatDate(date)
          const dailyValue = dailyValuesByDate.get(dateString)
          const today = isToday(date)
          const weekend = isWeekend(date)
          const target = dailyValue?.target_minutes ?? 0
          const net = dailyValue?.net_minutes ?? 0
          const progress = target > 0 ? Math.min((net / target) * 100, 100) : 0
          const hasData = dailyValue && (dailyValue.gross_minutes || dailyValue.net_minutes)

          return (
            <button
              key={dateString}
              onClick={() => onDayClick?.(date)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                'active:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
                today && 'bg-primary/5',
                weekend && !target && 'opacity-50',
              )}
            >
              {/* Day number */}
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium shrink-0',
                today && 'bg-primary text-primary-foreground',
                !today && 'text-foreground',
              )}>
                {date.getDate()}
              </div>

              {/* Day info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">
                    {date.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  {dailyValue?.is_holiday && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">H</Badge>
                  )}
                  {dailyValue?.is_absence && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">A</Badge>
                  )}
                  <ErrorBadge errors={dailyValue?.errors as never} />
                </div>
                {hasData && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      <TimeDisplay value={net} format="duration" className="text-xs" />
                      {target > 0 && (
                        <span className="text-muted-foreground/60"> / <TimeDisplay value={target} format="duration" className="text-xs" /></span>
                      )}
                    </span>
                    {target > 0 && (
                      <div className="flex-1 max-w-16 h-1 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            progress >= 100 ? 'bg-emerald-500/60' : 'bg-primary/50',
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Balance */}
              {hasData && (
                <TimeDisplay
                  value={dailyValue?.balance_minutes}
                  format="balance"
                  className="text-sm font-medium shrink-0"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Desktop: Calendar grid */}
      <div className="hidden sm:block">
        <div>
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'text-center text-xs font-medium py-1.5',
                  index >= 5 && 'text-muted-foreground/60',
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar body */}
          <div className="space-y-1">
            {calendarGrid.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((date, dayIndex) => {
                  if (!date) {
                    return <div key={dayIndex} className="min-h-[80px]" />
                  }

                  const dateString = formatDate(date)
                  const dailyValue = dailyValuesByDate.get(dateString)
                  const today = isToday(date)
                  const weekend = isWeekend(date)
                  const target = dailyValue?.target_minutes ?? 0
                  const net = dailyValue?.net_minutes ?? 0
                  const progress = target > 0 ? Math.min((net / target) * 100, 100) : 0

                  return (
                    <button
                      key={dayIndex}
                      onClick={() => onDayClick?.(date)}
                      className={cn(
                        'min-h-[80px] p-2 rounded-lg border text-left transition-colors relative overflow-hidden',
                        'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
                        today && 'ring-2 ring-primary bg-primary/5',
                        weekend && !dailyValue?.target_minutes && 'bg-muted/20 border-transparent',
                        dailyValue?.has_errors && 'border-amber-500/40',
                        !today && !weekend && 'border-border/50',
                      )}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          'text-sm font-medium',
                          today && 'text-primary',
                        )}>
                          {date.getDate()}
                        </span>
                        <ErrorBadge errors={dailyValue?.errors as never} />
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mb-1">
                        {dailyValue?.is_holiday && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">H</Badge>
                        )}
                        {dailyValue?.is_absence && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">A</Badge>
                        )}
                      </div>

                      {/* Time values */}
                      {isLoading ? (
                        <Skeleton className="h-4 w-12" />
                      ) : dailyValue?.net_minutes !== undefined ? (
                        <div className="text-xs space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Net:</span>
                            <TimeDisplay
                              value={dailyValue.net_minutes}
                              format="duration"
                              className="text-xs"
                            />
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+/-:</span>
                            <TimeDisplay
                              value={dailyValue.balance_minutes}
                              format="balance"
                              className="text-xs font-medium"
                            />
                          </div>
                        </div>
                      ) : weekend ? (
                        <span className="text-xs text-muted-foreground/40">-</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">{tc('noData')}</span>
                      )}

                      {/* Bottom progress bar */}
                      {target > 0 && !isLoading && (
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/20">
                          <div
                            className={cn(
                              'h-full transition-all',
                              progress >= 100 ? 'bg-emerald-500/50' : 'bg-primary/40',
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
