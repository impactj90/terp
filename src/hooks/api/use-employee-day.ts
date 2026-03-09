import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseEmployeeDayViewOptions {
  /** Whether the query is enabled */
  enabled?: boolean
  /** Stale time in milliseconds (default: 30 seconds for real-time feel) */
  staleTime?: number
}

/**
 * Hook to fetch the day view for a specific employee and date.
 * Returns bookings, daily value, day plan, holiday info, and errors for the day.
 *
 * Uses tRPC employees.dayView query.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeDayView('emp-123', '2026-01-25')
 * // Returns: { bookings, dailyValue, dayPlan, isHoliday, holiday, errors }
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
  const trpc = useTRPC()

  return useQuery(
    trpc.employees.dayView.queryOptions(
      { employeeId, date },
      {
        enabled: enabled && !!employeeId && !!date,
        staleTime,
      }
    )
  )
}

/**
 * Hook to trigger day calculation for an employee.
 * After successful calculation, invalidates day view and bookings queries.
 *
 * Uses tRPC employees.calculateDay mutation.
 *
 * @example
 * ```tsx
 * const calculateDay = useCalculateDay()
 * calculateDay.mutate({ employeeId: 'emp-123', date: '2026-01-25' })
 * ```
 */
export function useCalculateDay() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.employees.calculateDay.mutationOptions(),
    onSuccess: () => {
      // Invalidate day view queries so they refetch with new calculation
      queryClient.invalidateQueries({
        queryKey: trpc.employees.dayView.queryKey(),
      })
      // Also invalidate bookings list (calculated times may have changed)
      queryClient.invalidateQueries({
        queryKey: trpc.bookings.list.queryKey(),
      })
    },
  })
}
