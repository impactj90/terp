import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseLocalTravelRulesOptions {
  ruleSetId?: string
  enabled?: boolean
}

/**
 * Hook to fetch local travel rules (tRPC).
 * Optionally filtered by ruleSetId.
 */
export function useLocalTravelRules(
  options: UseLocalTravelRulesOptions = {}
) {
  const { ruleSetId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.localTravelRules.list.queryOptions(
      ruleSetId ? { ruleSetId } : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single local travel rule by ID (tRPC).
 */
export function useLocalTravelRule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.localTravelRules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new local travel rule (tRPC).
 */
export function useCreateLocalTravelRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.localTravelRules.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.localTravelRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.localTravelRules.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing local travel rule (tRPC).
 */
export function useUpdateLocalTravelRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.localTravelRules.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.localTravelRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.localTravelRules.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a local travel rule (tRPC).
 */
export function useDeleteLocalTravelRule() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.localTravelRules.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.localTravelRules.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.localTravelRules.getById.queryKey(),
      })
    },
  })
}
