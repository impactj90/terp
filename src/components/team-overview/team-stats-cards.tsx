'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  Users,
  Clock,
  CalendarOff,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinutes, formatBalance } from '@/lib/time-utils'
import { cn } from '@/lib/utils'
import type { TeamDailyValuesResult } from '@/hooks/use-team-daily-values'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TeamMember = any

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
    const absenceCount = 0
    let issueCount = 0

    for (const dv of dayViewsData) {
      if (!dv) continue

      const dailyValue = dv.dailyValue
      const hasErrors = dailyValue?.hasError ?? false

      // Check if currently present (last work booking direction is 'in')
      const bookings = dv.bookings ?? []
      const workBookings = bookings.filter(
        (b: { bookingType?: { direction?: string } }) =>
          b.bookingType?.direction === 'in' || b.bookingType?.direction === 'out'
      )
      if (workBookings.length > 0) {
        const sorted = [...workBookings].sort(
          (a: { editedTime?: number }, b: { editedTime?: number }) =>
            (a.editedTime ?? 0) - (b.editedTime ?? 0)
        )
        const last = sorted[sorted.length - 1] as { bookingType?: { direction?: string } }
        if (last?.bookingType?.direction === 'in') {
          presentCount++
        }
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
        totalUndertimeMinutes += dv.undertime ?? 0
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

  const dayLoading = dayViewsLoading && members.length === 0
  const rngLoading = rangeLoading && members.length === 0

  if (dayLoading || rngLoading) {
    return <StatsCardsSkeleton />
  }

  const presencePct =
    members.length > 0 ? (todayStats.presentCount / members.length) * 100 : 0

  return (
    <div className="space-y-3">
      {/* Primary metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Present Today */}
        <div className="group rounded-xl border bg-card p-3.5 sm:p-5 transition-colors hover:bg-accent/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                {t('presentToday')}
              </p>
              <div className="mt-1 sm:mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                  {dayViewsLoading ? '\u2013' : todayStats.presentCount}
                </span>
                <span className="text-sm sm:text-base font-medium text-muted-foreground">
                  / {members.length}
                </span>
              </div>
            </div>
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          {members.length > 0 && !dayViewsLoading && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
                  style={{ width: `${presencePct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Team Hours */}
        <div className="group rounded-xl border bg-card p-3.5 sm:p-5 transition-colors hover:bg-accent/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                {t('teamHoursInRange')}
              </p>
              <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                {rangeLoading ? '\u2013' : formatMinutes(rangeStats.totalNetMinutes)}
              </p>
              <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-muted-foreground">
                {t('targetLabel', {
                  time: formatMinutes(rangeStats.totalTargetMinutes),
                })}
              </p>
            </div>
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/20">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Avg Balance */}
        <div className="group rounded-xl border bg-card p-3.5 sm:p-5 transition-colors hover:bg-accent/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                {t('avgOvertime')}
              </p>
              <p
                className={cn(
                  'mt-1 sm:mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight',
                  rangeStats.avgBalance > 0 &&
                    'text-emerald-600 dark:text-emerald-400',
                  rangeStats.avgBalance < 0 &&
                    'text-rose-600 dark:text-rose-400'
                )}
              >
                {rangeLoading ? '\u2013' : formatBalance(rangeStats.avgBalance)}
              </p>
              <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                {t('rangeLabel', { from: rangeFrom, to: rangeTo })}
              </p>
            </div>
            <div
              className={cn(
                'flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl',
                rangeStats.avgBalance > 0
                  ? 'bg-emerald-500/10 dark:bg-emerald-500/20'
                  : rangeStats.avgBalance < 0
                    ? 'bg-rose-500/10 dark:bg-rose-500/20'
                    : 'bg-muted'
              )}
            >
              {rangeStats.avgBalance > 0 ? (
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
              ) : rangeStats.avgBalance < 0 ? (
                <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-rose-600 dark:text-rose-400" />
              ) : (
                <Minus className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>

        {/* Issues */}
        <div className="group rounded-xl border bg-card p-3.5 sm:p-5 transition-colors hover:bg-accent/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                {t('issues')}
              </p>
              <p
                className={cn(
                  'mt-1 sm:mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight',
                  todayStats.issueCount > 0 &&
                    'text-amber-600 dark:text-amber-400'
                )}
              >
                {dayViewsLoading ? '\u2013' : todayStats.issueCount}
              </p>
              <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-muted-foreground">
                {todayStats.issueCount === 0
                  ? t('allClear')
                  : t('needsAttention')}
              </p>
            </div>
            <div
              className={cn(
                'flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl',
                todayStats.issueCount > 0
                  ? 'bg-amber-500/10 dark:bg-amber-500/20'
                  : 'bg-muted'
              )}
            >
              <AlertTriangle
                className={cn(
                  'h-4 w-4 sm:h-5 sm:w-5',
                  todayStats.issueCount > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
                )}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary compact metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3">
          <CalendarOff className="h-4 w-4 shrink-0 text-sky-500" />
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {dayViewsLoading ? '\u2013' : todayStats.absenceCount}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground truncate">
              {t('absencesToday')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3">
          <CalendarOff className="h-4 w-4 shrink-0 text-violet-500" />
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {rangeLoading ? '\u2013' : rangeStats.absenceDays}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground truncate">
              {t('absenceDaysInRange')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3">
          <TrendingUp className="h-4 w-4 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {rangeLoading
                ? '\u2013'
                : formatMinutes(rangeStats.totalOvertimeMinutes)}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground truncate">
              {t('totalOvertime')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3">
          <TrendingDown className="h-4 w-4 shrink-0 text-rose-500" />
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {rangeLoading
                ? '\u2013'
                : formatMinutes(rangeStats.totalUndertimeMinutes)}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground truncate">
              {t('totalUndertime')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatsCardsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-card p-5"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border px-4 py-3">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
