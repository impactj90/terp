import { useApiQuery, useApiMutation } from '@/hooks'

interface UseBookingsOptions {
  employeeId?: string
  from?: string
  to?: string
  limit?: number
  page?: number
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of bookings.
 *
 * @example
 * ```tsx
 * const { data } = useBookings({
 *   employeeId: '123',
 *   from: '2026-01-01',
 *   to: '2026-01-31',
 * })
 * ```
 */
export function useBookings(options: UseBookingsOptions = {}) {
  const {
    employeeId,
    from,
    to,
    limit = 50,
    page,
    enabled = true,
  } = options

  return useApiQuery('/bookings', {
    params: {
      employee_id: employeeId,
      from,
      to,
      limit,
      page,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single booking by ID.
 */
export function useBooking(id: string, enabled = true) {
  return useApiQuery('/bookings/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new booking (clock in/out).
 */
export function useCreateBooking() {
  return useApiMutation('/bookings', 'post', {
    invalidateKeys: [['/bookings'], ['/daily-values'], ['/employees/{id}/day/{date}'], ['employees']],
  })
}

/**
 * Hook to update an existing booking.
 */
export function useUpdateBooking() {
  return useApiMutation('/bookings/{id}', 'put', {
    invalidateKeys: [['/bookings'], ['/daily-values'], ['/employees/{id}/day/{date}'], ['employees']],
  })
}

/**
 * Hook to delete a booking.
 */
export function useDeleteBooking() {
  return useApiMutation('/bookings/{id}', 'delete', {
    invalidateKeys: [['/bookings'], ['/daily-values'], ['/employees/{id}/day/{date}'], ['employees']],
  })
}
