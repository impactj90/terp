/**
 * Hooks for NK-1 threshold configuration.
 *
 * Wraps `trpc.nachkalkulation.thresholds.*` queries/mutations.
 */
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseNkThresholdsOptions {
  enabled?: boolean
}

export function useNkThresholds(options: UseNkThresholdsOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.thresholds.list.queryOptions(undefined, { enabled }),
  )
}

export function useUpsertNkDefaultThresholds() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.nachkalkulation.thresholds.upsertDefault.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.nachkalkulation.thresholds.list.queryKey(),
      })
    },
  })
}

export function useUpsertNkThresholdOverride() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.nachkalkulation.thresholds.upsertOverride.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.nachkalkulation.thresholds.list.queryKey(),
      })
    },
  })
}

export function useRemoveNkThresholdOverride() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.nachkalkulation.thresholds.removeOverride.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.nachkalkulation.thresholds.list.queryKey(),
      })
    },
  })
}
