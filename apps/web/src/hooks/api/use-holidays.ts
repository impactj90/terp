import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

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
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(trpc.holidays.list.queryOptions(input, { enabled }))
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
  const trpc = useTRPC()
  return useQuery(
    trpc.holidays.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new holiday.
 *
 * @example
 * ```tsx
 * const createHoliday = useCreateHoliday()
 * createHoliday.mutate({
 *   name: 'Christmas Day',
 *   holidayDate: '2026-12-25',
 *   holidayCategory: 1,
 * })
 * ```
 */
export function useCreateHoliday() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.holidays.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing holiday.
 *
 * @example
 * ```tsx
 * const updateHoliday = useUpdateHoliday()
 * updateHoliday.mutate({ id: holidayId, name: 'Updated Name' })
 * ```
 */
export function useUpdateHoliday() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.holidays.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a holiday.
 *
 * @example
 * ```tsx
 * const deleteHoliday = useDeleteHoliday()
 * deleteHoliday.mutate({ id: holidayId })
 * ```
 */
export function useDeleteHoliday() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.holidays.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to generate holidays for a year and state.
 *
 * @example
 * ```tsx
 * const generateHolidays = useGenerateHolidays()
 * generateHolidays.mutate({ year: 2026, state: 'BY' })
 * ```
 */
export function useGenerateHolidays() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.generate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.holidays.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to copy holidays from another year.
 *
 * @example
 * ```tsx
 * const copyHolidays = useCopyHolidays()
 * copyHolidays.mutate({ sourceYear: 2025, targetYear: 2026 })
 * ```
 */
export function useCopyHolidays() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.copy.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.holidays.list.queryKey(),
      })
    },
  })
}
