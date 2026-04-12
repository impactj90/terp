import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee savings.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeSavings(employeeId)
 * const savings = data?.data ?? []
 * ```
 */
export function useEmployeeSavings(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeSavings.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee saving.
 *
 * @example
 * ```tsx
 * const createSaving = useCreateEmployeeSaving()
 * createSaving.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeSaving() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeSavings.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeSavings.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee saving.
 *
 * @example
 * ```tsx
 * const updateSaving = useUpdateEmployeeSaving()
 * updateSaving.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeSaving() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeSavings.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeSavings.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee saving.
 *
 * @example
 * ```tsx
 * const deleteSaving = useDeleteEmployeeSaving()
 * deleteSaving.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeSaving() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeSavings.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeSavings.list.queryKey(),
      })
    },
  })
}
