'use client'

import { useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { CalendarDays, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeDayView } from '@/hooks'
import { formatDate, formatDisplayDate, isToday, isWeekend } from '@/lib/time-utils'
import { QueryError } from '@/components/ui/query-error'
import { BookingList } from './booking-list'
import { ProgressSummary } from './progress-summary'
import { TimelineBar, type TimelineSegment } from './timeline-bar'
import { ErrorBadge } from './error-badge'
import { groupBookingsIntoPairs } from './utils'

interface DayViewProps {
  date: Date
  employeeId?: string
  isEditable?: boolean
  onAddBooking?: () => void
  onEditBooking?: (booking: unknown) => void
  onDeleteBooking?: (booking: unknown) => void
}

export function DayView({
  date,
  employeeId,
  isEditable = true,
  onAddBooking,
  onEditBooking,
  onDeleteBooking,
}: DayViewProps) {
  const t = useTranslations('timesheet')
  const locale = useLocale()
  const dateString = formatDate(date)
  const today = isToday(date)
  const weekend = isWeekend(date)

  const dayView = useEmployeeDayView(employeeId ?? '', dateString, { enabled: !!employeeId })
  const bookings = dayView.data?.bookings ?? []
  const dailyValue = dayView.data?.dailyValue ?? null
  const dayPlan = dayView.data?.dayPlan ?? null
  const errors = dayView.data?.errors ?? null

  const isLoading = dayView.isLoading

  if (dayView.isError) {
    return <QueryError message={t('loadFailed')} onRetry={() => dayView.refetch()} />
  }

  // Transform bookings to the format expected by BookingList (snake_case interface)
  const transformedBookings = bookings.map((b) => ({
    id: b.id,
    booking_date: b.bookingDate,
    booking_type: b.bookingType ? {
      code: b.bookingType.code,
      name: b.bookingType.name,
      direction: b.bookingType.direction as 'in' | 'out',
    } : null,
    original_time: b.originalTime,
    edited_time: b.editedTime,
    calculated_time: b.calculatedTime,
    source: b.source ?? 'terminal',
    notes: b.notes,
    pair_id: b.pairId,
  }))

  // Compute timeline segments from booking pairs
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const timelineSegments = useMemo(() => {
    if (transformedBookings.length === 0) return []

    const pairs = groupBookingsIntoPairs(transformedBookings)
    const segments: TimelineSegment[] = []
    let prevOutTime: number | null = null

    for (const pair of pairs) {
      const inTime = pair.inBooking
        ? (pair.inBooking.calculated_time ?? pair.inBooking.edited_time)
        : null
      const outTime = pair.outBooking
        ? (pair.outBooking.calculated_time ?? pair.outBooking.edited_time)
        : null

      // Break gap between consecutive pairs
      if (prevOutTime !== null && inTime !== null && inTime > prevOutTime) {
        segments.push({
          startMinutes: prevOutTime,
          endMinutes: inTime,
          type: 'break',
          label: t('breaks'),
        })
      }

      // Work segment
      if (inTime !== null) {
        const inName = pair.inBooking?.booking_type?.name ?? 'IN'
        const outName = pair.outBooking?.booking_type?.name ?? ''
        segments.push({
          startMinutes: inTime,
          endMinutes: outTime,
          type: 'work',
          label: outName ? `${inName} → ${outName}` : inName,
          hasError: !pair.inBooking || !pair.outBooking,
        })
      } else if (outTime !== null) {
        // Orphan OUT booking
        segments.push({
          startMinutes: outTime,
          endMinutes: null,
          type: 'work',
          label: pair.outBooking?.booking_type?.name ?? 'OUT',
          hasError: true,
        })
      }

      if (outTime !== null) prevOutTime = outTime
    }

    return segments
  }, [transformedBookings, t])

  // Current time in minutes for "now" marker (only for today)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const currentTimeMinutes = useMemo(() => {
    if (!today) return null
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }, [today])

  return (
    <div className="space-y-5">
      {/* Day header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className={cn(
              'text-lg font-semibold',
              today && 'text-primary'
            )}>
              {formatDisplayDate(date, 'long')}
            </h2>
            <div className="flex items-center gap-2">
              {today && (
                <Badge variant="default" className="text-xs">{t('today')}</Badge>
              )}
              {weekend && (
                <Badge variant="secondary" className="text-xs">{t('weekend')}</Badge>
              )}
              {dayView.data?.isHoliday && (
                <Badge variant="secondary" className="text-xs">
                  <Sun className="h-3 w-3 mr-1" />
                  {t('holiday')}
                </Badge>
              )}
              <ErrorBadge errors={errors as never} />
            </div>
          </div>
        </div>

        {dayPlan && (
          <div className="text-sm text-muted-foreground text-right">
            <div>{dayPlan.name}</div>
            {dailyValue?.targetTime !== undefined && dailyValue?.targetTime !== null && (
              <div className="text-xs">
                {t('targetLabel')} {Math.floor((dailyValue.targetTime ?? 0) / 60)}:{((dailyValue.targetTime ?? 0) % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress summary — the most important info, now at the top */}
      {dailyValue && (
        <ProgressSummary
          targetMinutes={dailyValue.targetTime}
          grossMinutes={dailyValue.grossTime}
          breakMinutes={dailyValue.breakTime}
          netMinutes={dailyValue.netTime}
          balanceMinutes={dailyValue.balanceMinutes}
        />
      )}

      {/* Visual timeline */}
      {timelineSegments.length > 0 && (
        <TimelineBar
          segments={timelineSegments}
          currentTimeMinutes={currentTimeMinutes}
        />
      )}

      {/* Loading placeholders for summary + timeline */}
      {isLoading && !dailyValue && (
        <div className="space-y-3">
          <Skeleton className="h-[88px] w-full rounded-xl" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      )}

      {/* Bookings list */}
      <div>
        <h3 className="text-sm font-medium mb-2 text-muted-foreground">{t('bookings')}</h3>
        <BookingList
          bookings={transformedBookings}
          isLoading={isLoading}
          isEditable={isEditable}
          onEdit={onEditBooking as never}
          onDelete={onDeleteBooking as never}
          onAdd={onAddBooking}
        />
      </div>

      {/* Status line */}
      {dailyValue && (
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
          <span>{t('statusLabel')}: {dailyValue.status}</span>
          {dailyValue.calculatedAt && (
            <span>
              {t('calculated')} {new Date(dailyValue.calculatedAt).toLocaleString(locale)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
