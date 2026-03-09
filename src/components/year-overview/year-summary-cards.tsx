'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Clock, TrendingUp, Target, Palmtree } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from '@/components/timesheet'
import { cn } from '@/lib/utils'

interface MonthlyValueData {
  id: string
  month?: number | null
  net_minutes?: number | null
  target_minutes?: number | null
  balance_minutes?: number | null
  working_days?: number | null
  worked_days?: number | null
  absence_days?: number | null
  status?: string | null
  account_balances?: Record<string, number> | null
}

interface YearSummaryCardsProps {
  monthlyValues: MonthlyValueData[]
  vacationUsed?: number | null
  vacationEntitlement?: number | null
  isLoading: boolean
}

export function YearSummaryCards({
  monthlyValues,
  vacationUsed,
  vacationEntitlement,
  isLoading,
}: YearSummaryCardsProps) {
  const t = useTranslations('yearOverview')
  const tCommon = useTranslations('common')

  // Aggregate values across all months
  const totals = useMemo(() => {
    return monthlyValues.reduce(
      (acc, mv) => ({
        targetMinutes: acc.targetMinutes + (mv.target_minutes ?? 0),
        netMinutes: acc.netMinutes + (mv.net_minutes ?? 0),
        workingDays: acc.workingDays + (mv.working_days ?? 0),
        workedDays: acc.workedDays + (mv.worked_days ?? 0),
        absenceDays: acc.absenceDays + (mv.absence_days ?? 0),
      }),
      {
        targetMinutes: 0,
        netMinutes: 0,
        workingDays: 0,
        workedDays: 0,
        absenceDays: 0,
      }
    )
  }, [monthlyValues])

  // Get flextime from the latest month with data (flextime_end = accumulated balance)
  const currentFlextime = useMemo(() => {
    if (monthlyValues.length === 0) return 0

    const sorted = [...monthlyValues].sort((a, b) => (b.month ?? 0) - (a.month ?? 0))
    const latest = sorted[0]
    return latest?.account_balances?.flextime ?? 0
  }, [monthlyValues])

  if (isLoading) {
    return <SummaryCardsSkeleton />
  }

  if (monthlyValues.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-4">
                {tCommon('noDataAvailable')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Time Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('totalTime')}</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('target')}</span>
              <TimeDisplay
                value={totals.targetMinutes}
                format="duration"
                className="font-medium"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('worked')}</span>
              <TimeDisplay
                value={totals.netMinutes}
                format="duration"
                className="font-medium"
              />
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">{t('yearBalance')}</span>
              <TimeDisplay
                value={totals.netMinutes - totals.targetMinutes}
                format="balance"
                className="text-lg font-bold"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flextime Balance Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('flextimeBalance')}</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-2">
            <TimeDisplay
              value={currentFlextime}
              format="balance"
              className={cn(
                'text-3xl font-bold',
                currentFlextime > 0 && 'text-green-600 dark:text-green-400',
                currentFlextime < 0 && 'text-red-600 dark:text-red-400'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {currentFlextime >= 0 ? t('credit') : t('deficit')}
            </p>
          </div>
          {/* Balance indicator bar */}
          <div className="mt-3 relative h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'absolute top-0 h-full transition-all',
                currentFlextime >= 0 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'
              )}
              style={{
                width: `${Math.min(Math.abs(currentFlextime) / 60 / 16 * 50, 50)}%`,
              }}
            />
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-border -translate-x-1/2" />
          </div>
        </CardContent>
      </Card>

      {/* Working Days Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('workingDays')}</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-2">
            <div className="text-3xl font-bold">
              {totals.workedDays}{' '}
              <span className="text-lg text-muted-foreground">
                / {totals.workingDays}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('daysWorked')}</p>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${
                  totals.workingDays > 0
                    ? (totals.workedDays / totals.workingDays) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Vacation Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('vacationCard')}</CardTitle>
          <Palmtree className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {vacationUsed !== undefined && vacationUsed !== null ? (
            <>
              <div className="text-center py-2">
                <div className="text-3xl font-bold">
                  {vacationUsed}{' '}
                  {vacationEntitlement && (
                    <span className="text-lg text-muted-foreground">
                      / {vacationEntitlement}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('daysUsed')}</p>
              </div>
              {/* Progress bar */}
              {vacationEntitlement && (
                <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{
                      width: `${Math.min(
                        (vacationUsed / vacationEntitlement) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-2">
              <div className="text-3xl font-bold">{totals.absenceDays}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('totalAbsenceDays')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
