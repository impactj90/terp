import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useCrmCorrespondenceAttachments(correspondenceId: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.correspondence.attachments.list.queryOptions(
      { correspondenceId },
      { enabled: !!correspondenceId }
    )
  )
}

export function useUploadCrmCorrespondenceAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const getUploadUrl = useMutation({
    ...trpc.crm.correspondence.attachments.getUploadUrl.mutationOptions(),
  })

  const confirmUpload = useMutation({
    ...trpc.crm.correspondence.attachments.confirm.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.attachments.list.queryKey(),
      })
    },
  })

  return { getUploadUrl, confirmUpload }
}

export function useDeleteCrmCorrespondenceAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.correspondence.attachments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.attachments.list.queryKey(),
      })
    },
  })
}

export function useCrmCorrespondenceDownloadUrl(id: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.correspondence.attachments.getDownloadUrl.queryOptions(
      { id },
      { enabled: !!id }
    )
  )
}
