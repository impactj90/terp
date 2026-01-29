'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { parseISODate, isWeekend, isToday } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayYearCalendarProps {
  year: number
  holidays: Holiday[]
  onHolidayClick?: (holiday: Holiday) => void
  onDateClick?: (date: Date) => void
  className?: string
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  const startDayOfWeek = firstDay.getDay()
  const adjustedStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

  const grid: (Date | null)[][] = []
  let currentWeek: (Date | null)[] = Array(adjustedStart).fill(null)

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(year, month, day))
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

function getLocaleWeekDays(locale: string): string[] {
  // Generate narrow weekday names starting from Monday
  // 2024-01-01 is a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i)
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(d)
  })
}

function getLocaleMonthName(locale: string, year: number, month: number): string {
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(year, month, 1))
}

function getHolidayCategoryClasses(category: number): string {
  switch (category) {
    case 2:
      return 'bg-orange-300 text-orange-900 hover:bg-orange-400 dark:bg-orange-500/60 dark:text-orange-50 dark:hover:bg-orange-500/70'
    case 3:
      return 'bg-blue-500 text-white hover:bg-blue-600'
    default:
      return 'bg-red-500 text-white hover:bg-red-600'
  }
}

function MonthMiniCalendar({
  year,
  month,
  holidays,
  onHolidayClick,
  onDateClick,
}: {
  year: number
  month: number
  holidays: Holiday[]
  onHolidayClick?: (holiday: Holiday) => void
  onDateClick?: (date: Date) => void
}) {
  const locale = useLocale()
  const grid = React.useMemo(() => getMonthGrid(year, month), [year, month])
  const weekDays = React.useMemo(() => getLocaleWeekDays(locale), [locale])
  const monthName = React.useMemo(() => getLocaleMonthName(locale, year, month), [locale, year, month])

  const holidayMap = React.useMemo(() => {
    const map = new Map<string, Holiday>()
    for (const h of holidays) {
      const date = parseISODate(h.holiday_date)
      if (date.getMonth() === month && date.getFullYear() === year) {
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        map.set(key, h)
      }
    }
    return map
  }, [holidays, month, year])

  const getHoliday = (date: Date): Holiday | undefined => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    return holidayMap.get(key)
  }

  const handleClick = (date: Date) => {
    const holiday = getHoliday(date)
    if (holiday) {
      onHolidayClick?.(holiday)
    } else {
      onDateClick?.(date)
    }
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-center">{monthName}</h3>

      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px">
        {weekDays.map((day, i) => (
          <div
            key={i}
            className={cn(
              'text-center text-[10px] font-medium py-0.5',
              i >= 5 && 'text-muted-foreground'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-px">
        {grid.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-px">
            {week.map((date, dayIndex) => {
              if (!date) {
                return <div key={dayIndex} className="h-5" />
              }

              const holiday = getHoliday(date)
              const isHolidayDate = !!holiday
              const holidayCategory = holiday?.category ?? 1
              const weekend = isWeekend(date)
              const today = isToday(date)

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => handleClick(date)}
                  className={cn(
                    'h-5 w-full text-[10px] rounded-sm transition-colors',
                    'hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    today && 'ring-1 ring-primary',
                    weekend && !isHolidayDate && 'text-muted-foreground bg-muted/30',
                    isHolidayDate && getHolidayCategoryClasses(holidayCategory)
                  )}
                  title={holiday?.name}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HolidayYearCalendar({
  year,
  holidays,
  onHolidayClick,
  onDateClick,
  className,
}: HolidayYearCalendarProps) {
  const t = useTranslations('adminHolidays')

  return (
    <div className={cn('space-y-4', className)}>
      {/* Year grid - 4 columns x 3 rows */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, month) => (
          <div key={month} className="border rounded-lg p-2">
            <MonthMiniCalendar
              year={year}
              month={month}
              holidays={holidays}
              onHolidayClick={onHolidayClick}
              onDateClick={onDateClick}
            />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm justify-center">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-red-500" />
          <span className="text-muted-foreground">{t('legendCategoryFull')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-orange-300 dark:bg-orange-500/60" />
          <span className="text-muted-foreground">{t('legendCategoryHalf')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-blue-500" />
          <span className="text-muted-foreground">{t('legendCategoryCustom')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-muted/50" />
          <span className="text-muted-foreground">{t('legendWeekend')}</span>
        </div>
      </div>
    </div>
  )
}
