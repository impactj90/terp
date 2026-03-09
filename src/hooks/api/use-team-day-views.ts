import { useTRPC } from "@/trpc"
import { useQueries } from "@tanstack/react-query"

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
 * Uses tRPC employees.dayView query via useQueries for parallel fetching.
 * Each query shares the same cache as individual useEmployeeDayView calls.
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
  const trpc = useTRPC()

  const queries = useQueries({
    queries: employeeIds.map((employeeId) =>
      trpc.employees.dayView.queryOptions(
        { employeeId, date },
        {
          enabled: enabled && !!employeeId && !!date,
          staleTime,
          refetchInterval,
          refetchIntervalInBackground: Boolean(refetchInterval),
        }
      )
    ),
  })

  return {
    data: queries.map((q) => q.data),
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    refetchAll: () => queries.forEach((q) => q.refetch()),
  }
}
