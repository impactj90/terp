import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseShiftsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch shifts (tRPC).
 */
export function useShifts(options: UseShiftsOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.shifts.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single shift by ID (tRPC).
 */
export function useShift(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.shifts.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new shift (tRPC).
 */
export function useCreateShift() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.shifts.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.shifts.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing shift (tRPC).
 */
export function useUpdateShift() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.shifts.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.shifts.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.shifts.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a shift (tRPC).
 */
export function useDeleteShift() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.shifts.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.shifts.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.shifts.getById.queryKey(),
      })
    },
  })
}
