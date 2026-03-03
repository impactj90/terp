import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseTenantsOptions {
  enabled?: boolean
  params?: { active?: boolean; include_inactive?: boolean; name?: string }
}

/**
 * Hook to fetch list of tenants.
 *
 * Returns only tenants the current user has access to (via userTenants).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTenants({ params: { active: true } })
 * ```
 */
export function useTenants(options: UseTenantsOptions = {}) {
  const { enabled = true, params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.tenants.list.queryOptions(
      { name: params?.name, active: params?.active },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single tenant by ID.
 *
 * @example
 * ```tsx
 * const { data: tenant, isLoading } = useTenant(tenantId)
 * ```
 */
export function useTenant(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenants.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateTenant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.list.queryKey(),
      })
    },
  })
}

export function useUpdateTenant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.list.queryKey(),
      })
    },
  })
}

export function useDeactivateTenant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.deactivate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.list.queryKey(),
      })
    },
  })
}
