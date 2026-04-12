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

      {/* Mobile: Day cards */}
      <div className="space-y-2 sm:hidden">
        {dates.map((date) => {
          const dateString = formatDate(date)
          const dailyValue = dailyValuesByDate.get(dateString)
          const today = isToday(date)
          const weekend = isWeekend(date)
          const target = dailyValue?.target_minutes ?? 0
          const net = dailyValue?.net_minutes ?? 0
          const progress = target > 0 ? Math.min((net / target) * 100, 100) : 0
          const hasData = dailyValue && (dailyValue.gross_minutes || dailyValue.net_minutes)

          return (
            <div
              key={dateString}
              className={cn(
                'rounded-lg border p-3 transition-colors active:bg-muted/50',
                today && 'border-primary/30 bg-primary/5',
                weekend && !target && 'opacity-60',
                !today && 'cursor-pointer',
              )}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick?.(date)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDayClick?.(date)
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-sm font-medium',
                    today && 'text-primary',
                  )}>
                    {formatDisplayDate(date, 'weekday')}, {formatDisplayDate(date, 'short')}
                  </span>
                  {dailyValue?.is_holiday && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">H</Badge>
                  )}
                  {dailyValue?.is_absence && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">A</Badge>
                  )}
                  <ErrorBadge errors={dailyValue?.errors as never} />
                </div>
                {hasData ? (
                  <TimeDisplay
                    value={dailyValue?.balance_minutes}
                    format="balance"
                    className="text-sm font-medium"
                  />
                ) : isLoading ? (
                  <Skeleton className="h-4 w-12" />
                ) : null}
              </div>
              {hasData && (
                <div className="mt-1.5 flex items-center gap-4">
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>
                      <TimeDisplay value={dailyValue?.net_minutes} format="duration" className="text-xs font-medium text-foreground" />
                      {' / '}
                      <TimeDisplay value={dailyValue?.target_minutes} format="duration" className="text-xs" />
                    </span>
                    {(dailyValue?.break_minutes ?? 0) > 0 && (
                      <span>
                        {t('breaks')}: <TimeDisplay value={dailyValue?.break_minutes} format="duration" className="text-xs" />
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  {target > 0 && (
                    <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
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
              {isLoading && !hasData && (
                <div className="mt-1.5 flex gap-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop: Day table */}
      <div className="hidden sm:block">
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
    </div>
  )
}
