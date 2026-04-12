import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useWhStockValueSummary(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.stockValueSummary.queryOptions(
      undefined,
      { enabled }
    )
  )
}

export function useWhRecentMovements(limit = 10, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.recent.queryOptions(
      { limit },
      { enabled }
    )
  )
}
