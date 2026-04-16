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

export function useAutoMatchStatement() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bankStatements.autoMatch.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.counts.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.summary.queryKey(),
      })
    },
  })
}

export function useMatchProgress(statementId: string | null) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bankStatements.matchProgress.queryOptions(
      { statementId: statementId! },
      {
        enabled: !!statementId,
        refetchInterval: 1500,
      },
    ),
  )
}
