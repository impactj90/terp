import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useActiveOrderTarget(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.targets.getActive.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId },
    ),
  )
}

export function useOrderTargetVersions(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.targets.listVersions.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId },
    ),
  )
}

export function useUpsertOrderTarget() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.nachkalkulation.targets.upsert.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.nachkalkulation.targets.getActive.queryKey({
          orderId: variables.orderId,
        }),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.nachkalkulation.targets.listVersions.queryKey({
          orderId: variables.orderId,
        }),
      })
    },
  })
}
