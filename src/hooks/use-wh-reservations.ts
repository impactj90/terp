import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhReservations(
  options?: {
    articleId?: string
    documentId?: string
    status?: "ACTIVE" | "RELEASED" | "FULFILLED"
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.reservations.list.queryOptions(
      {
        articleId: options?.articleId,
        documentId: options?.documentId,
        status: options?.status,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useWhArticleAvailableStock(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.reservations.getByArticle.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useReleaseWhReservation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.reservations.release.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.getByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}

export function useReleaseWhReservationsBulk() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.reservations.releaseBulk.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.reservations.getByArticle.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.getById.queryKey(),
      })
    },
  })
}
