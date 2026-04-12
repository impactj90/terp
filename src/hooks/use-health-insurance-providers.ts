import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch health insurance providers (read-only lookup).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useHealthInsuranceProviders()
 * const providers = data?.data ?? []
 * ```
 */
export function useHealthInsuranceProviders() {
  const trpc = useTRPC()
  return useQuery(trpc.healthInsuranceProviders.list.queryOptions())
}
