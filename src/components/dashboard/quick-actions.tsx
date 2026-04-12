'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { toast } from 'sonner'
import { LogIn, LogOut, CalendarPlus, FileText, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useEmployeeDayView,
  useCreateBooking,
  useBookingTypes,
} from '@/hooks'
import { getToday, formatDate, getCurrentTimeString } from '@/lib/time-utils'

interface QuickActionsProps {
  employeeId?: string
}

/**
 * Quick action buttons for common employee operations.
 */
export function QuickActions({ employeeId }: QuickActionsProps) {
  const t = useTranslations('dashboard')
  const today = getToday()
  const createBooking = useCreateBooking()

  // Fetch booking types to get the correct IDs for clock in/out
  const { data: bookingTypesData } = useBookingTypes({ isActive: true })

  // Get today's data to determine clock status
  const { data: dayView } = useEmployeeDayView(
    employeeId ?? '',
    today,
    !!employeeId
  )

  // Determine if currently clocked in
  // Check by counting work bookings - odd number means clocked in
  const bookings = dayView?.bookings ?? []
  const workBookings = bookings.filter(
    (b) => b.bookingType?.direction === 'in' || b.bookingType?.direction === 'out'
  )
  // Sort by time and check the last one's direction
  const sortedWorkBookings = [...workBookings].sort((a, b) => a.editedTime - b.editedTime)
  const lastBooking = sortedWorkBookings[sortedWorkBookings.length - 1]
  const isClockedIn = lastBooking?.bookingType?.direction === 'in'

  // Find the booking type IDs for clock in and clock out
  const clockInType = bookingTypesData?.data?.find(
    (bt) => bt.direction === 'in' && bt.code.toUpperCase() === 'A1'
  )
  const clockOutType = bookingTypesData?.data?.find(
    (bt) => bt.direction === 'out' && bt.code.toUpperCase() === 'A2'
  )

  const handleClockIn = async () => {
    if (!employeeId || !clockInType) return

    try {
      await createBooking.mutateAsync({
        employeeId,
        bookingDate: formatDate(new Date()),
        bookingTypeId: clockInType.id,
        time: getCurrentTimeString(),
      })
    } catch {
      toast.error(t('clockInFailed'))
    }
  }

  const handleClockOut = async () => {
    if (!employeeId || !clockOutType) return

    try {
      await createBooking.mutateAsync({
        employeeId,
        bookingDate: formatDate(new Date()),
        bookingTypeId: clockOutType.id,
        time: getCurrentTimeString(),
      })
    } catch {
      toast.error(t('clockOutFailed'))
    }
  }

  const isLoadingTypes = !bookingTypesData
  const canClockIn = employeeId && clockInType
  const canClockOut = employeeId && clockOutType

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {/* Clock In/Out button */}
      {employeeId ? (
        isClockedIn ? (
          <Button
            onClick={handleClockOut}
            disabled={createBooking.isPending || !canClockOut || isLoadingTypes}
            className="h-11 gap-2 sm:h-9 sm:w-auto"
          >
            {createBooking.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {t('clockOut')}
          </Button>
        ) : (
          <Button
            onClick={handleClockIn}
            disabled={createBooking.isPending || !canClockIn || isLoadingTypes}
            className="h-11 gap-2 sm:h-9 sm:w-auto"
          >
            {createBooking.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {t('clockIn')}
          </Button>
        )
      ) : (
        <Button disabled className="h-11 gap-2 sm:h-9 sm:w-auto">
          <Clock className="h-4 w-4" />
          {t('clockIn')}
        </Button>
      )}

      {/* Request Time Off */}
      <Button variant="outline" asChild className="h-11 gap-2 sm:h-9 sm:w-auto">
        <Link href="/absences/new">
          <CalendarPlus className="h-4 w-4" />
          {t('requestTimeOff')}
        </Link>
      </Button>

      {/* View Timesheet */}
      <Button variant="outline" asChild className="h-11 gap-2 sm:h-9 sm:w-auto">
        <Link href="/timesheet">
          <FileText className="h-4 w-4" />
          {t('viewTimesheet')}
        </Link>
      </Button>
    </div>
  )
}
