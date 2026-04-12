import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhPendingOrders(supplierId?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.goodsReceipt.listPendingOrders.queryOptions(
      { supplierId },
      { enabled }
    )
  )
}

export function useWhOrderPositions(purchaseOrderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.goodsReceipt.getOrderPositions.queryOptions(
      { purchaseOrderId },
      { enabled: enabled && !!purchaseOrderId }
    )
  )
}

export function useWhStockMovements(
  options?: {
    articleId?: string
    type?: "GOODS_RECEIPT" | "WITHDRAWAL" | "ADJUSTMENT" | "INVENTORY" | "RETURN"
    dateFrom?: string
    dateTo?: string
    purchaseOrderId?: string
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.list.queryOptions(
      {
        articleId: options?.articleId,
        type: options?.type,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
        purchaseOrderId: options?.purchaseOrderId,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhArticleMovements(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.listByArticle.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useBookGoodsReceipt() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stockMovements.goodsReceipt.book.mutationOptions(),
    onSuccess: () => {
      // Invalidate stock movements
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.listByArticle.queryKey(),
      })
      // Invalidate goods receipt queries (PO list changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.goodsReceipt.listPendingOrders.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.goodsReceipt.getOrderPositions.queryKey(),
      })
      // Invalidate articles (stock changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
      // Invalidate POs (status changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}

export function useBookSinglePosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stockMovements.goodsReceipt.bookSingle.mutationOptions(),
    onSuccess: () => {
      // Invalidate stock movements
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.listByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.goodsReceipt.listPendingOrders.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.goodsReceipt.getOrderPositions.queryKey(),
      })
      // Invalidate articles (stock changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
      // Invalidate POs (status changed)
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}
