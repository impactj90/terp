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
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.getById.queryKey(),
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
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.getById.queryKey(),
      })
    },
  })
}

// --- Support access (Phase 6 — platform-admin-system) ---

/**
 * Hook returning recent support sessions (pending / active / expired / revoked)
 * for the current tenant. Powers the settings page table.
 */
export function useSupportSessions(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenants.listSupportSessions.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook returning the currently-active support session (if any) for banner
 * display. Polls every 30s so the banner disappears promptly after
 * expiry/revocation.
 */
export function useActiveSupportSession() {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenants.activeSupportSession.queryOptions(undefined, {
      refetchInterval: 30_000,
    })
  )
}

export function useRequestSupportAccess() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.requestSupportAccess.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.listSupportSessions.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.activeSupportSession.queryKey(),
      })
    },
  })
}

export function useRevokeSupportAccess() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.revokeSupportAccess.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.listSupportSessions.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tenants.activeSupportSession.queryKey(),
      })
    },
  })
}
