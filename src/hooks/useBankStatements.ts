import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useBankStatements(
  options?: { limit?: number; offset?: number },
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bankStatements.list.queryOptions(
      { limit: options?.limit ?? 25, offset: options?.offset ?? 0 },
      { enabled },
    ),
  )
}

export function useDeleteBankStatement() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bankStatements.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.counts.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.list.queryKey(),
      })
    },
  })
}

export function useImportBankStatement() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bankStatements.import.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.counts.queryKey(),
      })
    },
  })
}

export function useAutoMatchBatch() {
  const trpc = useTRPC()
  return useMutation(trpc.bankStatements.autoMatch.mutationOptions())
}

export function useLastUnmatchedStatement() {
  const trpc = useTRPC()
  return useQuery(trpc.bankStatements.lastUnmatched.queryOptions())
}
