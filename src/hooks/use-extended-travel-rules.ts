import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseExtendedTravelRulesOptions {
  ruleSetId?: string
  enabled?: boolean
}

/**
 * Hook to fetch extended travel rules (tRPC).
 * Optionally filtered by ruleSetId.
 */
export function useExtendedTravelRules(
  options: UseExtendedTravelRulesOptions = {}
) {
  const { ruleSetId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.extendedTravelRules.list.queryOptions(
      ruleSetId ? { ruleSetId } : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single extended travel rule by ID (tRPC).
 */
export function useExtendedTravelRule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.extendedTravelRules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new extended travel rule (tRPC).
 */
export function useCreateExtendedTravelRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.extendedTravelRules.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.extendedTravelRules.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing extended travel rule (tRPC).
 */
export function useUpdateExtendedTravelRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.extendedTravelRules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.extendedTravelRules.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an extended travel rule (tRPC).
 */
export function useDeleteExtendedTravelRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.extendedTravelRules.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.extendedTravelRules.list.queryKey(),
      })
    },
  })
}
