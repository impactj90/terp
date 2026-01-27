'use client'

import { useTranslations } from 'next-intl'
import { CalendarCheck, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeAbsences } from '@/hooks/api'
import { formatDisplayDate, formatDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface UpcomingVacationProps {
  employeeId: string
  className?: string
}

export function UpcomingVacation({
  employeeId,
  className,
}: UpcomingVacationProps) {
  const t = useTranslations('vacation')
  const tc = useTranslations('common')
  const today = new Date()
  const from = formatDate(today)
  // Look ahead 6 months
  const toDate = new Date(today)
  toDate.setMonth(toDate.getMonth() + 6)
  const to = formatDate(toDate)

  const { data, isLoading, error } = useEmployeeAbsences(employeeId, {
    from,
    to,
    enabled: !!employeeId,
  })

  // Filter to upcoming approved vacation only
  const upcomingVacation = (data?.data ?? [])
    .filter(
      (absence: Absence) =>
        absence.absence_type?.category === 'vacation' &&
        (absence.status === 'approved' || absence.status === 'pending')
    )
    .sort((a, b) => {
      const dateA = a.absence_date ? new Date(a.absence_date).getTime() : 0
      const dateB = b.absence_date ? new Date(b.absence_date).getTime() : 0
      return dateA - dateB
    })

  // Group consecutive days together
  const groupedVacations = groupConsecutiveDays(upcomingVacation)

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            {t('upcomingTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{tc('failedToLoad')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          {t('upcomingTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groupedVacations.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            {t('noUpcoming')}
          </p>
        ) : (
          <div className="space-y-3">
            {groupedVacations.slice(0, 5).map((group, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="font-medium">
                    {formatDisplayDate(new Date(group.startDate), 'short')}
                    {group.endDate !== group.startDate && (
                      <>
                        <ArrowRight className="mx-1 inline h-3 w-3" />
                        {formatDisplayDate(new Date(group.endDate), 'short')}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {group.totalDays === 1
                      ? t('oneDay')
                      : t('countDays', { count: group.totalDays })}
                  </span>
                  {group.hasPending && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      {t('pending')}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface VacationGroup {
  startDate: string
  endDate: string
  totalDays: number
  hasPending: boolean
}

function groupConsecutiveDays(absences: Absence[]): VacationGroup[] {
  if (absences.length === 0) return []

  const groups: VacationGroup[] = []
  let currentGroup: VacationGroup | null = null

  for (const absence of absences) {
    if (!absence.absence_date) continue

    const date = absence.absence_date
    const duration = absence.duration ?? 1
    const isPending = absence.status === 'pending'

    if (!currentGroup) {
      currentGroup = {
        startDate: date,
        endDate: date,
        totalDays: duration,
        hasPending: isPending,
      }
      continue
    }

    // Check if this date is consecutive (next day)
    const lastDate = new Date(currentGroup.endDate)
    const thisDate = new Date(date)
    const diffDays = Math.floor(
      (thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays <= 1) {
      // Consecutive - extend current group
      currentGroup.endDate = date
      currentGroup.totalDays += duration
      currentGroup.hasPending = currentGroup.hasPending || isPending
    } else {
      // Not consecutive - start new group
      groups.push(currentGroup)
      currentGroup = {
        startDate: date,
        endDate: date,
        totalDays: duration,
        hasPending: isPending,
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup)
  }

  return groups
}
