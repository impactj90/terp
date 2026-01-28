'use client'

import { useMemo, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQueries } from '@tanstack/react-query'
import { CalendarOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { api } from '@/lib/api'
import { formatDate, formatRelativeDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

interface TeamUpcomingAbsencesProps {
  members: TeamMember[]
  from: string
  to: string
}

interface AbsenceEntry {
  employeeName: string
  absenceDate: string
  absenceTypeName: string
  halfDay: boolean
}

const MAX_ENTRIES = 10

/**
 * Card showing upcoming absences across all team members for the selected range.
 * Fetches absences per member in parallel and merges into a sorted list.
 */
export function TeamUpcomingAbsences({ members, from, to }: TeamUpcomingAbsencesProps) {
  const t = useTranslations('teamOverview')

  const fromDate = from
  const toDate = to
  const fromDateObj = useMemo(() => parseISODate(fromDate), [fromDate])
  const toDateObj = useMemo(() => parseISODate(toDate), [toDate])
  const [month, setMonth] = useState(fromDateObj)

  useEffect(() => {
    setMonth(fromDateObj)
  }, [fromDateObj])

  // Fetch absences per member in parallel
  const absenceQueries = useQueries({
    queries: members.map((m) => ({
      queryKey: ['/employees/{id}/absences', undefined, { id: m.employee_id }, { from: fromDate, to: toDate }],
      queryFn: async () => {
        const { data, error } = await api.GET('/employees/{id}/absences' as never, {
          params: {
            path: { id: m.employee_id },
            query: { from: fromDate, to: toDate },
          },
        } as never)
        if (error) throw error

        const firstName = m.employee?.first_name ?? ''
        const lastName = m.employee?.last_name ?? ''
        const employeeName = m.employee
          ? `${firstName} ${lastName}`
          : t('unknown')

        return {
          employeeName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          absences: (data as any)?.data ?? [],
        }
      },
      enabled: members.length > 0 && !!m.employee_id,
      staleTime: 60 * 1000, // 1 minute stale time
    })),
  })

  const isLoading = absenceQueries.some((q) => q.isLoading)

  // Merge all absences into a single sorted list
  const allAbsences = useMemo(() => {
    const entries: AbsenceEntry[] = []

    for (const query of absenceQueries) {
      if (!query.data) continue
      const { employeeName, absences } = query.data

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const absence of absences as any[]) {
        entries.push({
          employeeName,
          absenceDate: absence.absence_date ?? absence.date ?? '',
          absenceTypeName: absence.absence_type?.name ?? absence.type ?? t('absence'),
          halfDay: absence.is_half_day ?? false,
        })
      }
    }

    // Sort by date ascending
    entries.sort((a, b) => a.absenceDate.localeCompare(b.absenceDate))

    return entries
  }, [absenceQueries])

  const absenceDates = useMemo(() => {
    const unique = new Map<string, Date>()
    for (const entry of allAbsences) {
      const dateObj = parseISODate(entry.absenceDate)
      unique.set(formatDate(dateObj), dateObj)
    }
    return Array.from(unique.values())
  }, [allAbsences])

  const displayedAbsences = allAbsences.slice(0, MAX_ENTRIES)
  const hasMore = allAbsences.length > MAX_ENTRIES

  if (isLoading && members.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5" />
            {t('upcomingAbsences')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5" />
          {t('upcomingAbsences')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30">
            <Calendar
              month={month}
              onMonthChange={setMonth}
              mode="single"
              selected={undefined}
              absences={absenceDates}
              minDate={fromDateObj}
              maxDate={toDateObj}
            />
          </div>

          {displayedAbsences.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('noUpcomingAbsences')}
            </p>
          ) : (
            <div className="space-y-3">
              {displayedAbsences.map((absence, i) => (
                <div
                  key={`${absence.absenceDate}-${absence.employeeName}-${i}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{absence.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeDate(absence.absenceDate)}
                      {absence.halfDay && ` ${t('halfDayLabel')}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {absence.absenceTypeName}
                  </Badge>
                </div>
              ))}

              {hasMore && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  {t('moreAbsences', { count: allAbsences.length - MAX_ENTRIES })}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
