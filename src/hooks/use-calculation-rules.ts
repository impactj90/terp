import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch calculation rules.
 */
export function useCalculationRules(
  options: {
    isActive?: boolean
    enabled?: boolean
  } = {}
) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.calculationRules.list.queryOptions({ isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single calculation rule by ID.
 */
export function useCalculationRule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.calculationRules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new calculation rule.
 */
export function useCreateCalculationRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.calculationRules.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.calculationRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.calculationRules.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing calculation rule.
 */
export function useUpdateCalculationRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.calculationRules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.calculationRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.calculationRules.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a calculation rule.
 */
export function useDeleteCalculationRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.calculationRules.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.calculationRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.calculationRules.getById.queryKey(),
      })
    },
  })
}
