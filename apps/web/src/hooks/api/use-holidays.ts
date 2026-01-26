import { useApiQuery } from '@/hooks'

interface UseHolidaysOptions {
  year?: number
  from?: string
  to?: string
  enabled?: boolean
}

/**
 * Hook to fetch public holidays.
 *
 * @example
 * ```tsx
 * // Fetch holidays for a specific year
 * const { data } = useHolidays({ year: 2026 })
 *
 * // Fetch holidays for a date range
 * const { data } = useHolidays({
 *   from: '2026-01-01',
 *   to: '2026-12-31',
 * })
 * ```
 */
export function useHolidays(options: UseHolidaysOptions = {}) {
  const { year, from, to, enabled = true } = options

  return useApiQuery('/holidays', {
    params: { year, from, to },
    enabled,
  })
}

/**
 * Hook to fetch a single holiday by ID.
 */
export function useHoliday(id: string, enabled = true) {
  return useApiQuery('/holidays/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
