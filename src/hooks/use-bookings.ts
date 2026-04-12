import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTimeDataInvalidation } from "./use-time-data-invalidation"

interface UseBookingsOptions {
  employeeId?: string
  from?: string
  to?: string
  /** @deprecated Use pageSize instead */
  limit?: number
  pageSize?: number
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
    limit,
    pageSize,
    page,
    enabled = true,
  } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.bookings.list.queryOptions(
      {
        employeeId,
        fromDate: from,
        toDate: to,
        pageSize: pageSize ?? limit ?? 50,
        page,
      },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single booking by ID.
 */
export function useBooking(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bookings.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new booking (clock in/out).
 */
export function useCreateBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateTimeData = useTimeDataInvalidation()
  return useMutation({
    ...trpc.bookings.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.getById.queryKey(),
      })
      invalidateTimeData()
    },
  })
}

/**
 * Hook to update an existing booking.
 */
export function useUpdateBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateTimeData = useTimeDataInvalidation()
  return useMutation({
    ...trpc.bookings.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.getById.queryKey(),
      })
      invalidateTimeData()
    },
  })
}

/**
 * Hook to delete a booking.
 */
export function useDeleteBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateTimeData = useTimeDataInvalidation()
  return useMutation({
    ...trpc.bookings.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.getById.queryKey(),
      })
      invalidateTimeData()
    },
  })
}
