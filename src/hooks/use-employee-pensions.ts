import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee pensions.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeePensions(employeeId)
 * const pensions = data?.data ?? []
 * ```
 */
export function useEmployeePensions(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeePensions.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee pension.
 *
 * @example
 * ```tsx
 * const createPension = useCreateEmployeePension()
 * createPension.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeePension() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeePensions.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeePensions.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee pension.
 *
 * @example
 * ```tsx
 * const updatePension = useUpdateEmployeePension()
 * updatePension.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeePension() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeePensions.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeePensions.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee pension.
 *
 * @example
 * ```tsx
 * const deletePension = useDeleteEmployeePension()
 * deletePension.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeePension() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeePensions.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeePensions.list.queryKey(),
      })
    },
  })
}
