'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Users, Clock, CalendarOff, AlertTriangle } from 'lucide-react'
import { StatsCard } from '@/components/dashboard'
import { formatMinutes, formatBalance } from '@/lib/time-utils'
import type { TeamDailyValuesResult } from '@/hooks/api/use-team-daily-values'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DayViewData = Record<string, any> | null | undefined

interface TeamStatsCardsProps {
  members: TeamMember[]
  dayViewsData: DayViewData[]
  dayViewsLoading: boolean
  rangeDailyValues: TeamDailyValuesResult[]
  rangeLoading: boolean
  rangeFrom: string
  rangeTo: string
}

/**
 * Grid of stat cards showing team-level metrics.
 * Cards: Present Today, Team Hours (range), Absences Today, Issues, and range summaries.
 *
 * Today-focused cards derive data from dayViewsData (pre-fetched).
 * Range cards derive data from rangeDailyValues.
 */
export function TeamStatsCards({
  members,
  dayViewsData,
  dayViewsLoading,
  rangeDailyValues,
  rangeLoading,
  rangeFrom,
  rangeTo,
}: TeamStatsCardsProps) {
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

  const rangeStats = useMemo(() => {
    let totalNetMinutes = 0
    let totalTargetMinutes = 0
    let totalOvertimeMinutes = 0
    let totalUndertimeMinutes = 0
    let absenceDays = 0

    for (const result of rangeDailyValues) {
      for (const dv of result.values ?? []) {
        totalNetMinutes += dv.net_minutes ?? 0
        totalTargetMinutes += dv.target_minutes ?? 0
        totalOvertimeMinutes += dv.overtime_minutes ?? 0
        totalUndertimeMinutes += dv.undertime_minutes ?? 0
        if (dv.is_absence) {
          absenceDays += 1
        }
      }
    }

    const totalBalance = totalOvertimeMinutes - totalUndertimeMinutes
    const avgBalance = members.length > 0 ? Math.round(totalBalance / members.length) : 0

    return {
      totalNetMinutes,
      totalTargetMinutes,
      totalOvertimeMinutes,
      totalUndertimeMinutes,
      totalBalance,
      avgBalance,
      absenceDays,
    }
  }, [members.length, rangeDailyValues])

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

      {/* Team Hours (Selected Range) */}
      <StatsCard
        title={t('teamHoursInRange')}
        value={rangeLoading ? '-' : formatMinutes(rangeStats.totalNetMinutes)}
        description={t('targetLabel', { time: formatMinutes(rangeStats.totalTargetMinutes) })}
        icon={Clock}
        isLoading={rangeLoading && members.length === 0}
      />

      {/* Avg Overtime (per member) */}
      <StatsCard
        title={t('avgOvertime')}
        value={rangeLoading ? '-' : formatBalance(rangeStats.avgBalance)}
        description={t('rangeLabel', { from: rangeFrom, to: rangeTo })}
        icon={Clock}
        isLoading={rangeLoading && members.length === 0}
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

      {/* Absence Days (range) */}
      <StatsCard
        title={t('absenceDaysInRange')}
        value={rangeLoading ? '-' : String(rangeStats.absenceDays)}
        description={t('rangeLabel', { from: rangeFrom, to: rangeTo })}
        icon={CalendarOff}
        isLoading={rangeLoading && members.length === 0}
      />

      {/* Overtime / Undertime totals */}
      <StatsCard
        title={t('totalOvertime')}
        value={rangeLoading ? '-' : formatMinutes(rangeStats.totalOvertimeMinutes)}
        description={t('rangeLabel', { from: rangeFrom, to: rangeTo })}
        icon={Clock}
        isLoading={rangeLoading && members.length === 0}
      />
      <StatsCard
        title={t('totalUndertime')}
        value={rangeLoading ? '-' : formatMinutes(rangeStats.totalUndertimeMinutes)}
        description={t('rangeLabel', { from: rangeFrom, to: rangeTo })}
        icon={Clock}
        isLoading={rangeLoading && members.length === 0}
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
