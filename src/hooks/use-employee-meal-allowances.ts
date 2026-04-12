import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee meal allowances.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeMealAllowances(employeeId)
 * const mealAllowances = data?.data ?? []
 * ```
 */
export function useEmployeeMealAllowances(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeMealAllowances.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee meal allowance.
 *
 * @example
 * ```tsx
 * const createMealAllowance = useCreateEmployeeMealAllowance()
 * createMealAllowance.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeMealAllowance() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMealAllowances.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMealAllowances.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee meal allowance.
 *
 * @example
 * ```tsx
 * const updateMealAllowance = useUpdateEmployeeMealAllowance()
 * updateMealAllowance.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeMealAllowance() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMealAllowances.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMealAllowances.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee meal allowance.
 *
 * @example
 * ```tsx
 * const deleteMealAllowance = useDeleteEmployeeMealAllowance()
 * deleteMealAllowance.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeMealAllowance() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeMealAllowances.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeMealAllowances.list.queryKey(),
      })
    },
  })
}
