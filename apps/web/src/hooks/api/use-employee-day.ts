import { useApiQuery, useApiMutation } from '@/hooks'

interface UseEmployeeDayViewOptions {
  /** Whether the query is enabled */
  enabled?: boolean
  /** Stale time in milliseconds (default: 30 seconds for real-time feel) */
  staleTime?: number
}

/**
 * Hook to fetch the day view for a specific employee and date.
 * Returns bookings, daily value, day plan, and any errors for the day.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeDayView('123', '2026-01-25')
 * // Returns: { bookings, daily_value, day_plan, is_holiday, holiday, errors }
 * ```
 */
export function useEmployeeDayView(
  employeeId: string,
  date: string,
  options: UseEmployeeDayViewOptions | boolean = true
) {
  // Handle legacy boolean signature
  const opts = typeof options === 'boolean' ? { enabled: options } : options
  const { enabled = true, staleTime = 30 * 1000 } = opts

  return useApiQuery('/employees/{id}/day/{date}', {
    path: { id: employeeId, date },
    enabled: enabled && !!employeeId && !!date,
    staleTime,
  })
}

/**
 * Hook to trigger day calculation for an employee.
 *
 * @example
 * ```tsx
 * const calculateDay = useCalculateDay()
 * calculateDay.mutate({ path: { id: employeeId, date: '2026-01-25' } })
 * ```
 */
export function useCalculateDay() {
  return useApiMutation('/employees/{id}/day/{date}/calculate', 'post', {
    invalidateKeys: [['/employees'], ['/bookings'], ['/daily-values']],
  })
}
