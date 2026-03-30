'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDate, formatDisplayDate, parseISODate } from '@/lib/time-utils'
import { cn } from '@/lib/utils'
import type { TeamDailyValuesResult } from '@/hooks/use-team-daily-values'

interface AttendancePoint {
  date: Date
  count: number
  isWeekend: boolean
}

interface TeamAttendancePatternProps {
  rangeDailyValues: TeamDailyValuesResult[]
  rangeLoading: boolean
  rangeFrom: string
  rangeTo: string
  membersCount: number
}

function buildDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const current = new Date(start)
  current.setHours(0, 0, 0, 0)
  const endDate = new Date(end)
  endDate.setHours(0, 0, 0, 0)

  while (current <= endDate) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

export function TeamAttendancePattern({
  rangeDailyValues,
  rangeLoading,
  rangeFrom,
  rangeTo,
  membersCount,
}: TeamAttendancePatternProps) {
  const t = useTranslations('teamOverview')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  const { points, maxCount } = useMemo(() => {
    let start = parseISODate(rangeFrom)
    let end = parseISODate(rangeTo)
    if (start > end) {
      const temp = start
      start = end
      end = temp
    }
    const dateRange = buildDateRange(start, end)

    const counts = new Map<string, number>()

    for (const result of rangeDailyValues) {
      for (const dv of result.values ?? []) {
        const valueDate = dv.value_date
        if (!valueDate) continue
        const key = valueDate.split('T')[0]
        if (!key) continue
        const isAbsence = dv.is_absence ?? false
        const netMinutes = dv.net_minutes ?? 0
        if (isAbsence || netMinutes <= 0) continue
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }

    const points: AttendancePoint[] = dateRange.map((date) => {
      const day = date.getDay()
      return {
        date,
        count: counts.get(formatDate(date)) ?? 0,
        isWeekend: day === 0 || day === 6,
      }
    })

    const maxCount = Math.max(1, ...points.map((point) => point.count))

    return { points, maxCount }
  }, [rangeDailyValues, rangeFrom, rangeTo])

  if (rangeLoading) {
    return (
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="pb-3 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {t('attendancePattern')}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <Skeleton className="h-36 w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  const hasData = points.some((point) => point.count > 0)
  const labelFormat = points.length <= 7 ? 'weekday' : 'short'

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="pb-3 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              {t('attendancePattern')}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('rangeLabel', { from: rangeFrom, to: rangeTo })}
            </p>
          </div>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {!hasData ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {tCommon('noDataAvailable')}
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <div className="relative">
              {/* Y-axis gridlines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-full border-t border-dashed border-muted-foreground/10"
                  />
                ))}
              </div>

              {/* Bars */}
              <div className="relative flex items-end gap-1.5 h-36">
                {points.map((point) => {
                  const height =
                    point.count > 0 ? (point.count / maxCount) * 100 : 0
                  const label = formatDisplayDate(
                    point.date,
                    labelFormat,
                    locale
                  )
                  const pct =
                    membersCount > 0
                      ? Math.round((point.count / membersCount) * 100)
                      : 0

                  return (
                    <Tooltip key={formatDate(point.date)}>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center flex-1 h-full">
                          <div className="relative w-full flex-1 flex items-end">
                            {/* Background track */}
                            <div
                              className={cn(
                                'absolute inset-0 rounded-t-sm',
                                point.isWeekend
                                  ? 'bg-muted/60'
                                  : 'bg-muted/30'
                              )}
                            />
                            {/* Fill bar */}
                            <div
                              className={cn(
                                'relative w-full rounded-t-sm transition-all duration-500 ease-out',
                                point.isWeekend
                                  ? 'bg-emerald-400/50 dark:bg-emerald-500/40'
                                  : 'bg-emerald-500 dark:bg-emerald-400'
                              )}
                              style={{
                                height: `${height}%`,
                                minHeight: point.count > 0 ? '4px' : '0',
                              }}
                            />
                          </div>
                          <span
                            className={cn(
                              'mt-1.5 text-[10px] leading-none',
                              point.isWeekend
                                ? 'text-muted-foreground/50'
                                : 'text-muted-foreground'
                            )}
                          >
                            {label}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p className="font-medium">
                          {formatDisplayDate(point.date, 'short', locale)}
                        </p>
                        <p className="text-muted-foreground">
                          {t('attendancePatternValue', {
                            count: point.count,
                            total: membersCount,
                            date: label,
                          })}
                          {' '}({pct}%)
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}
