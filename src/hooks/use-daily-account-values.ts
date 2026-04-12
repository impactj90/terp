import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useAccountValueSummary(
  accountId: string,
  year: number,
  month: number,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.dailyAccountValues.summary.queryOptions(
      { accountId, year, month },
      { enabled: enabled && !!accountId }
    )
  )
}
