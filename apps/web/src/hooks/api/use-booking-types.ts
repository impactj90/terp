import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch booking types.
 *
 * @example
 * ```tsx
 * const { data } = useBookingTypes({ isActive: true })
 * // Returns booking types like A1 (Clock In), A2 (Clock Out), P1 (Break Start), etc.
 * ```
 */
export function useBookingTypes(
  options: {
    isActive?: boolean
    direction?: string
    enabled?: boolean
  } = {}
) {
  const { isActive, direction, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingTypes.list.queryOptions({ isActive, direction }, { enabled })
  )
}

/**
 * Hook to fetch a single booking type by ID.
 *
 * @example
 * ```tsx
 * const { data: bookingType } = useBookingType(bookingTypeId)
 * ```
 */
export function useBookingType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingTypes.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new booking type.
 */
export function useCreateBookingType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingTypes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing booking type.
 */
export function useUpdateBookingType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingTypes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a booking type.
 */
export function useDeleteBookingType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingTypes.list.queryKey(),
      })
    },
  })
}
