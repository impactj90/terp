import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee maternity leaves.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMaternityLeaves(employeeId)
 * const maternityLeaves = data?.data ?? []
 * ```
 */
export function useEmployeeMaternityLeaves(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeMaternityLeaves.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee maternity leave.
 *
 * @example
 * ```tsx
 * const createMaternityLeave = useCreateEmployeeMaternityLeave()
 * createMaternityLeave.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeMaternityLeave() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMaternityLeaves.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMaternityLeaves.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee maternity leave.
 *
 * @example
 * ```tsx
 * const updateMaternityLeave = useUpdateEmployeeMaternityLeave()
 * updateMaternityLeave.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeMaternityLeave() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMaternityLeaves.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMaternityLeaves.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee maternity leave.
 *
 * @example
 * ```tsx
 * const deleteMaternityLeave = useDeleteEmployeeMaternityLeave()
 * deleteMaternityLeave.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeMaternityLeave() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMaternityLeaves.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMaternityLeaves.list.queryKey(),
      })
    },
  })
}
