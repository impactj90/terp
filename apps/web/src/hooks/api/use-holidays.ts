import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

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
 *
 * @example
 * ```tsx
 * const { data: holiday, isLoading } = useHoliday(holidayId)
 * ```
 */
export function useHoliday(id: string, enabled = true) {
  return useApiQuery('/holidays/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new holiday.
 *
 * @example
 * ```tsx
 * const createHoliday = useCreateHoliday()
 * createHoliday.mutate({
 *   body: {
 *     name: 'Christmas Day',
 *     holiday_date: '2026-12-25',
 *     is_half_day: false,
 *     applies_to_all: true,
 *   }
 * })
 * ```
 */
export function useCreateHoliday() {
  return useApiMutation('/holidays', 'post', {
    invalidateKeys: [['/holidays']],
  })
}

/**
 * Hook to update an existing holiday.
 *
 * @example
 * ```tsx
 * const updateHoliday = useUpdateHoliday()
 * updateHoliday.mutate({
 *   path: { id: holidayId },
 *   body: { name: 'Updated Name' }
 * })
 * ```
 */
export function useUpdateHoliday() {
  return useApiMutation('/holidays/{id}', 'patch', {
    invalidateKeys: [['/holidays']],
  })
}

/**
 * Hook to delete a holiday.
 *
 * @example
 * ```tsx
 * const deleteHoliday = useDeleteHoliday()
 * deleteHoliday.mutate({ path: { id: holidayId } })
 * ```
 */
export function useDeleteHoliday() {
  return useApiMutation('/holidays/{id}', 'delete', {
    invalidateKeys: [['/holidays']],
  })
}
