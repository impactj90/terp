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
import { useDailyValues } from '@/hooks/api'
import {
  formatDate,
  getWeekDates,
  formatDisplayDate,
  isToday,
  isWeekend,
} from '@/lib/time-utils'
import { ErrorBadge } from './error-badge'
import { TimeDisplay } from './time-display'

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

  // Fetch daily values for the week
  const { data: dailyValuesData, isLoading: isLoadingDailyValues } = useDailyValues({
    employeeId,
    from: formatDate(startDate),
    to: formatDate(endDate),
    enabled: !!employeeId,
  })

  // Create a map of date -> daily value
  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, DailyValueData>()
    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        map.set(dv.value_date, dv as DailyValueData)
      }
    }
    return map
  }, [dailyValuesData])

  // Calculate week totals
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

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">{t('dayHeader')}</TableHead>
            <TableHead className="text-right">{t('target')}</TableHead>
            <TableHead className="text-right">{t('gross')}</TableHead>
            <TableHead className="text-right">{t('breaks')}</TableHead>
            <TableHead className="text-right">{t('net')}</TableHead>
            <TableHead className="text-right">{t('balance')}</TableHead>
            <TableHead className="w-[60px]">{t('statusHeader')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dates.map((date) => {
            const dateString = formatDate(date)
            const dailyValue = dailyValuesByDate.get(dateString)
            const today = isToday(date)
            const weekend = isWeekend(date)

            return (
              <TableRow
                key={dateString}
                className={cn(
                  'cursor-pointer hover:bg-muted/50',
                  today && 'bg-primary/5',
                  weekend && !dailyValue?.target_minutes && 'text-muted-foreground'
                )}
                onClick={() => onDayClick?.(date)}
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
                    <TimeDisplay
                      value={dailyValue?.net_minutes}
                      format="duration"
                      className="font-medium"
                    />
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
