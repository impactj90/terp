import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function usePreviewStockBookings(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.previewStockBookings.queryOptions(
      { id: documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useConfirmStockBookings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.confirmStockBookings.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
    },
  })
}
