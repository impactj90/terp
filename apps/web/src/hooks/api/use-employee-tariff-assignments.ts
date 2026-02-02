import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch all tariff assignments for an employee.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeTariffAssignments(employeeId)
 * ```
 */
export function useEmployeeTariffAssignments(
  employeeId: string,
  options?: { active?: boolean; enabled?: boolean }
) {
  return useApiQuery('/employees/{id}/tariff-assignments', {
    path: { id: employeeId },
    params: { active: options?.active },
    enabled: (options?.enabled ?? true) && !!employeeId,
  })
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
  return useApiQuery('/employees/{id}/tariff-assignments/{assignmentId}', {
    path: { id: employeeId, assignmentId },
    enabled: enabled && !!employeeId && !!assignmentId,
  })
}

/**
 * Hook to create a tariff assignment for an employee.
 *
 * @example
 * ```tsx
 * const createAssignment = useCreateEmployeeTariffAssignment()
 * createAssignment.mutate({
 *   path: { id: employeeId },
 *   body: { tariff_id: '...', effective_from: '2026-01-01' }
 * })
 * ```
 */
export function useCreateEmployeeTariffAssignment() {
  return useApiMutation('/employees/{id}/tariff-assignments', 'post', {
    invalidateKeys: [
      ['/employees/{id}/tariff-assignments'],
      ['/employees/{id}/effective-tariff'],
      ['/employees'],
    ],
  })
}

/**
 * Hook to update a tariff assignment.
 *
 * @example
 * ```tsx
 * const updateAssignment = useUpdateEmployeeTariffAssignment()
 * updateAssignment.mutate({
 *   path: { id: employeeId, assignmentId },
 *   body: { effective_from: '2026-02-01' }
 * })
 * ```
 */
export function useUpdateEmployeeTariffAssignment() {
  return useApiMutation('/employees/{id}/tariff-assignments/{assignmentId}', 'put', {
    invalidateKeys: [
      ['/employees/{id}/tariff-assignments'],
      ['/employees/{id}/effective-tariff'],
      ['/employees'],
    ],
  })
}

/**
 * Hook to delete a tariff assignment.
 *
 * @example
 * ```tsx
 * const deleteAssignment = useDeleteEmployeeTariffAssignment()
 * deleteAssignment.mutate({ path: { id: employeeId, assignmentId } })
 * ```
 */
export function useDeleteEmployeeTariffAssignment() {
  return useApiMutation('/employees/{id}/tariff-assignments/{assignmentId}', 'delete', {
    invalidateKeys: [
      ['/employees/{id}/tariff-assignments'],
      ['/employees/{id}/effective-tariff'],
      ['/employees'],
    ],
  })
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
  return useApiQuery('/employees/{id}/effective-tariff', {
    path: { id: employeeId },
    params: { date },
    enabled: enabled && !!employeeId && !!date,
  })
}
