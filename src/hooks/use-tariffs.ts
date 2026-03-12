import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch list of tariffs (tRPC).
 *
 * Supports optional isActive filter.
 */
export function useTariffs(
  options: {
    isActive?: boolean
    enabled?: boolean
  } = {}
) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.tariffs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single tariff by ID with all relations (tRPC).
 */
export function useTariff(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tariffs.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new tariff (tRPC).
 */
export function useCreateTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tariffs.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing tariff (tRPC).
 */
export function useUpdateTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tariffs.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a tariff (tRPC).
 */
export function useDeleteTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tariffs.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to add a break to a tariff (tRPC).
 */
export function useCreateTariffBreak() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tariffs.createBreak.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a break from a tariff (tRPC).
 */
export function useDeleteTariffBreak() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tariffs.deleteBreak.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.getById.queryKey(),
      })
    },
  })
}
