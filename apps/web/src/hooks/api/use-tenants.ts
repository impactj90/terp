import { useApiQuery, useApiMutation } from '@/hooks'

interface UseTenantsOptions {
  enabled?: boolean
  params?: { active?: boolean; include_inactive?: boolean; name?: string }
}

/**
 * Hook to fetch list of tenants.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTenants({ params: { include_inactive: true } })
 * ```
 */
export function useTenants(options: UseTenantsOptions = {}) {
  const { enabled = true, params } = options
  return useApiQuery('/tenants', { enabled, params })
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
  return useApiQuery('/tenants/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateTenant() {
  return useApiMutation('/tenants', 'post', {
    invalidateKeys: [['/tenants']],
  })
}

export function useUpdateTenant() {
  return useApiMutation('/tenants/{id}', 'patch', {
    invalidateKeys: [['/tenants']],
  })
}

export function useDeactivateTenant() {
  return useApiMutation('/tenants/{id}', 'delete', {
    invalidateKeys: [['/tenants']],
  })
}
