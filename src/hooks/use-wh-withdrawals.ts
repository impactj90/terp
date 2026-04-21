import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhWithdrawals(
  options?: {
    orderId?: string
    documentId?: string
    machineId?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.withdrawals.list.queryOptions(
      {
        orderId: options?.orderId,
        documentId: options?.documentId,
        machineId: options?.machineId,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhWithdrawalsByOrder(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.withdrawals.listByOrder.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId }
    )
  )
}

export function useWhWithdrawalsByDocument(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.withdrawals.listByDocument.queryOptions(
      { documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useWhWithdrawalsByServiceObject(
  serviceObjectId: string,
  params?: { limit?: number },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.withdrawals.listByServiceObject.queryOptions(
      { serviceObjectId, limit: params?.limit ?? 50 },
      { enabled: enabled && !!serviceObjectId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useCreateWhWithdrawal() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.withdrawals.create.mutationOptions(),
    onSuccess: () => {
      // Invalidate withdrawal queries
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByOrder.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByDocument.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByServiceObject.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.serviceObjects.getHistory.queryKey(),
      })
      // Invalidate stock movements
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.listByArticle.queryKey(),
      })
      // Invalidate articles (stock changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useCreateBatchWhWithdrawal() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.withdrawals.createBatch.mutationOptions(),
    onSuccess: () => {
      // Invalidate withdrawal queries
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByOrder.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByDocument.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByServiceObject.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.serviceObjects.getHistory.queryKey(),
      })
      // Invalidate stock movements
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.listByArticle.queryKey(),
      })
      // Invalidate articles (stock changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useCancelWhWithdrawal() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.withdrawals.cancel.mutationOptions(),
    onSuccess: () => {
      // Invalidate withdrawal queries
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByOrder.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByDocument.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.withdrawals.listByServiceObject.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.serviceObjects.getHistory.queryKey(),
      })
      // Invalidate stock movements
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.listByArticle.queryKey(),
      })
      // Invalidate articles (stock changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}
