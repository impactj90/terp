'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatDisplayDate, parseISODate } from '@/lib/time-utils'
import type { TeamDailyValuesResult } from '@/hooks/api/use-team-daily-values'

interface AttendancePoint {
  date: Date
  count: number
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

    const points: AttendancePoint[] = dateRange.map((date) => ({
      date,
      count: counts.get(formatDate(date)) ?? 0,
    }))

    const maxCount = Math.max(1, ...points.map((point) => point.count))

    return { points, maxCount }
  }, [rangeDailyValues, rangeFrom, rangeTo])

  if (rangeLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('attendancePattern')}
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-36 w-full" />
        </CardContent>
      </Card>
    )
  }

  const hasData = points.some((point) => point.count > 0)
  const labelFormat = points.length <= 7 ? 'weekday' : 'short'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">
            {t('attendancePattern')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('rangeLabel', { from: rangeFrom, to: rangeTo })}
          </p>
        </div>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {tCommon('noDataAvailable')}
          </div>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {points.map((point) => {
              const height = point.count > 0 ? (point.count / maxCount) * 100 : 0
              const label = formatDisplayDate(point.date, labelFormat, locale)
              return (
                <div key={formatDate(point.date)} className="flex flex-col items-center flex-1">
                  <div
                    className="relative w-full flex-1 flex items-end"
                    title={t('attendancePatternValue', {
                      count: point.count,
                      total: membersCount,
                      date: label,
                    })}
                  >
                    <div className="absolute inset-0 rounded-sm bg-muted/40" />
                    <div
                      className="relative w-full rounded-sm bg-emerald-500"
                      style={{ height: `${height}%`, minHeight: point.count > 0 ? '4px' : '0' }}
                    />
                  </div>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
