'use client'

import * as React from 'react'
import { Calendar, type DateRange } from '@/components/ui/calendar'
import { useHolidays, useEmployeeAbsences } from '@/hooks/api'
import { formatDate, parseISODate, getMonthRange } from '@/lib/time-utils'

interface AbsenceCalendarViewProps {
  /** Employee ID to show absences for */
  employeeId?: string
  /** Callback when a date is clicked */
  onDateClick?: (date: Date) => void
  /** Additional className */
  className?: string
}

export function AbsenceCalendarView({
  employeeId,
  onDateClick,
  className,
}: AbsenceCalendarViewProps) {
  const [month, setMonth] = React.useState(() => new Date())

  // Get date range for the displayed month (with some padding for calendar view)
  const { start, end } = React.useMemo(() => {
    const range = getMonthRange(month)
    // Pad by a week on each side to account for calendar grid
    const padStart = new Date(range.start)
    padStart.setDate(padStart.getDate() - 7)
    const padEnd = new Date(range.end)
    padEnd.setDate(padEnd.getDate() + 7)
    return { start: padStart, end: padEnd }
  }, [month])

  // Fetch holidays for the visible range
  const { data: holidaysData } = useHolidays({
    from: formatDate(start),
    to: formatDate(end),
    enabled: true,
  })

  // Fetch absences for the visible range
  const { data: absencesData } = useEmployeeAbsences(employeeId ?? '', {
    from: formatDate(start),
    to: formatDate(end),
    enabled: !!employeeId,
  })

  // Convert holidays to Date array
  const holidays = React.useMemo(
    () => holidaysData?.map((h) => parseISODate(h.holiday_date)) ?? [],
    [holidaysData]
  )

  // Expand absence dates (each absence is a single date)
  const absenceDates = React.useMemo(() => {
    const dates: Date[] = []
    for (const absence of absencesData?.data ?? []) {
      dates.push(parseISODate(absence.absence_date))
    }
    return dates
  }, [absencesData])

  const handleSelect = (value: Date | DateRange | undefined) => {
    if (value instanceof Date) {
      onDateClick?.(value)
    }
  }

  return (
    <div className={className}>
      <Calendar
        mode="single"
        month={month}
        onMonthChange={setMonth}
        onSelect={handleSelect}
        holidays={holidays}
        absences={absenceDates}
        className="w-full"
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Your absence</span>
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground mt-2">
        Click any date to create a new absence request
      </p>
    </div>
  )
}
