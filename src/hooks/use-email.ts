/**
 * Email Hooks
 *
 * React hooks for email compose dialog, send, and send log.
 */
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEmailContext(documentId: string, documentType: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.email.send.getContext.queryOptions({ documentId, documentType })
  )
}

export function useSendEmail() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.send.send.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.send.sendLog.queryKey(),
      })
    },
  })
}

export function useEmailSendLog(
  documentId: string,
  params?: { page?: number; pageSize?: number }
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.email.send.sendLog.queryOptions({
      documentId,
      page: params?.page,
      pageSize: params?.pageSize,
    })
  )
}
