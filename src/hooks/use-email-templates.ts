import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEmailTemplates(documentType?: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.email.templates.list.queryOptions({ documentType })
  )
}

export function useEmailTemplate(id: string) {
  const trpc = useTRPC()
  return useQuery(trpc.email.templates.getById.queryOptions({ id }))
}

export function useCreateEmailTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.templates.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.templates.list.queryKey(),
      })
    },
  })
}

export function useUpdateEmailTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.templates.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.templates.list.queryKey(),
      })
    },
  })
}

export function useDeleteEmailTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.templates.remove.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.templates.list.queryKey(),
      })
    },
  })
}

export function useSeedEmailTemplateDefaults() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.email.templates.seedDefaults.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.email.templates.list.queryKey(),
      })
    },
  })
}
