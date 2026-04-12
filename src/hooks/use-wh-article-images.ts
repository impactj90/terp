import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhArticleImages(articleId: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.images.list.queryOptions(
      { articleId },
      { enabled: !!articleId }
    )
  )
}

export function useUploadWhArticleImage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const getUploadUrl = useMutation({
    ...trpc.warehouse.articles.images.getUploadUrl.mutationOptions(),
  })

  const confirmUpload = useMutation({
    ...trpc.warehouse.articles.images.confirm.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
      // Also invalidate article list to refresh thumbnails
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
    },
  })

  return { getUploadUrl, confirmUpload }
}

export function useSetPrimaryWhArticleImage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.images.setPrimary.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
    },
  })
}

export function useReorderWhArticleImages() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.images.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
    },
  })
}

export function useDeleteWhArticleImage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.images.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
    },
  })
}
