import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrderBookingsOptions {
  employeeId?: string
  orderId?: string
  dateFrom?: string
  dateTo?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of order bookings.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOrderBookings({ orderId })
 * const bookings = data?.data ?? []
 * ```
 */
export function useOrderBookings(options: UseOrderBookingsOptions = {}) {
  const { employeeId, orderId, dateFrom, dateTo, enabled = true } = options

  return useApiQuery('/order-bookings', {
    params: {
      employee_id: employeeId,
      order_id: orderId,
      date_from: dateFrom,
      date_to: dateTo,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single order booking by ID.
 *
 * @example
 * ```tsx
 * const { data: booking, isLoading } = useOrderBooking(bookingId)
 * ```
 */
export function useOrderBooking(id: string, enabled = true) {
  return useApiQuery('/order-bookings/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateOrderBooking() {
  return useApiMutation('/order-bookings', 'post', {
    invalidateKeys: [['/order-bookings'], ['/orders']],
  })
}

export function useUpdateOrderBooking() {
  return useApiMutation('/order-bookings/{id}', 'patch', {
    invalidateKeys: [['/order-bookings'], ['/orders']],
  })
}

export function useDeleteOrderBooking() {
  return useApiMutation('/order-bookings/{id}', 'delete', {
    invalidateKeys: [['/order-bookings'], ['/orders']],
  })
}
