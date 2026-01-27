'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQueries } from '@tanstack/react-query'
import { Users, Clock, CalendarOff, AlertTriangle } from 'lucide-react'
import { StatsCard } from '@/components/dashboard'
import { formatMinutes, getWeekStart, formatDate } from '@/lib/time-utils'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DayViewData = Record<string, any> | null | undefined

interface TeamStatsCardsProps {
  members: TeamMember[]
  dayViewsData: DayViewData[]
  dayViewsLoading: boolean
}

async function fetchDailyValues(employeeId: string, year: number, month: number) {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()

  const response = await fetch(
    `${clientEnv.apiUrl}/employees/${employeeId}/months/${year}/${month}/days`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
      },
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || 'Request failed')
  }

  return response.json()
}

/**
 * Grid of 4 stat cards showing team-level metrics.
 * Cards: Present Today, Team Hours This Week, Absences Today, Issues.
 *
 * Cards 1, 3, 4 derive data from the dayViewsData prop (pre-fetched).
 * Card 2 fetches weekly data per member using parallel queries.
 */
export function TeamStatsCards({ members, dayViewsData, dayViewsLoading }: TeamStatsCardsProps) {
  const t = useTranslations('teamOverview')

  // Compute today stats from dayViewsData
  const todayStats = useMemo(() => {
    let presentCount = 0
    let absenceCount = 0
    let issueCount = 0

    for (const dv of dayViewsData) {
      if (!dv) continue

      const dailyValue = dv.daily_value
      const isAbsence = dailyValue?.is_absence ?? false
      const hasErrors = dailyValue?.has_errors ?? dailyValue?.has_error ?? false

      if (isAbsence) {
        absenceCount++
        continue
      }

      // Check if present (has bookings)
      const bookings = dv.bookings ?? []
      const workBookings = bookings.filter(
        (b: { booking_type?: { direction?: string } }) =>
          b.booking_type?.direction === 'in' || b.booking_type?.direction === 'out'
      )
      if (workBookings.length > 0) {
        presentCount++
      }

      if (hasErrors) {
        issueCount++
      }
    }

    return { presentCount, absenceCount, issueCount }
  }, [dayViewsData])

  // Fetch weekly data per member for "Team Hours This Week"
  const weekStart = formatDate(getWeekStart())
  const weekDate = new Date(weekStart)
  const weekYear = weekDate.getFullYear()
  const weekMonth = weekDate.getMonth() + 1

  const weeklyQueries = useQueries({
    queries: members.map((m) => ({
      queryKey: ['employees', m.employee_id, 'months', weekYear, weekMonth, 'days'],
      queryFn: () => fetchDailyValues(m.employee_id, weekYear, weekMonth),
      enabled: members.length > 0,
      staleTime: 60 * 1000, // 1 minute stale for weekly data
    })),
  })

  const weeklyStats = useMemo(() => {
    let totalNetMinutes = 0
    let totalTargetMinutes = 0

    // Filter daily values to current week only
    const weekStartDate = getWeekStart()
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 6)

    for (const query of weeklyQueries) {
      if (!query.data?.data) continue
      for (const dv of query.data.data) {
        // Filter to current week dates
        const valueDate = new Date(dv.value_date)
        if (valueDate >= weekStartDate && valueDate <= weekEndDate) {
          totalNetMinutes += dv.net_time ?? dv.net_minutes ?? 0
          totalTargetMinutes += dv.target_time ?? dv.target_minutes ?? 0
        }
      }
    }

    return { totalNetMinutes, totalTargetMinutes }
  }, [weeklyQueries])

  const weeklyLoading = weeklyQueries.some((q) => q.isLoading)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Present Today */}
      <StatsCard
        title={t('presentToday')}
        value={dayViewsLoading ? '-' : String(todayStats.presentCount)}
        description={t('ofMembers', { count: todayStats.presentCount, total: members.length })}
        icon={Users}
        isLoading={dayViewsLoading && members.length === 0}
      />

      {/* Team Hours This Week */}
      <StatsCard
        title={t('teamHoursThisWeek')}
        value={weeklyLoading ? '-' : formatMinutes(weeklyStats.totalNetMinutes)}
        description={t('targetLabel', { time: formatMinutes(weeklyStats.totalTargetMinutes) })}
        icon={Clock}
        isLoading={weeklyLoading && members.length === 0}
      />

      {/* Absences Today */}
      <StatsCard
        title={t('absencesToday')}
        value={dayViewsLoading ? '-' : String(todayStats.absenceCount)}
        description={
          todayStats.absenceCount === 0
            ? t('noAbsences')
            : todayStats.absenceCount === 1
              ? t('memberAbsent', { count: todayStats.absenceCount })
              : t('membersAbsent', { count: todayStats.absenceCount })
        }
        icon={CalendarOff}
        isLoading={dayViewsLoading && members.length === 0}
      />

      {/* Issues */}
      <StatsCard
        title={t('issues')}
        value={dayViewsLoading ? '-' : String(todayStats.issueCount)}
        description={
          todayStats.issueCount === 0
            ? t('allClear')
            : t('needsAttention')
        }
        icon={AlertTriangle}
        isLoading={dayViewsLoading && members.length === 0}
      />
    </div>
  )
}
