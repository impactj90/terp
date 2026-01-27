'use client'

import { Clock, TrendingUp, CalendarOff, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from '@/components/timesheet'
import { cn } from '@/lib/utils'
import type { MonthSummary } from '@/hooks/api'

interface MonthlySummaryCardsProps {
  monthlyValue?: MonthSummary | null
  isLoading: boolean
}

export function MonthlySummaryCards({
  monthlyValue,
  isLoading,
}: MonthlySummaryCardsProps) {
  if (isLoading) {
    return <SummaryCardsSkeleton />
  }

  if (!monthlyValue) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-4">
                No data available
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const targetMinutes = monthlyValue.total_target_time ?? 0
  const netMinutes = monthlyValue.total_net_time ?? 0
  const overtime = monthlyValue.total_overtime ?? 0
  const undertime = monthlyValue.total_undertime ?? 0
  const balanceMinutes = overtime - undertime
  const workDays = monthlyValue.work_days ?? 0
  const vacationDays = monthlyValue.vacation_taken ?? 0
  const sickDays = monthlyValue.sick_days ?? 0
  const otherAbsenceDays = monthlyValue.other_absence_days ?? 0
  const totalAbsenceDays = vacationDays + sickDays + otherAbsenceDays

  // Get flextime from end balance
  const flextimeBalance = monthlyValue.flextime_end ?? 0
  const flextimeChange = monthlyValue.flextime_change ?? 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Time Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Time Summary</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target</span>
              <TimeDisplay value={targetMinutes} format="duration" className="font-medium" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Worked</span>
              <TimeDisplay value={netMinutes} format="duration" className="font-medium" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Balance</span>
              <TimeDisplay value={balanceMinutes} format="balance" className="text-lg font-bold" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flextime Balance Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Flextime Balance</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-2">
            <TimeDisplay
              value={flextimeBalance}
              format="balance"
              className={cn(
                'text-3xl font-bold',
                flextimeBalance > 0 && 'text-green-600 dark:text-green-400',
                flextimeBalance < 0 && 'text-red-600 dark:text-red-400'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {flextimeBalance >= 0 ? 'Credit' : 'Deficit'}
            </p>
          </div>
          {/* Balance indicator bar */}
          <div className="mt-3 relative h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'absolute top-0 h-full transition-all',
                flextimeBalance >= 0 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'
              )}
              style={{
                width: `${Math.min(Math.abs(flextimeBalance) / 60 / 8 * 50, 50)}%`
              }}
            />
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-border -translate-x-1/2" />
          </div>
        </CardContent>
      </Card>

      {/* Working Days Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Working Days</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-2">
            <div className="text-3xl font-bold">
              {workDays}
            </div>
            <p className="text-xs text-muted-foreground mt-1">days worked this month</p>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">With errors</span>
              <span className="font-medium text-destructive">{monthlyValue.days_with_errors ?? 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Absences Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Absences</CardTitle>
          <CalendarOff className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Vacation</span>
              <span className="font-medium">{vacationDays}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Sick leave</span>
              <span className="font-medium">{sickDays}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Other</span>
              <span className="font-medium">{otherAbsenceDays}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Total absences</span>
              <span className="text-lg font-bold">{totalAbsenceDays}</span>
            </div>
          </div>
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
