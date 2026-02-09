import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiQuery, useApiMutation } from '@/hooks'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

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

interface GenerateFromTariffInput {
  employee_ids?: string[]
  from?: string
  to?: string
  overwrite_tariff_source?: boolean
}

/**
 * Hook to generate employee day plans from tariff week plans.
 * After generation, invalidates all employee-related queries so views
 * (timesheet, day view, daily values) show the updated day plans.
 *
 * @example
 * ```tsx
 * const generate = useGenerateFromTariff()
 * generate.mutate({ overwrite_tariff_source: true })
 * ```
 */
export function useGenerateFromTariff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: GenerateFromTariffInput) => {
      const token = authStorage.getToken()
      const tenantId = tenantIdStorage.getTenantId()

      const response = await fetch(
        `${clientEnv.apiUrl}/employee-day-plans/generate-from-tariff`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
          },
          body: JSON.stringify(input),
        }
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }))
        throw new Error(error.message || 'Failed to generate day plans')
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate all queries that depend on day plans:
      // - '/employee-day-plans' (day plans list)
      // - '/employees/{id}/day/{date}' (day view with day plan name)
      // - '/employees/{employee_id}/day-plans' (employee day plans)
      // - ['employees', id, 'months', ...] (daily values, custom key format)
      // - '/daily-values' (admin daily values list)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0]
          if (typeof key === 'string') {
            return (
              key.startsWith('/employees/') ||
              key === '/employee-day-plans' ||
              key === '/daily-values'
            )
          }
          return key === 'employees'
        },
      })
    },
  })
}
