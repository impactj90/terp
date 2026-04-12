import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhPurchaseOrders(
  options?: {
    supplierId?: string
    status?: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED"
    search?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.purchaseOrders.list.queryOptions(
      {
        supplierId: options?.supplierId,
        status: options?.status,
        search: options?.search,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhPurchaseOrder(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.purchaseOrders.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useWhReorderSuggestions(supplierId?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.purchaseOrders.reorderSuggestions.queryOptions(
      { supplierId },
      { enabled }
    )
  )
}

export function useWhPOPositions(purchaseOrderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.purchaseOrders.positions.list.queryOptions(
      { purchaseOrderId },
      { enabled: enabled && !!purchaseOrderId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useCreateWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
    },
  })
}

export function useUpdateWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}

export function useDeleteWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
    },
  })
}

export function useSendWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.sendOrder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
      // PO is now ORDERED → appears in goods receipt
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.goodsReceipt.listPendingOrders.queryKey(),
      })
    },
  })
}

export function useCancelWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}

export function useCreateWhPOFromSuggestions() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.createFromSuggestions.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.reorderSuggestions.queryKey(),
      })
    },
  })
}

export function useAddWhPOPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.positions.add.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.positions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}

export function useUpdateWhPOPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.positions.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.positions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}

export function useDeleteWhPOPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.positions.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.positions.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.getById.queryKey(),
      })
    },
  })
}

// ==================== PDF Hooks ====================

export function useGenerateWhPurchaseOrderPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.warehouse.purchaseOrders.generatePdf.mutationOptions())
}

export function useDownloadWhPurchaseOrderPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.warehouse.purchaseOrders.downloadPdf.mutationOptions())
}
