'use client'

import { useMemo, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQueries } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { QueryError } from '@/components/ui/query-error'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  employeeInitials: string
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
      const employeeInitials = `${firstName[0] ?? '?'}${lastName[0] ?? '?'}`

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
        staleTime: 60 * 1000,
        select: (data: Array<Record<string, unknown>>) => ({
          employeeName,
          employeeInitials,
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
      const { employeeName, employeeInitials, absences } = query.data

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const absence of absences as any[]) {
        entries.push({
          employeeName,
          employeeInitials,
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
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="pb-3 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            {t('upcomingAbsences')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
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
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="pb-3 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            {t('upcomingAbsences')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="space-y-3">
            <Skeleton className="h-64 w-full rounded-lg" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="pb-3 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            {t('upcomingAbsences')}
          </CardTitle>
          {allAbsences.length > 0 && (
            <Badge variant="secondary" className="tabular-nums text-xs">
              {allAbsences.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
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
            <div className="space-y-1.5">
              {displayedAbsences.map((absence, i) => (
                <div
                  key={`${absence.absenceDate}-${absence.employeeName}-${i}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <Avatar size="sm">
                    <AvatarFallback className="text-[10px] font-semibold">
                      {absence.employeeInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {absence.employeeName}
                    </p>
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                      {formatRelativeDate(absence.absenceDate)}
                      {absence.halfDay && ` \u00b7 ${t('halfDayLabel')}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
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
