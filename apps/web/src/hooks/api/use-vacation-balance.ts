import { useApiQuery } from '@/hooks'

interface UseVacationBalancesOptions {
  employeeId?: string
  year?: number
  departmentId?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of vacation balances.
 *
 * @example
 * ```tsx
 * const { data } = useVacationBalances({
 *   employeeId: '123',
 *   year: 2026,
 * })
 * ```
 */
export function useVacationBalances(options: UseVacationBalancesOptions = {}) {
  const {
    employeeId,
    year,
    departmentId,
    enabled = true,
  } = options

  return useApiQuery('/vacation-balances', {
    params: {
      employee_id: employeeId,
      year,
      department_id: departmentId,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single vacation balance by ID.
 */
export function useVacationBalance(id: string, enabled = true) {
  return useApiQuery('/vacation-balances/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch vacation balance for a specific employee.
 * Uses the /employees/{id}/vacation-balance endpoint.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeVacationBalance('123', 2026)
 * ```
 */
export function useEmployeeVacationBalance(
  employeeId: string,
  year?: number,
  enabled = true
) {
  return useApiQuery('/employees/{id}/vacation-balance', {
    path: { id: employeeId },
    params: { year },
    enabled: enabled && !!employeeId,
  })
}
