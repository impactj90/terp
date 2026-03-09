import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseCostCentersOptions {
  enabled?: boolean
  isActive?: boolean
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
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.costCenters.list.queryOptions({ isActive }, { enabled })
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.costCenters.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new cost center.
 *
 * @example
 * ```tsx
 * const createCostCenter = useCreateCostCenter()
 * createCostCenter.mutate({ code: 'CC001', name: 'Engineering' })
 * ```
 */
export function useCreateCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.costCenters.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing cost center.
 *
 * @example
 * ```tsx
 * const updateCostCenter = useUpdateCostCenter()
 * updateCostCenter.mutate({ id: costCenterId, name: 'Updated Name' })
 * ```
 */
export function useUpdateCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.costCenters.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a cost center.
 *
 * @example
 * ```tsx
 * const deleteCostCenter = useDeleteCostCenter()
 * deleteCostCenter.mutate({ id: costCenterId })
 * ```
 */
export function useDeleteCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.costCenters.list.queryKey(),
      })
    },
  })
}
