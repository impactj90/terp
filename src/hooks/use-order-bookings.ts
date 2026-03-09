import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseOrderBookingsOptions {
  employeeId?: string
  orderId?: string
  fromDate?: string
  toDate?: string
  pageSize?: number
  page?: number
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of order bookings.
 *
 * @example
 * ```tsx
 * const { data } = useOrderBookings({ orderId })
 * const bookings = data?.items ?? []
 * ```
 */
export function useOrderBookings(options: UseOrderBookingsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orderBookings.list.queryOptions(
      {
        employeeId: params.employeeId,
        orderId: params.orderId,
        fromDate: params.fromDate,
        toDate: params.toDate,
        pageSize: params.pageSize,
        page: params.page,
      },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single order booking by ID.
 */
export function useOrderBooking(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderBookings.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to create a new order booking.
 */
export function useCreateOrderBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderBookings.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderBookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderBookings.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing order booking.
 */
export function useUpdateOrderBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderBookings.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderBookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderBookings.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an order booking.
 */
export function useDeleteOrderBooking() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderBookings.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderBookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderBookings.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}
