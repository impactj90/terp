import { useTRPC } from "@/trpc"
import { useQueries } from "@tanstack/react-query"
import type { DailyValue } from "./use-daily-values"
import { transformToLegacyDailyValue } from "./use-daily-values"

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
 * Uses tRPC dailyValues.listAll with per-employee queries in parallel.
 *
 * Used by: Team Overview page.
 */
export function useTeamDailyValues({
  employeeIds,
  from,
  to,
  enabled = true,
  staleTime = 60 * 1000,
}: UseTeamDailyValuesOptions) {
  const trpc = useTRPC()

  const queries = useQueries({
    queries: employeeIds.map((employeeId) => ({
      ...trpc.dailyValues.listAll.queryOptions(
        {
          employeeId,
          fromDate: from,
          toDate: to,
          pageSize: 100,
        },
        {
          enabled: enabled && !!employeeId && !!from && !!to,
          staleTime,
        }
      ),
      select: (
        data: { items: Record<string, unknown>[]; total: number }
      ): TeamDailyValuesResult => ({
        employeeId,
        values: data.items.map((dv) =>
          transformToLegacyDailyValue(dv as unknown as Record<string, unknown>)
        ),
      }),
    })),
  })

  return {
    data: queries
      .map((q) => q.data)
      .filter(Boolean) as TeamDailyValuesResult[],
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    refetchAll: () => queries.forEach((q) => q.refetch()),
  }
}
