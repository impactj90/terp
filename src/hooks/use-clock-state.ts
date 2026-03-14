'use client'

import { useMemo, useCallback } from 'react'
import { useCreateBooking } from '@/hooks/use-bookings'
import { useBookingTypes } from '@/hooks/use-booking-types'
import { useEmployeeDayView } from '@/hooks/use-employee-day'
import { getToday, getCurrentTimeString } from '@/lib/time-utils'
import type { ClockStatus } from '@/components/time-clock/clock-status-badge'

interface BookingTypeEntry {
  id: string
  code: string
  name: string
  direction: string
  [key: string]: unknown
}

// Booking type codes
const CLOCK_IN = 'A1'
const CLOCK_OUT = 'A2'
const BREAK_START = 'P1'
const BREAK_END = 'P2'
const ERRAND_START = 'D1'
const ERRAND_END = 'D2'

interface UseClockStateOptions {
  employeeId: string
  enabled?: boolean
}

export function useClockState({ employeeId, enabled = true }: UseClockStateOptions) {
  const today = getToday()

  // Fetch today's data
  const dayView = useEmployeeDayView(employeeId, today, { enabled: enabled && !!employeeId })

  // Fetch booking types
  const bookingTypes = useBookingTypes({ isActive: true, enabled })

  // Create booking mutation
  const createBooking = useCreateBooking()

  // Build booking type lookup
  const bookingTypeMap = useMemo(() => {
    const map = new Map<string, BookingTypeEntry>()
    const items = bookingTypes.data?.data
    if (items) {
      for (const bt of items) {
        if (bt.code) {
          map.set(bt.code, bt as unknown as BookingTypeEntry)
        }
      }
    }
    return map
  }, [bookingTypes.data])

  // Determine current status from bookings
  const { status, timerStartTime, lastBooking } = useMemo(() => {
    const bookings = dayView.data?.bookings ?? []

    if (bookings.length === 0) {
      return { status: 'clocked_out' as ClockStatus, timerStartTime: null, lastBooking: null }
    }

    // Sort by time (ascending)
    const sorted = [...bookings].sort((a, b) => {
      const timeA = a.editedTime ?? 0
      const timeB = b.editedTime ?? 0
      return timeA - timeB
    })

    const lastBooking = sorted[sorted.length - 1]
    const lastCode = lastBooking?.bookingType?.code

    // Determine status based on last booking
    let status: ClockStatus = 'clocked_out'

    if (lastCode === CLOCK_IN || lastCode === BREAK_END || lastCode === ERRAND_END) {
      status = 'clocked_in'
    } else if (lastCode === BREAK_START) {
      status = 'on_break'
    } else if (lastCode === ERRAND_START) {
      status = 'on_errand'
    } else if (lastCode === CLOCK_OUT) {
      status = 'clocked_out'
    }

    // Timer shows current phase duration:
    // - clocked_in: time since last clock-in / break-end / errand-end
    // - on_break: time since break started
    // - on_errand: time since errand started
    let timerStartTime: Date | null = null
    if (status !== 'clocked_out' && lastBooking?.editedTime !== undefined) {
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)
      timerStartTime = new Date(todayDate.getTime() + lastBooking.editedTime * 60000)
    }

    return { status, timerStartTime, lastBooking }
  }, [dayView.data?.bookings])

  // Action handler
  const handleAction = useCallback(
    async (action: string) => {
      const codeMap: Record<string, string> = {
        clock_in: CLOCK_IN,
        clock_out: CLOCK_OUT,
        start_break: BREAK_START,
        end_break: BREAK_END,
        start_errand: ERRAND_START,
        end_errand: ERRAND_END,
      }

      const code = codeMap[action]
      if (!code) {
        throw new Error(`Unknown action: ${action}`)
      }

      const bookingType = bookingTypeMap.get(code)
      if (!bookingType?.id) {
        throw new Error(`Booking type ${code} not found`)
      }

      await createBooking.mutateAsync({
        employeeId,
        bookingDate: today,
        bookingTypeId: bookingType.id,
        time: getCurrentTimeString(),
      })

      // Refetch day view to get updated bookings and daily values
      await dayView.refetch()
    },
    [employeeId, today, bookingTypeMap, createBooking, dayView.refetch]
  )

  return {
    // State
    status,
    timerStartTime,
    lastBooking,
    bookings: dayView.data?.bookings ?? [],
    dailyValue: dayView.data?.dailyValue,
    dayPlan: dayView.data?.dayPlan,
    isHoliday: dayView.data?.isHoliday ?? false,

    // Loading states
    isLoading: dayView.isLoading || bookingTypes.isLoading,
    isActionLoading: createBooking.isPending,

    // Error
    error: dayView.error || bookingTypes.error || createBooking.error,

    // Actions
    handleAction,

    // Refetch
    refetch: dayView.refetch,
  }
}
