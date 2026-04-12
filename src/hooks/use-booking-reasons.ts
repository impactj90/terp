import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch booking reasons.
 *
 * @example
 * ```tsx
 * const { data } = useBookingReasons({ bookingTypeId })
 * const reasons = data?.data ?? []
 * ```
 */
export function useBookingReasons(
  options: {
    bookingTypeId?: string
    enabled?: boolean
  } = {}
) {
  const { bookingTypeId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingReasons.list.queryOptions({ bookingTypeId }, { enabled })
  )
}

/**
 * Hook to fetch a single booking reason by ID.
 */
export function useBookingReason(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingReasons.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new booking reason.
 */
export function useCreateBookingReason() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingReasons.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingReasons.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bookingReasons.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing booking reason.
 */
export function useUpdateBookingReason() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingReasons.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingReasons.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bookingReasons.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a booking reason.
 */
export function useDeleteBookingReason() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingReasons.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingReasons.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bookingReasons.getById.queryKey(),
      })
    },
  })
}
