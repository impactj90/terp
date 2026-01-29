import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

interface UseHolidaysOptions {
  year?: number
  from?: string
  to?: string
  departmentId?: string
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
  const { year, from, to, departmentId, enabled = true } = options

  return useApiQuery('/holidays', {
    params: { year, from, to, department_id: departmentId },
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
 *     category: 1,
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

/**
 * Hook to generate holidays for a year and state.
 *
 * @example
 * ```tsx
 * const generateHolidays = useGenerateHolidays()
 * generateHolidays.mutate({
 *   body: { year: 2026, state: 'BY' }
 * })
 * ```
 */
export function useGenerateHolidays() {
  return useApiMutation('/holidays/generate', 'post', {
    invalidateKeys: [['/holidays']],
  })
}

/**
 * Hook to copy holidays from another year.
 *
 * @example
 * ```tsx
 * const copyHolidays = useCopyHolidays()
 * copyHolidays.mutate({
 *   body: { source_year: 2025, target_year: 2026 }
 * })
 * ```
 */
export function useCopyHolidays() {
  return useApiMutation('/holidays/copy', 'post', {
    invalidateKeys: [['/holidays']],
  })
}
