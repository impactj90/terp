'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
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
import { useDailyValues } from '@/hooks'
import {
  formatDate,
  getWeekDates,
  formatDisplayDate,
  isToday,
  isWeekend,
} from '@/lib/time-utils'
import { QueryError } from '@/components/ui/query-error'
import { ErrorBadge } from './error-badge'
import { TimeDisplay } from './time-display'
import { ProgressSummary } from './progress-summary'

// Type for daily value from API
interface DailyValueData {
  value_date: string
  target_minutes?: number
  gross_minutes?: number
  break_minutes?: number
  net_minutes?: number
  balance_minutes?: number
  is_holiday?: boolean
  is_absence?: boolean
  has_errors?: boolean
  errors?: Array<{ id: string; error_type: string; message: string; severity?: 'warning' | 'error' }>
}

interface WeekViewProps {
  startDate: Date
  endDate: Date
  employeeId?: string
  onDayClick?: (date: Date) => void
}

export function WeekView({
  startDate,
  endDate,
  employeeId,
  onDayClick,
}: WeekViewProps) {
  const t = useTranslations('timesheet')
  const dates = useMemo(() => getWeekDates(startDate), [startDate])

  const { data: dailyValuesData, isLoading: isLoadingDailyValues, isError, refetch } = useDailyValues({
    employeeId,
    from: formatDate(startDate),
    to: formatDate(endDate),
    enabled: !!employeeId,
  })

  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, DailyValueData>()
    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        map.set(dv.value_date, dv as DailyValueData)
      }
    }
    return map
  }, [dailyValuesData])

  const weekTotals = useMemo(() => {
    let target = 0
    let gross = 0
    let breaks = 0
    let net = 0
    let balance = 0

    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        target += dv.target_minutes ?? 0
        gross += dv.gross_minutes ?? 0
        breaks += dv.break_minutes ?? 0
        net += dv.net_minutes ?? 0
        balance += dv.balance_minutes ?? 0
      }
    }

    return { target, gross, breaks, net, balance }
  }, [dailyValuesData])

  const isLoading = isLoadingDailyValues

  if (isError) {
    return <QueryError message={t('loadFailed')} onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-5">
      {/* Week totals summary */}
      {!isLoading && dailyValuesData?.data?.length ? (
        <ProgressSummary
          targetMinutes={weekTotals.target}
          grossMinutes={weekTotals.gross}
          breakMinutes={weekTotals.breaks}
          netMinutes={weekTotals.net}
          balanceMinutes={weekTotals.balance}
        />
      ) : isLoading ? (
        <Skeleton className="h-[88px] w-full rounded-xl" />
      ) : null}

      {/* Day table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">{t('dayHeader')}</TableHead>
            <TableHead className="text-right">{t('target')}</TableHead>
            <TableHead className="text-right">{t('gross')}</TableHead>
            <TableHead className="text-right">{t('breaks')}</TableHead>
            <TableHead className="text-right">{t('net')}</TableHead>
            <TableHead className="text-right">{t('balance')}</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {dates.map((date) => {
            const dateString = formatDate(date)
            const dailyValue = dailyValuesByDate.get(dateString)
            const today = isToday(date)
            const weekend = isWeekend(date)
            const target = dailyValue?.target_minutes ?? 0
            const net = dailyValue?.net_minutes ?? 0
            const progress = target > 0 ? Math.min((net / target) * 100, 100) : 0

            return (
              <TableRow
                key={dateString}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/50',
                  today && 'bg-primary/5',
                  weekend && !dailyValue?.target_minutes && 'text-muted-foreground',
                )}
                onClick={() => onDayClick?.(date)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <div className={cn(
                        'font-medium',
                        today && 'text-primary',
                      )}>
                        {formatDisplayDate(date, 'weekday')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDisplayDate(date, 'short')}
                      </div>
                    </div>
                    {dailyValue?.is_holiday && (
                      <Badge variant="secondary" className="text-xs">H</Badge>
                    )}
                    {dailyValue?.is_absence && (
                      <Badge variant="outline" className="text-xs">A</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay value={dailyValue?.target_minutes} format="duration" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay value={dailyValue?.gross_minutes} format="duration" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay value={dailyValue?.break_minutes} format="duration" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <div className="inline-flex flex-col items-end gap-0.5">
                      <TimeDisplay
                        value={dailyValue?.net_minutes}
                        format="duration"
                        className="font-medium"
                      />
                      {/* Inline progress bar */}
                      {target > 0 && (
                        <div className="w-14 h-1 rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              progress >= 100 ? 'bg-emerald-500/60' : 'bg-primary/50',
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay
                      value={dailyValue?.balance_minutes}
                      format="balance"
                      className="font-medium"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <ErrorBadge errors={dailyValue?.errors as never} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">{t('weekTotal')}</TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.target} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.gross} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.breaks} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.net} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.balance} format="balance" />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
