'use client'

import { useMemo, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQueries } from '@tanstack/react-query'
import { CalendarOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { QueryError } from '@/components/ui/query-error'
import { useTRPC } from '@/trpc'
import { formatDate, formatRelativeDate, parseISODate } from '@/lib/time-utils'
interface TeamMember {
  teamId: string
  employeeId: string
  role: string
  joinedAt: Date | string
  employee?: {
    id: string
    firstName: string
    lastName: string
  }
}

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
  const trpc = useTRPC()

  const fromDate = from
  const toDate = to
  const fromDateObj = useMemo(() => parseISODate(fromDate), [fromDate])
  const toDateObj = useMemo(() => parseISODate(toDate), [toDate])
  const [month, setMonth] = useState(fromDateObj)

  useEffect(() => {
    setMonth(fromDateObj)
  }, [fromDateObj])

  // Fetch absences per member in parallel via tRPC
  const absenceQueries = useQueries({
    queries: members.map((m) => {
      const firstName = m.employee?.firstName ?? ''
      const lastName = m.employee?.lastName ?? ''
      const employeeName = m.employee
        ? `${firstName} ${lastName}`
        : t('unknown')

      return {
        ...trpc.absences.forEmployee.queryOptions(
          {
            employeeId: m.employeeId,
            fromDate,
            toDate,
          },
          {
            enabled: members.length > 0 && !!m.employeeId,
          }
        ),
        staleTime: 60 * 1000, // 1 minute stale time
        select: (data: Array<Record<string, unknown>>) => ({
          employeeName,
          absences: data ?? [],
        }),
      }
    }),
  })

  const isLoading = absenceQueries.some((q) => q.isLoading)
  const hasError = absenceQueries.some((q) => q.isError)

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
          absenceDate: absence.absenceDate ?? absence.absence_date ?? absence.date ?? '',
          absenceTypeName: absence.absenceType?.name ?? absence.absence_type?.name ?? absence.type ?? t('absence'),
          halfDay: absence.isHalfDay ?? absence.is_half_day ?? false,
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

  if (hasError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5" />
            {t('upcomingAbsences')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QueryError
            message={t('loadFailed')}
            onRetry={() => absenceQueries.forEach((q) => q.refetch())}
          />
        </CardContent>
      </Card>
    )
  }

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
