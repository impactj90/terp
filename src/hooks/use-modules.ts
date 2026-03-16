import { useTRPC } from '@/trpc'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Hook to fetch the list of enabled modules for the current tenant.
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

/**
 * Hook to enable a module for the current tenant.
 */
export function useEnableModule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation(
    trpc.tenantModules.enable.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.tenantModules.list.queryKey() })
      },
    })
  )
}

/**
 * Hook to disable a module for the current tenant.
 */
export function useDisableModule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation(
    trpc.tenantModules.disable.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.tenantModules.list.queryKey() })
      },
    })
  )
}
