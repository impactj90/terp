import { useApiQuery, useApiMutation } from '@/hooks'

interface UseCostCentersOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of cost centers.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useCostCenters()
 * const costCenters = data?.data ?? []
 * ```
 */
export function useCostCenters(options: UseCostCentersOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/cost-centers', {
    enabled,
  })
}

/**
 * Hook to fetch a single cost center by ID.
 *
 * @example
 * ```tsx
 * const { data: costCenter, isLoading } = useCostCenter(costCenterId)
 * ```
 */
export function useCostCenter(id: string, enabled = true) {
  return useApiQuery('/cost-centers/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateCostCenter() {
  return useApiMutation('/cost-centers', 'post', {
    invalidateKeys: [['/cost-centers']],
  })
}

export function useUpdateCostCenter() {
  return useApiMutation('/cost-centers/{id}', 'patch', {
    invalidateKeys: [['/cost-centers']],
  })
}

export function useDeleteCostCenter() {
  return useApiMutation('/cost-centers/{id}', 'delete', {
    invalidateKeys: [['/cost-centers']],
  })
}
