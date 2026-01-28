import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { components } from '@/lib/api/types'

type DailyValue = components['schemas']['DailyValue']

export interface TeamDailyValuesResult {
  employeeId: string
  values: DailyValue[]
}

interface UseTeamDailyValuesOptions {
  employeeIds: string[]
  from: string
  to: string
  enabled?: boolean
  staleTime?: number
}

/**
 * Hook to fetch daily values for multiple employees over a date range.
 * Uses /daily-values with employee_id, from, and to filters per employee.
 */
export function useTeamDailyValues({
  employeeIds,
  from,
  to,
  enabled = true,
  staleTime = 60 * 1000,
}: UseTeamDailyValuesOptions) {
  const queries = useQueries({
    queries: employeeIds.map((employeeId) => ({
      queryKey: ['/daily-values', employeeId, from, to],
      queryFn: async (): Promise<TeamDailyValuesResult> => {
        const { data, error } = await api.GET('/daily-values' as never, {
          params: {
            query: {
              employee_id: employeeId,
              from,
              to,
              limit: 100,
            },
          },
        } as never)
        if (error) throw error

        return {
          employeeId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          values: ((data as any)?.data ?? []) as DailyValue[],
        }
      },
      enabled: enabled && !!employeeId && !!from && !!to,
      staleTime,
    })),
  })

  return {
    data: queries.map((q) => q.data).filter(Boolean) as TeamDailyValuesResult[],
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    refetchAll: () => queries.forEach((q) => q.refetch()),
  }
}
