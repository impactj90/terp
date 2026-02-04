import { useApiQuery, useApiMutation } from '@/hooks'

interface UseEmployeeDayPlansOptions {
  employeeId?: string
  from?: string
  to?: string
  source?: 'tariff' | 'manual' | 'holiday'
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employee day plans with filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeDayPlans({
 *   from: '2026-01-01',
 *   to: '2026-01-31',
 * })
 * const assignments = data?.items ?? []
 * ```
 */
export function useEmployeeDayPlans(options: UseEmployeeDayPlansOptions = {}) {
  const { employeeId, from, to, source, limit, cursor, enabled = true } = options
  return useApiQuery('/employee-day-plans', {
    params: {
      employee_id: employeeId,
      from,
      to,
      source,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch day plans for a specific employee within a date range.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeDayPlansForEmployee(employeeId, '2026-01-01', '2026-01-31')
 * ```
 */
export function useEmployeeDayPlansForEmployee(
  employeeId: string,
  from: string,
  to: string,
  enabled = true
) {
  return useApiQuery('/employees/{employee_id}/day-plans', {
    path: { employee_id: employeeId },
    params: { from, to },
    enabled: enabled && !!employeeId && !!from && !!to,
  })
}

/**
 * Hook to create a single employee day plan.
 *
 * @example
 * ```tsx
 * const createPlan = useCreateEmployeeDayPlan()
 * createPlan.mutate({
 *   body: { employee_id: '...', plan_date: '2026-01-15', day_plan_id: '...', source: 'manual' }
 * })
 * ```
 */
export function useCreateEmployeeDayPlan() {
  return useApiMutation('/employee-day-plans', 'post', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to update an existing employee day plan by ID.
 *
 * @example
 * ```tsx
 * const updatePlan = useUpdateEmployeeDayPlan()
 * updatePlan.mutate({
 *   path: { id: '...' },
 *   body: { day_plan_id: '...', source: 'manual' }
 * })
 * ```
 */
export function useUpdateEmployeeDayPlan() {
  return useApiMutation('/employee-day-plans/{id}', 'put', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to bulk create/upsert employee day plans.
 *
 * @example
 * ```tsx
 * const bulkCreate = useBulkCreateEmployeeDayPlans()
 * bulkCreate.mutate({
 *   body: { plans: [{ employee_id: '...', plan_date: '2026-01-15', day_plan_id: '...' }] }
 * })
 * ```
 */
export function useBulkCreateEmployeeDayPlans() {
  return useApiMutation('/employee-day-plans/bulk', 'post', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to delete employee day plans in a date range.
 *
 * @example
 * ```tsx
 * const deleteRange = useDeleteEmployeeDayPlanRange()
 * deleteRange.mutate({
 *   body: { employee_id: '...', from: '2026-01-01', to: '2026-01-31' }
 * })
 * ```
 */
export function useDeleteEmployeeDayPlanRange() {
  return useApiMutation('/employee-day-plans/delete-range', 'post', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to delete a single employee day plan by ID.
 *
 * @example
 * ```tsx
 * const deletePlan = useDeleteEmployeeDayPlan()
 * deletePlan.mutate({ path: { id: '...' } })
 * ```
 */
export function useDeleteEmployeeDayPlan() {
  return useApiMutation('/employee-day-plans/{id}', 'delete', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}
