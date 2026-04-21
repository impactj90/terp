import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Article Hooks ====================

interface UseWhArticlesOptions {
  search?: string
  groupId?: string
  isActive?: boolean
  stockTracking?: boolean
  belowMinStock?: boolean
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useWhArticles(options: UseWhArticlesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.list.queryOptions(
      {
        search: input.search,
        groupId: input.groupId,
        isActive: input.isActive,
        stockTracking: input.stockTracking,
        belowMinStock: input.belowMinStock,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhArticle(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useWhArticleSearch(query: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.search.queryOptions(
      { query, limit: 25 },
      { enabled }
    )
  )
}

export function useWhArticleGroups(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.groups.tree.queryOptions(
      undefined,
      { enabled }
    )
  )
}

export function useCreateWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
    },
  })
}

export function useUpdateWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useDeleteWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useRestoreWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.restore.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useHardDeleteWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.hardDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
    },
  })
}

export function useAdjustWhArticleStock() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.adjustStock.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

// ==================== Article Group Hooks ====================

export function useCreateWhArticleGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.groups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.groups.tree.queryKey(),
      })
    },
  })
}

export function useUpdateWhArticleGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.groups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.groups.tree.queryKey(),
      })
    },
  })
}

export function useDeleteWhArticleGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.groups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.groups.tree.queryKey(),
      })
    },
  })
}

// ==================== Supplier Hooks ====================

export function useWhArticleSuppliers(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.suppliersList.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

export function useAddWhArticleSupplier() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.suppliersAdd.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.suppliersList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useUpdateWhArticleSupplier() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.suppliersUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.suppliersList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useRemoveWhArticleSupplier() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.suppliersRemove.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.suppliersList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

// ==================== BOM Hooks ====================

export function useWhArticleBom(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.bomList.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

export function useAddWhArticleBom() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.bomAdd.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.bomList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useUpdateWhArticleBom() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.bomUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.bomList.queryKey(),
      })
    },
  })
}

export function useRemoveWhArticleBom() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.bomRemove.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.bomList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}
