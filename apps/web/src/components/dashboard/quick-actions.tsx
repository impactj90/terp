'use client'

import Link from 'next/link'
import { LogIn, LogOut, CalendarPlus, FileText, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useEmployeeDayView,
  useCreateBooking,
  useBookingTypes,
} from '@/hooks/api'
import { getToday, formatDate, getCurrentTimeString } from '@/lib/time-utils'

interface QuickActionsProps {
  employeeId?: string
}

/**
 * Quick action buttons for common employee operations.
 */
export function QuickActions({ employeeId }: QuickActionsProps) {
  const today = getToday()
  const createBooking = useCreateBooking()

  // Fetch booking types to get the correct IDs for clock in/out
  const { data: bookingTypesData } = useBookingTypes()

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
    (b) => b.booking_type?.direction === 'in' || b.booking_type?.direction === 'out'
  )
  // Sort by time and check the last one's direction
  const sortedWorkBookings = [...workBookings].sort((a, b) => a.edited_time - b.edited_time)
  const lastBooking = sortedWorkBookings[sortedWorkBookings.length - 1]
  const isClockedIn = lastBooking?.booking_type?.direction === 'in'

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
        body: {
          employee_id: employeeId,
          booking_date: formatDate(new Date()),
          booking_type_id: clockInType.id,
          time: getCurrentTimeString(),
        },
      })
    } catch (error) {
      // Error is handled by React Query
      console.error('Failed to clock in:', error)
    }
  }

  const handleClockOut = async () => {
    if (!employeeId || !clockOutType) return

    try {
      await createBooking.mutateAsync({
        body: {
          employee_id: employeeId,
          booking_date: formatDate(new Date()),
          booking_type_id: clockOutType.id,
          time: getCurrentTimeString(),
        },
      })
    } catch (error) {
      console.error('Failed to clock out:', error)
    }
  }

  const isLoadingTypes = !bookingTypesData
  const canClockIn = employeeId && clockInType
  const canClockOut = employeeId && clockOutType

  return (
    <div className="flex flex-wrap gap-2">
      {/* Clock In/Out button */}
      {employeeId ? (
        isClockedIn ? (
          <Button
            onClick={handleClockOut}
            disabled={createBooking.isPending || !canClockOut || isLoadingTypes}
            className="gap-2"
          >
            {createBooking.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Clock Out
          </Button>
        ) : (
          <Button
            onClick={handleClockIn}
            disabled={createBooking.isPending || !canClockIn || isLoadingTypes}
            className="gap-2"
          >
            {createBooking.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Clock In
          </Button>
        )
      ) : (
        <Button disabled className="gap-2">
          <Clock className="h-4 w-4" />
          Clock In
        </Button>
      )}

      {/* Request Time Off */}
      <Button variant="outline" asChild className="gap-2">
        <Link href="/absences/new">
          <CalendarPlus className="h-4 w-4" />
          Request Time Off
        </Link>
      </Button>

      {/* View Timesheet */}
      <Button variant="outline" asChild className="gap-2">
        <Link href="/timesheet">
          <FileText className="h-4 w-4" />
          View Timesheet
        </Link>
      </Button>
    </div>
  )
}
