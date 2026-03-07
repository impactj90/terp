import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

interface UseMonthlyEvaluationsOptions {
  isActive?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of monthly evaluation templates (tRPC).
 */
export function useMonthlyEvaluations(options: UseMonthlyEvaluationsOptions = {}) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.monthlyEvalTemplates.list.queryOptions(
      { isActive },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single monthly evaluation template by ID (tRPC).
 */
export function useMonthlyEvaluation(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.monthlyEvalTemplates.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * Hook to fetch the default monthly evaluation template (tRPC).
 */
export function useDefaultMonthlyEvaluation(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.monthlyEvalTemplates.getDefault.queryOptions(
      undefined,
      { enabled }
    )
  )
}

// --- Mutation Hooks ---

/**
 * Hook to create a new monthly evaluation template (tRPC).
 */
export function useCreateMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getDefault.queryKey() })
    },
  })
}

/**
 * Hook to update an existing monthly evaluation template (tRPC).
 */
export function useUpdateMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getDefault.queryKey() })
    },
  })
}

/**
 * Hook to delete a monthly evaluation template (tRPC).
 */
export function useDeleteMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getById.queryKey() })
    },
  })
}

/**
 * Hook to set a monthly evaluation template as the default (tRPC).
 */
export function useSetDefaultMonthlyEvaluation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.monthlyEvalTemplates.setDefault.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getDefault.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyEvalTemplates.getById.queryKey() })
    },
  })
}
