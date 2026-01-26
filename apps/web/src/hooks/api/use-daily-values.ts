import { useApiQuery, useApiMutation } from '@/hooks'

interface UseDailyValuesOptions {
  employeeId?: string
  from?: string // YYYY-MM-DD
  to?: string // YYYY-MM-DD
  status?: 'pending' | 'calculated' | 'error' | 'approved'
  hasErrors?: boolean
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of daily values.
 *
 * @example
 * ```tsx
 * const { data } = useDailyValues({
 *   employeeId: '123',
 *   from: '2026-01-01',
 *   to: '2026-01-31',
 * })
 * ```
 */
export function useDailyValues(options: UseDailyValuesOptions = {}) {
  const {
    employeeId,
    from,
    to,
    status,
    hasErrors,
    limit = 50,
    cursor,
    enabled = true,
  } = options

  return useApiQuery('/daily-values', {
    params: {
      employee_id: employeeId,
      from,
      to,
      status,
      has_errors: hasErrors,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single daily value by ID.
 */
export function useDailyValue(id: string, enabled = true) {
  return useApiQuery('/daily-values/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to recalculate daily values.
 */
export function useRecalculateDailyValues() {
  return useApiMutation('/daily-values/recalculate', 'post', {
    invalidateKeys: [['/daily-values'], ['/monthly-values']],
  })
}

/**
 * Hook to approve a daily value.
 */
export function useApproveDailyValue() {
  return useApiMutation('/daily-values/{id}/approve', 'post', {
    invalidateKeys: [['/daily-values']],
  })
}
