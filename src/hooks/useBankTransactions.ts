import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useBankTransactions(
  status: "unmatched" | "matched" | "ignored",
  options?: { limit?: number; offset?: number },
  enabled = true,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bankStatements.bankTransactions.list.queryOptions(
      { status, limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
      { enabled },
    ),
  )
}

export function useBankTransactionCounts(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bankStatements.bankTransactions.counts.queryOptions(
      undefined,
      { enabled },
    ),
  )
}

export function useBankTransactionById(id: string | null) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bankStatements.bankTransactions.getById.queryOptions(
      { id: id! },
      { enabled: !!id },
    ),
  )
}

export function useBankTransactionCandidates(
  bankTransactionId: string | null,
  addressId?: string,
  search?: string,
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.bankStatements.bankTransactions.getCandidates.queryOptions(
      { bankTransactionId: bankTransactionId!, addressId, search },
      { enabled: !!bankTransactionId },
    ),
  )
}

export function useManualMatchBankTransaction() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bankStatements.bankTransactions.manualMatch.mutationOptions(),
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
    },
  })
}

export function useUnmatchBankTransaction() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bankStatements.bankTransactions.unmatch.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.counts.queryKey(),
      })
    },
  })
}

export function useIgnoreBankTransaction() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.bankStatements.bankTransactions.ignore.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.bankStatements.bankTransactions.counts.queryKey(),
      })
    },
  })
}
