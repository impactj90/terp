'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  getMonthDates,
  isToday,
  isWeekend,
  isSameDay,
} from '@/lib/time-utils'

export interface DateRange {
  from?: Date
  to?: Date
}

interface CalendarProps {
  /** Current displayed month */
  month: Date
  /** Month navigation callback */
  onMonthChange?: (month: Date) => void

  /** Selection mode */
  mode: 'single' | 'range'
  /** Selected date(s) */
  selected?: Date | DateRange
  /** Selection callback */
  onSelect?: (value: Date | DateRange | undefined) => void

  /** Dates to highlight as holidays */
  holidays?: Date[]
  /** Dates to highlight as absences */
  absences?: Date[]

  /** Earliest selectable date */
  minDate?: Date
  /** Latest selectable date */
  maxDate?: Date
  /** Specific dates to disable */
  disabledDates?: Date[]

  /** Additional className */
  className?: string
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDayOfMonth = new Date(year, month, 1)
  const dates = getMonthDates(firstDayOfMonth)

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
}

function isInRange(date: Date, range: DateRange): boolean {
  if (!range.from || !range.to) return false
  return date >= range.from && date <= range.to
}

function isDateDisabled(
  date: Date,
  minDate?: Date,
  maxDate?: Date,
  disabledDates?: Date[]
): boolean {
  if (minDate && date < minDate) return true
  if (maxDate && date > maxDate) return true
  if (disabledDates?.some((d) => isSameDay(d, date))) return true
  return false
}

export function Calendar({
  month,
  onMonthChange,
  mode,
  selected,
  onSelect,
  holidays = [],
  absences = [],
  minDate,
  maxDate,
  disabledDates,
  className,
}: CalendarProps) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const calendarGrid = React.useMemo(
    () => getCalendarGrid(year, monthIndex),
    [year, monthIndex]
  )

  const monthLabel = month.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const handlePrevMonth = () => {
    const newMonth = new Date(year, monthIndex - 1, 1)
    onMonthChange?.(newMonth)
  }

  const handleNextMonth = () => {
    const newMonth = new Date(year, monthIndex + 1, 1)
    onMonthChange?.(newMonth)
  }

  const handleDayClick = (date: Date) => {
    if (isDateDisabled(date, minDate, maxDate, disabledDates)) return

    if (mode === 'single') {
      onSelect?.(date)
    } else {
      // Range mode
      const currentRange = selected as DateRange | undefined
      if (!currentRange?.from || (currentRange.from && currentRange.to)) {
        // Start new range
        onSelect?.({ from: date, to: undefined })
      } else {
        // Complete the range
        if (date < currentRange.from) {
          onSelect?.({ from: date, to: currentRange.from })
        } else {
          onSelect?.({ from: currentRange.from, to: date })
        }
      }
    }
  }

  const isSelected = (date: Date): boolean => {
    if (mode === 'single') {
      return selected instanceof Date && isSameDay(selected, date)
    }
    const range = selected as DateRange | undefined
    return (
      (range?.from && isSameDay(range.from, date)) ||
      (range?.to && isSameDay(range.to, date)) ||
      false
    )
  }

  const isRangeMiddle = (date: Date): boolean => {
    if (mode !== 'range') return false
    const range = selected as DateRange | undefined
    if (!range?.from || !range?.to) return false
    return isInRange(date, range) && !isSelected(date)
  }

  const isHoliday = (date: Date): boolean => {
    return holidays.some((h) => isSameDay(h, date))
  }

  const isAbsence = (date: Date): boolean => {
    return absences.some((a) => isSameDay(a, date))
  }

  return (
    <div className={cn('p-3', className)}>
      {/* Header with month navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handlePrevMonth}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous month</span>
        </Button>
        <h2 className="text-sm font-semibold">{monthLabel}</h2>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleNextMonth}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next month</span>
        </Button>
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_DAYS.map((day, index) => (
          <div
            key={day}
            className={cn(
              'text-center text-xs font-medium py-1',
              index >= 5 && 'text-muted-foreground'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {calendarGrid.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((date, dayIndex) => {
              if (!date) {
                return <div key={dayIndex} className="h-9" />
              }

              const today = isToday(date)
              const weekend = isWeekend(date)
              const selected_ = isSelected(date)
              const rangeMiddle = isRangeMiddle(date)
              const holiday = isHoliday(date)
              const absence = isAbsence(date)
              const disabled = isDateDisabled(
                date,
                minDate,
                maxDate,
                disabledDates
              )

              return (
                <button
                  key={dayIndex}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(date)}
                  className={cn(
                    'relative h-9 w-full rounded-md text-sm transition-colors',
                    'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    // Today indicator
                    today && 'ring-2 ring-primary',
                    // Weekend styling
                    weekend && !selected_ && !rangeMiddle && 'text-muted-foreground bg-muted/30',
                    // Selection styling
                    selected_ && 'bg-primary text-primary-foreground hover:bg-primary/90',
                    rangeMiddle && 'bg-primary/20',
                    // Disabled styling
                    disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                  )}
                >
                  <span>{date.getDate()}</span>
                  {/* Indicators */}
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {holiday && (
                      <span className="h-1 w-1 rounded-full bg-red-500" />
                    )}
                    {absence && (
                      <span className="h-1 w-1 rounded-full bg-blue-500" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
