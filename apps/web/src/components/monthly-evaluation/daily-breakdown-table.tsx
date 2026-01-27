'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { TimeDisplay } from '@/components/timesheet'
import {
  formatDate,
  formatDisplayDate,
  getMonthDates,
  isToday,
  isWeekend,
} from '@/lib/time-utils'
import type { DailyValue } from '@/hooks/api'

interface DailyBreakdownTableProps {
  dailyValues: DailyValue[]
  isLoading: boolean
  year: number
  month: number
  employeeId?: string
}

export function DailyBreakdownTable({
  dailyValues,
  isLoading,
  year,
  month,
  employeeId,
}: DailyBreakdownTableProps) {
  const router = useRouter()

  // Get all dates in the month
  const monthDates = useMemo(() => {
    return getMonthDates(new Date(year, month - 1, 1))
  }, [year, month])

  // Create a map for quick lookup
  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, DailyValue>()
    for (const dv of dailyValues) {
      map.set(dv.value_date, dv)
    }
    return map
  }, [dailyValues])

  // Calculate totals
  const totals = useMemo(() => {
    let target = 0
    let gross = 0
    let breaks = 0
    let net = 0
    let overtime = 0
    let undertime = 0
    let errorCount = 0
    let warningCount = 0

    for (const dv of dailyValues) {
      target += dv.target_time ?? 0
      gross += dv.gross_time ?? 0
      breaks += dv.break_time ?? 0
      net += dv.net_time ?? 0
      overtime += dv.overtime ?? 0
      undertime += dv.undertime ?? 0
      if (dv.has_error) errorCount++
      if (dv.warnings?.length) warningCount++
    }

    const balance = overtime - undertime
    return { target, gross, breaks, net, balance, errorCount, warningCount }
  }, [dailyValues])

  const handleRowClick = (date: Date) => {
    // Navigate to timesheet day view
    const dateString = formatDate(date)
    const params = new URLSearchParams({ date: dateString, view: 'day' })
    if (employeeId) {
      params.set('employee', employeeId)
    }
    router.push(`/timesheet?${params.toString()}`)
  }

  if (isLoading) {
    return <DailyBreakdownSkeleton />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Daily Breakdown</h3>
        <div className="flex items-center gap-2">
          {totals.errorCount > 0 && (
            <Badge variant="destructive">
              {totals.errorCount} day{totals.errorCount !== 1 ? 's' : ''} with errors
            </Badge>
          )}
          {totals.warningCount > 0 && (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              {totals.warningCount} day{totals.warningCount !== 1 ? 's' : ''} with warnings
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Breaks</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-[80px] text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthDates.map((date) => {
              const dateString = formatDate(date)
              const dailyValue = dailyValuesByDate.get(dateString)
              const today = isToday(date)
              const weekend = isWeekend(date)
              const hasErrors = dailyValue?.has_error
              const hasWarnings = !!(dailyValue?.warnings?.length)
              const balance = (dailyValue?.overtime ?? 0) - (dailyValue?.undertime ?? 0)

              return (
                <TableRow
                  key={dateString}
                  className={cn(
                    'cursor-pointer hover:bg-muted/50',
                    today && 'bg-primary/5',
                    weekend && !dailyValue?.target_time && 'text-muted-foreground bg-muted/30',
                    hasErrors && 'bg-destructive/5 hover:bg-destructive/10',
                    !hasErrors && hasWarnings && 'bg-yellow-50/50 hover:bg-yellow-50 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/30'
                  )}
                  onClick={() => handleRowClick(date)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className={cn(
                          'font-medium',
                          today && 'text-primary'
                        )}>
                          {formatDisplayDate(date, 'weekday')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDisplayDate(date, 'short')}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay value={dailyValue?.target_time} format="duration" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay value={dailyValue?.gross_time} format="duration" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay value={dailyValue?.break_time} format="duration" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay
                      value={dailyValue?.net_time}
                      format="duration"
                      className="font-medium"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay
                      value={balance}
                      format="balance"
                      className="font-medium"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    {hasErrors && dailyValue?.error_codes && dailyValue.error_codes.length > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {dailyValue.error_codes.length} {dailyValue.error_codes.length === 1 ? 'error' : 'errors'}
                      </Badge>
                    ) : hasWarnings && dailyValue?.warnings ? (
                      <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        {dailyValue.warnings.length} {dailyValue.warnings.length === 1 ? 'warning' : 'warnings'}
                      </Badge>
                    ) : dailyValue ? (
                      <Badge variant="outline" className="text-xs">OK</Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Month Total</TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.target} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.gross} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.breaks} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.net} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.balance} format="balance" />
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

function DailyBreakdownSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Breaks</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
