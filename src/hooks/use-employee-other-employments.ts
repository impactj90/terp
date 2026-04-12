import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee other employments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeOtherEmployments(employeeId)
 * const otherEmployments = data?.data ?? []
 * ```
 */
export function useEmployeeOtherEmployments(
  employeeId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeOtherEmployments.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee other employment.
 *
 * @example
 * ```tsx
 * const createOtherEmployment = useCreateEmployeeOtherEmployment()
 * createOtherEmployment.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeOtherEmployment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeOtherEmployments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOtherEmployments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee other employment.
 *
 * @example
 * ```tsx
 * const updateOtherEmployment = useUpdateEmployeeOtherEmployment()
 * updateOtherEmployment.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeOtherEmployment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeOtherEmployments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOtherEmployments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee other employment.
 *
 * @example
 * ```tsx
 * const deleteOtherEmployment = useDeleteEmployeeOtherEmployment()
 * deleteOtherEmployment.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeOtherEmployment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeOtherEmployments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeOtherEmployments.list.queryKey(),
      })
    },
  })
}
