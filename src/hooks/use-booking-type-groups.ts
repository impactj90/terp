import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch booking type groups.
 */
export function useBookingTypeGroups(
  options: {
    isActive?: boolean
    enabled?: boolean
  } = {}
) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingTypeGroups.list.queryOptions({ isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single booking type group by ID.
 */
export function useBookingTypeGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bookingTypeGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new booking type group.
 */
export function useCreateBookingTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypeGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingTypeGroups.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing booking type group.
 */
export function useUpdateBookingTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypeGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingTypeGroups.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a booking type group.
 */
export function useDeleteBookingTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bookingTypeGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookingTypeGroups.list.queryKey(),
      })
    },
  })
}
