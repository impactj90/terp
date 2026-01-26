'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDailyValues, useMonthlyValues } from '@/hooks/api'
import {
  formatDate,
  getMonthDates,
  getMonthRange,
  isToday,
  isWeekend,
} from '@/lib/time-utils'
import { ErrorBadge } from './error-badge'
import { TimeDisplay } from './time-display'
import { DailySummary } from './daily-summary'

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
  const referenceDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const { start, end } = useMemo(() => getMonthRange(referenceDate), [referenceDate])
  const dates = useMemo(() => getMonthDates(referenceDate), [referenceDate])

  // Fetch daily values for the month
  const { data: dailyValuesData, isLoading: isLoadingDailyValues } = useDailyValues({
    employeeId,
    from: formatDate(start),
    to: formatDate(end),
    enabled: !!employeeId,
  })

  // Fetch monthly value
  const { data: monthlyValuesData, isLoading: isLoadingMonthlyValues } = useMonthlyValues({
    employeeId,
    year,
    month,
    enabled: !!employeeId,
  })

  // Create a map of date -> daily value
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

  // Calculate calendar grid with padding for first week
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1)
    const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday
    const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1 // Monday = 0

    const grid: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = Array(adjustedStartDay).fill(null)

    for (const date of dates) {
      currentWeek.push(date)
      if (currentWeek.length === 7) {
        grid.push(currentWeek)
        currentWeek = []
      }
    }

    // Pad last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      grid.push(currentWeek)
    }

    return grid
  }, [year, month, dates])

  const isLoading = isLoadingDailyValues || isLoadingMonthlyValues
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="space-y-6">
      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'text-center text-sm font-medium py-2',
                  index >= 5 && 'text-muted-foreground'
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

                  return (
                    <button
                      key={dayIndex}
                      onClick={() => onDayClick?.(date)}
                      className={cn(
                        'min-h-[80px] p-2 rounded-lg border text-left transition-colors',
                        'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
                        today && 'ring-2 ring-primary bg-primary/5',
                        weekend && !dailyValue?.target_minutes && 'bg-muted/30',
                        dailyValue?.has_errors && 'border-destructive/50'
                      )}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          'text-sm font-medium',
                          today && 'text-primary'
                        )}>
                          {date.getDate()}
                        </span>
                        <ErrorBadge errors={dailyValue?.errors as never} />
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mb-1">
                        {dailyValue?.is_holiday && (
                          <Badge variant="secondary" className="text-[10px] px-1">H</Badge>
                        )}
                        {dailyValue?.is_absence && (
                          <Badge variant="outline" className="text-[10px] px-1">A</Badge>
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
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No data</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly summary */}
      {monthlyValue && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium mb-3">Monthly Summary</h3>
          <DailySummary
            targetMinutes={monthlyValue.target_minutes}
            grossMinutes={monthlyValue.gross_minutes}
            breakMinutes={monthlyValue.break_minutes}
            netMinutes={monthlyValue.net_minutes}
            balanceMinutes={monthlyValue.balance_minutes}
            layout="horizontal"
          />
          <div className="flex items-center gap-6 mt-3 text-sm text-muted-foreground">
            <span>Working days: {monthlyValue.working_days}</span>
            <span>Worked days: {monthlyValue.worked_days}</span>
            <span>Absence days: {monthlyValue.absence_days}</span>
            <span>Holiday days: {monthlyValue.holiday_days}</span>
            <span>Status: {monthlyValue.status}</span>
          </div>
        </div>
      )}
    </div>
  )
}
