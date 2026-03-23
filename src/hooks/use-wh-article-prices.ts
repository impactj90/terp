import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhPriceLists(params?: { isActive?: boolean; search?: string }, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articlePrices.listPriceLists.queryOptions(
      params ?? {},
      { enabled }
    )
  )
}

export function useWhArticlePrices(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articlePrices.listByArticle.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

export function useWhPriceListArticles(priceListId: string, search?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articlePrices.listByPriceList.queryOptions(
      { priceListId, search },
      { enabled: enabled && !!priceListId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useCreateWhPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.createPriceList.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listPriceLists.queryKey(),
      })
    },
  })
}

export function useUpdateWhPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.updatePriceList.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listPriceLists.queryKey(),
      })
    },
  })
}

export function useDeleteWhPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.deletePriceList.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listPriceLists.queryKey(),
      })
    },
  })
}

export function useSetWhArticlePrice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.setPrice.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey(),
      })
    },
  })
}

export function useRemoveWhArticlePrice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.removePrice.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey(),
      })
    },
  })
}

export function useBulkSetWhArticlePrices() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.bulkSetPrices.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey(),
      })
    },
  })
}

export function useCopyWhPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.copyPriceList.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey(),
      })
    },
  })
}

export function useAdjustWhPrices() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.adjustPrices.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey(),
      })
    },
  })
}
