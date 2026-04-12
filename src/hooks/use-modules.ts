import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

/**
 * Hook to fetch the list of enabled modules for the current tenant.
 *
 * Phase 9: the companion mutation hooks were removed. Module booking is an
 * operator-hoheit action on `/platform/tenants/[id]/modules`.
 */
export function useModules(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenantModules.list.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
