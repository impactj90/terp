'use client'

import { useTranslations, useLocale } from 'next-intl'
import { CalendarDays, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeDayView } from '@/hooks'
import { formatDate, formatDisplayDate, isToday, isWeekend } from '@/lib/time-utils'
import { QueryError } from '@/components/ui/query-error'
import { BookingList } from './booking-list'
import { DailySummary } from './daily-summary'
import { ErrorBadge } from './error-badge'

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

  return (
    <div className="space-y-6">
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

        {/* Day plan info */}
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

      {/* Bookings list */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t('bookings')}</h3>
        <BookingList
          bookings={transformedBookings}
          isLoading={isLoading}
          isEditable={isEditable}
          onEdit={onEditBooking as never}
          onDelete={onDeleteBooking as never}
          onAdd={onAddBooking}
        />
      </div>

      {/* Daily summary */}
      {dailyValue && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium mb-3">{t('dailySummary')}</h3>
          <DailySummary
            targetMinutes={dailyValue.targetTime}
            grossMinutes={dailyValue.grossTime}
            breakMinutes={dailyValue.breakTime}
            netMinutes={dailyValue.netTime}
            balanceMinutes={dailyValue.balanceMinutes}
            layout="horizontal"
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && !dailyValue && (
        <div className="pt-4 border-t">
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {/* Status indicators */}
      {dailyValue && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
