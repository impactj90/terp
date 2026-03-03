import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

/**
 * Hook to fetch the current user's permissions via tRPC.
 *
 * Returns { permission_ids: string[], is_admin: boolean }.
 * Replaces the previous openapi-fetch call to GET /auth/permissions.
 */
export function useCurrentPermissions(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.auth.permissions.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
