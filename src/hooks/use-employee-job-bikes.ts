import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee job bikes.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeJobBikes(employeeId)
 * const jobBikes = data?.data ?? []
 * ```
 */
export function useEmployeeJobBikes(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeJobBikes.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee job bike.
 *
 * @example
 * ```tsx
 * const createJobBike = useCreateEmployeeJobBike()
 * createJobBike.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeJobBike() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeJobBikes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeJobBikes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee job bike.
 *
 * @example
 * ```tsx
 * const updateJobBike = useUpdateEmployeeJobBike()
 * updateJobBike.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeJobBike() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeJobBikes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeJobBikes.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee job bike.
 *
 * @example
 * ```tsx
 * const deleteJobBike = useDeleteEmployeeJobBike()
 * deleteJobBike.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeJobBike() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeJobBikes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeJobBikes.list.queryKey(),
      })
    },
  })
}
