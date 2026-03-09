import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

/**
 * Hook to fetch the permission catalog (all available permissions) via tRPC.
 *
 * Replaces the previous openapi-fetch call to GET /permissions.
 * Returns { permissions: Permission[] }.
 */
export function usePermissions(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.permissions.list.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
