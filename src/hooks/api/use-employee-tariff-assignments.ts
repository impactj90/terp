import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch all tariff assignments for an employee.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeTariffAssignments(employeeId)
 * const assignments = data?.data ?? []
 * ```
 */
export function useEmployeeTariffAssignments(
  employeeId: string,
  options?: { active?: boolean; enabled?: boolean }
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeTariffAssignments.list.queryOptions(
      { employeeId, isActive: options?.active },
      { enabled: (options?.enabled ?? true) && !!employeeId }
    )
  )
}

/**
 * Hook to fetch a single tariff assignment.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeTariffAssignment(employeeId, assignmentId)
 * ```
 */
export function useEmployeeTariffAssignment(
  employeeId: string,
  assignmentId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeTariffAssignments.getById.queryOptions(
      { employeeId, id: assignmentId },
      { enabled: enabled && !!employeeId && !!assignmentId }
    )
  )
}

/**
 * Hook to get the effective tariff for an employee on a specific date.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEffectiveTariff(employeeId, '2026-01-15')
 * ```
 */
export function useEffectiveTariff(
  employeeId: string,
  date: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeTariffAssignments.effective.queryOptions(
      { employeeId, date },
      { enabled: enabled && !!employeeId && !!date }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a tariff assignment for an employee.
 *
 * @example
 * ```tsx
 * const createAssignment = useCreateEmployeeTariffAssignment()
 * createAssignment.mutate({
 *   employeeId: '...',
 *   tariffId: '...',
 *   effectiveFrom: new Date('2026-01-01'),
 * })
 * ```
 */
export function useCreateEmployeeTariffAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeTariffAssignments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeTariffAssignments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeTariffAssignments.effective.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update a tariff assignment.
 *
 * @example
 * ```tsx
 * const updateAssignment = useUpdateEmployeeTariffAssignment()
 * updateAssignment.mutate({
 *   employeeId: '...',
 *   id: assignmentId,
 *   effectiveFrom: new Date('2026-02-01'),
 * })
 * ```
 */
export function useUpdateEmployeeTariffAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeTariffAssignments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeTariffAssignments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeTariffAssignments.effective.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a tariff assignment.
 *
 * @example
 * ```tsx
 * const deleteAssignment = useDeleteEmployeeTariffAssignment()
 * deleteAssignment.mutate({ employeeId: '...', id: assignmentId })
 * ```
 */
export function useDeleteEmployeeTariffAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeTariffAssignments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeTariffAssignments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employeeTariffAssignments.effective.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.employees.getById.queryKey(),
      })
    },
  })
}
