import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface UseTeamDayViewsOptions {
  employeeIds: string[]
  date: string
  enabled?: boolean
  staleTime?: number
  refetchInterval?: number | false
}

/**
 * Hook to fetch day views for multiple employees in parallel.
 * Used by the Team Overview page to load attendance data for all team members at once.
 *
 * Uses `useQueries` from @tanstack/react-query to run N parallel queries efficiently.
 * Each query uses the same cache key format as `useEmployeeDayView` for consistency.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTeamDayViews({
 *   employeeIds: ['emp-1', 'emp-2'],
 *   date: '2026-01-27',
 * })
 * ```
 */
export function useTeamDayViews({
  employeeIds,
  date,
  enabled = true,
  staleTime = 30 * 1000,
  refetchInterval = false,
}: UseTeamDayViewsOptions) {
  const queries = useQueries({
    queries: employeeIds.map((employeeId) => ({
      queryKey: ['/employees/{id}/day/{date}', undefined, { id: employeeId, date }],
      queryFn: async () => {
        const { data, error } = await api.GET('/employees/{id}/day/{date}' as never, {
          params: {
            path: { id: employeeId, date },
          },
        } as never)
        if (error) throw error
        return { employeeId, ...(data as Record<string, unknown>) }
      },
      enabled: enabled && !!employeeId && !!date,
      staleTime,
      refetchInterval,
      refetchIntervalInBackground: Boolean(refetchInterval),
    })),
  })

  return {
    data: queries.map((q) => q.data),
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    refetchAll: () => queries.forEach((q) => q.refetch()),
  }
}
