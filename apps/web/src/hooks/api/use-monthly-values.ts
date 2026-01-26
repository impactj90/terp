import { useApiQuery, useApiMutation } from '@/hooks'

interface UseMonthlyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  status?: 'open' | 'calculated' | 'closed' | 'exported'
  departmentId?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of monthly values.
 *
 * @example
 * ```tsx
 * const { data } = useMonthlyValues({
 *   employeeId: '123',
 *   year: 2026,
 *   month: 1,
 * })
 * ```
 */
export function useMonthlyValues(options: UseMonthlyValuesOptions = {}) {
  const {
    employeeId,
    year,
    month,
    status,
    departmentId,
    enabled = true,
  } = options

  return useApiQuery('/monthly-values', {
    params: {
      employee_id: employeeId,
      year,
      month,
      status,
      department_id: departmentId,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single monthly value by ID.
 */
export function useMonthlyValue(id: string, enabled = true) {
  return useApiQuery('/monthly-values/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to close a monthly value.
 */
export function useCloseMonthlyValue() {
  return useApiMutation('/monthly-values/{id}/close', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Hook to reopen a monthly value.
 */
export function useReopenMonthlyValue() {
  return useApiMutation('/monthly-values/{id}/reopen', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}
