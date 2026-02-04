'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { formatDate, formatDisplayDate, isWeekend, isToday } from '@/lib/time-utils'
import { DayPlanCell } from './day-plan-cell'
import { DayPlanGridSkeleton } from './day-plan-grid-skeleton'
import type { components } from '@/lib/api/types'

type EmployeeDayPlan = components['schemas']['EmployeeDayPlan']

interface DayPlanCalendarGridProps {
  employees: Array<{
    id: string
    first_name: string
    last_name: string
    personnel_number?: string
  }>
  dayPlanAssignments: EmployeeDayPlan[]
  dates: Date[]
  onCellClick: (
    employeeId: string,
    date: Date,
    existingPlan: EmployeeDayPlan | null
  ) => void
  isLoading: boolean
}

export function DayPlanCalendarGrid({
  employees,
  dayPlanAssignments,
  dates,
  onCellClick,
  isLoading,
}: DayPlanCalendarGridProps) {
  const t = useTranslations('employeeDayPlans')
  const locale = useLocale()

  // Build lookup map: "employeeId-YYYY-MM-DD" -> EmployeeDayPlan
  // plan_date comes as RFC3339 from backend (e.g. "2026-02-03T00:00:00Z"), normalize to date-only
  const assignmentMap = React.useMemo(() => {
    const map = new Map<string, EmployeeDayPlan>()
    for (const plan of dayPlanAssignments) {
      const dateStr = typeof plan.plan_date === 'string'
        ? plan.plan_date.substring(0, 10)
        : plan.plan_date
      const key = `${plan.employee_id}-${dateStr}`
      map.set(key, plan)
    }
    return map
  }, [dayPlanAssignments])

  if (isLoading) {
    return <DayPlanGridSkeleton rows={8} columns={dates.length || 7} />
  }

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {t('emptyTitle')}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t('emptySubtitle')}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* Header row */}
        <div
          className="grid gap-px border-b bg-muted/50"
          style={{
            gridTemplateColumns: `180px repeat(${dates.length}, minmax(60px, 1fr))`,
          }}
        >
          {/* Corner cell: "Employee" label */}
          <div className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center">
            {t('deleteRangeEmployee')}
          </div>
          {/* Date header cells */}
          {dates.map((date) => {
            const weekend = isWeekend(date)
            const today = isToday(date)
            return (
              <div
                key={formatDate(date)}
                className={cn(
                  'px-1 py-2 text-center text-xs font-medium',
                  weekend && 'text-muted-foreground bg-muted/30',
                  today && 'text-primary font-bold'
                )}
              >
                <div>{formatDisplayDate(date, 'weekday', locale)}</div>
                <div className="text-[10px]">
                  {date.getDate().toString().padStart(2, '0')}.
                  {(date.getMonth() + 1).toString().padStart(2, '0')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Employee rows */}
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="grid gap-px border-b last:border-b-0 hover:bg-accent/20 transition-colors"
            style={{
              gridTemplateColumns: `180px repeat(${dates.length}, minmax(60px, 1fr))`,
            }}
          >
            {/* Employee name cell */}
            <div className="sticky left-0 z-10 bg-background px-3 py-1 flex items-center min-h-[42px]">
              <div className="truncate">
                <span className="text-sm font-medium">
                  {employee.last_name}, {employee.first_name}
                </span>
                {employee.personnel_number && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({employee.personnel_number})
                  </span>
                )}
              </div>
            </div>
            {/* Date cells */}
            {dates.map((date) => {
              const dateStr = formatDate(date)
              const key = `${employee.id}-${dateStr}`
              const plan = assignmentMap.get(key) ?? null

              return (
                <div key={dateStr} className="p-0.5">
                  <DayPlanCell
                    dayPlan={plan}
                    date={date}
                    isWeekend={isWeekend(date)}
                    isToday={isToday(date)}
                    onClick={() => onCellClick(employee.id, date, plan)}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
