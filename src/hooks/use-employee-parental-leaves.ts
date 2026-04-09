import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee parental leaves.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeParentalLeaves(employeeId)
 * const parentalLeaves = data?.data ?? []
 * ```
 */
export function useEmployeeParentalLeaves(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeParentalLeaves.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee parental leave.
 *
 * @example
 * ```tsx
 * const createParentalLeave = useCreateEmployeeParentalLeave()
 * createParentalLeave.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeParentalLeave() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeParentalLeaves.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeParentalLeaves.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee parental leave.
 *
 * @example
 * ```tsx
 * const updateParentalLeave = useUpdateEmployeeParentalLeave()
 * updateParentalLeave.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeParentalLeave() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeParentalLeaves.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeParentalLeaves.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee parental leave.
 *
 * @example
 * ```tsx
 * const deleteParentalLeave = useDeleteEmployeeParentalLeave()
 * deleteParentalLeave.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeParentalLeave() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeParentalLeaves.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeParentalLeaves.list.queryKey(),
      })
    },
  })
}
