import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseTravelAllowanceRuleSetsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch travel allowance rule sets (tRPC).
 */
export function useTravelAllowanceRuleSets(
  options: UseTravelAllowanceRuleSetsOptions = {}
) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.travelAllowanceRuleSets.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single travel allowance rule set by ID (tRPC).
 */
export function useTravelAllowanceRuleSet(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.travelAllowanceRuleSets.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new travel allowance rule set (tRPC).
 */
export function useCreateTravelAllowanceRuleSet() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.travelAllowanceRuleSets.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.travelAllowanceRuleSets.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing travel allowance rule set (tRPC).
 */
export function useUpdateTravelAllowanceRuleSet() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.travelAllowanceRuleSets.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.travelAllowanceRuleSets.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a travel allowance rule set (tRPC).
 */
export function useDeleteTravelAllowanceRuleSet() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.travelAllowanceRuleSets.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.travelAllowanceRuleSets.list.queryKey(),
      })
    },
  })
}
