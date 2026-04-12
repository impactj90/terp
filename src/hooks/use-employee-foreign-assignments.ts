import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee foreign assignments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeForeignAssignments(employeeId)
 * const foreignAssignments = data?.data ?? []
 * ```
 */
export function useEmployeeForeignAssignments(
  employeeId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeForeignAssignments.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee foreign assignment.
 *
 * @example
 * ```tsx
 * const createForeignAssignment = useCreateEmployeeForeignAssignment()
 * createForeignAssignment.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeForeignAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeForeignAssignments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeForeignAssignments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee foreign assignment.
 *
 * @example
 * ```tsx
 * const updateForeignAssignment = useUpdateEmployeeForeignAssignment()
 * updateForeignAssignment.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeForeignAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeForeignAssignments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeForeignAssignments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee foreign assignment.
 *
 * @example
 * ```tsx
 * const deleteForeignAssignment = useDeleteEmployeeForeignAssignment()
 * deleteForeignAssignment.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeForeignAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeForeignAssignments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeForeignAssignments.list.queryKey(),
      })
    },
  })
}
