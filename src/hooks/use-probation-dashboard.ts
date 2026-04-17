import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/trpc"

export function useProbationDashboard(enabled = true) {
  const trpc = useTRPC()

  return useQuery(
    trpc.employees.probationDashboard.queryOptions(undefined, { enabled })
  )
}
