'use client'

import { useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc'
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
  const trpc = useTRPC()
  const queryClient = useQueryClient()
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
  const { status, clockInTime, lastBooking } = useMemo(() => {
    const bookings = dayView.data?.bookings ?? []

    if (bookings.length === 0) {
      return { status: 'clocked_out' as ClockStatus, clockInTime: null, lastBooking: null }
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
    let clockInTime: Date | null = null

    if (lastCode === CLOCK_IN || lastCode === BREAK_END || lastCode === ERRAND_END) {
      status = 'clocked_in'
      // Find the last clock in time for the timer
      const clockIn = sorted.find(b => b.bookingType?.code === CLOCK_IN)
      if (clockIn && clockIn.editedTime !== undefined) {
        const todayDate = new Date()
        todayDate.setHours(0, 0, 0, 0)
        clockInTime = new Date(todayDate.getTime() + clockIn.editedTime * 60000)
      }
    } else if (lastCode === BREAK_START) {
      status = 'on_break'
    } else if (lastCode === ERRAND_START) {
      status = 'on_errand'
    } else if (lastCode === CLOCK_OUT) {
      status = 'clocked_out'
    }

    return { status, clockInTime, lastBooking }
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

      // Invalidate day view to refresh (tRPC query key)
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
    },
    [employeeId, today, bookingTypeMap, createBooking, queryClient, trpc]
  )

  return {
    // State
    status,
    clockInTime,
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
