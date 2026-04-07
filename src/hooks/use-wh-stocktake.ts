import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhStocktakes(
  options?: {
    status?: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
    search?: string
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stocktake.list.queryOptions(
      {
        status: options?.status,
        search: options?.search,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhStocktake(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stocktake.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useWhStocktakePositions(
  stocktakeId: string,
  options?: {
    search?: string
    uncountedOnly?: boolean
    differenceOnly?: boolean
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stocktake.getPositions.queryOptions(
      {
        stocktakeId,
        search: options?.search,
        uncountedOnly: options?.uncountedOnly,
        differenceOnly: options?.differenceOnly,
        page: options?.page,
        pageSize: options?.pageSize,
      },
      { enabled: enabled && !!stocktakeId }
    )
  )
}

export function useWhStocktakePositionByArticle(
  stocktakeId: string,
  articleId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stocktake.getPositionByArticle.queryOptions(
      { stocktakeId, articleId },
      { enabled: enabled && !!stocktakeId && !!articleId }
    )
  )
}

export function useWhStocktakeStats(stocktakeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stocktake.getStats.queryOptions(
      { stocktakeId },
      { enabled: enabled && !!stocktakeId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useCreateWhStocktake() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.list.queryKey(),
      })
    },
  })
}

export function useStartStocktakeCounting() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.startCounting.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getById.queryKey(),
      })
    },
  })
}

export function useRecordStocktakeCount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.recordCount.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getPositions.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getStats.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getPositionByArticle.queryKey(),
      })
    },
  })
}

export function useReviewStocktakePosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.reviewPosition.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getPositions.queryKey(),
      })
    },
  })
}

export function useSkipStocktakePosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.skipPosition.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getPositions.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getStats.queryKey(),
      })
    },
  })
}

export function useCompleteStocktake() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.complete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getById.queryKey(),
      })
      // Stock changed
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
      // New INVENTORY movements
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.movements.list.queryKey(),
      })
    },
  })
}

export function useCancelStocktake() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.getById.queryKey(),
      })
    },
  })
}

export function useDeleteStocktake() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stocktake.remove.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stocktake.list.queryKey(),
      })
    },
  })
}

export function useGenerateStocktakePdf() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.stocktake.generatePdf.mutationOptions(),
  })
}
