import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to search activity codes (KldB classification).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useActivityCodesKldb("Software")
 * const codes = data?.data ?? []
 * ```
 */
export function useActivityCodesKldb(query: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.activityCodesKldb.search.queryOptions(
      { query },
      { enabled: enabled && !!query }
    )
  )
}
