import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useImapConfig(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.imapConfig.get.queryOptions(undefined, { enabled })
  )
}

export function useUpsertImapConfig() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.imapConfig.upsert.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.imapConfig.get.queryKey(),
      })
    },
  })
}

export function useTestImapConnection() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.imapConfig.testConnection.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.imapConfig.get.queryKey(),
      })
    },
  })
}
