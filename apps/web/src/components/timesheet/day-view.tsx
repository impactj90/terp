'use client'

import { useTranslations, useLocale } from 'next-intl'
import { CalendarDays, Sun, Umbrella } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookings, useDailyValues } from '@/hooks/api'
import { formatDate, formatDisplayDate, isToday, isWeekend } from '@/lib/time-utils'
import { BookingList } from './booking-list'
import { DailySummary } from './daily-summary'
import { ErrorBadge } from './error-badge'

interface DayViewProps {
  date: Date
  employeeId?: string
  isEditable?: boolean
  onAddBooking?: () => void
  onEditBooking?: (booking: unknown) => void
}

export function DayView({
  date,
  employeeId,
  isEditable = true,
  onAddBooking,
  onEditBooking,
}: DayViewProps) {
  const t = useTranslations('timesheet')
  const locale = useLocale()
  const dateString = formatDate(date)
  const today = isToday(date)
  const weekend = isWeekend(date)

  // Fetch bookings for this day
  const { data: bookingsData, isLoading: isLoadingBookings } = useBookings({
    employeeId,
    from: dateString,
    to: dateString,
    enabled: !!employeeId,
  })

  // Fetch daily value for this day
  const { data: dailyValuesData, isLoading: isLoadingDailyValues } = useDailyValues({
    employeeId,
    from: dateString,
    to: dateString,
    enabled: !!employeeId,
  })

  const bookings = bookingsData?.data ?? []
  const dailyValue = dailyValuesData?.data?.find(dv => dv.value_date === dateString) ?? null

  const isLoading = isLoadingBookings || isLoadingDailyValues

  // Transform bookings to the format expected by BookingList
  const transformedBookings = bookings.map((b) => ({
    id: b.id,
    booking_type: b.booking_type ? {
      code: b.booking_type.code,
      name: b.booking_type.name,
      direction: b.booking_type.direction,
    } : null,
    original_time: b.original_time,
    edited_time: b.edited_time,
    calculated_time: b.calculated_time,
    source: b.source ?? 'terminal',
    notes: b.notes,
    pair_id: b.pair_id,
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
              {dailyValue?.is_holiday && (
                <Badge variant="secondary" className="text-xs">
                  <Sun className="h-3 w-3 mr-1" />
                  {t('holiday')}
                </Badge>
              )}
              {dailyValue?.is_absence && (
                <Badge variant="outline" className="text-xs">
                  <Umbrella className="h-3 w-3 mr-1" />
                  {dailyValue.absence_type?.name ?? t('absence')}
                </Badge>
              )}
              <ErrorBadge errors={dailyValue?.errors as never} />
            </div>
          </div>
        </div>

        {/* Day plan info */}
        {dailyValue?.day_plan && (
          <div className="text-sm text-muted-foreground text-right">
            <div>{dailyValue.day_plan.name}</div>
            <div className="text-xs">
              {t('targetLabel')} {Math.floor((dailyValue.target_minutes ?? 0) / 60)}:{((dailyValue.target_minutes ?? 0) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      {/* Bookings list */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t('bookings')}</h3>
        <BookingList
          bookings={transformedBookings}
          isLoading={isLoading}
          isEditable={isEditable && !dailyValue?.is_locked}
          onEdit={onEditBooking as never}
          onAdd={onAddBooking}
        />
      </div>

      {/* Daily summary */}
      {dailyValue && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium mb-3">{t('dailySummary')}</h3>
          <DailySummary
            targetMinutes={dailyValue.target_minutes}
            grossMinutes={dailyValue.gross_minutes}
            breakMinutes={dailyValue.break_minutes}
            netMinutes={dailyValue.net_minutes}
            balanceMinutes={dailyValue.balance_minutes}
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
          {dailyValue.is_locked && (
            <Badge variant="outline" className="text-xs">{t('locked')}</Badge>
          )}
          {dailyValue.calculated_at && (
            <span>
              {t('calculated')} {new Date(dailyValue.calculated_at).toLocaleString(locale)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
