import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { BillingDocumentType } from "@/generated/prisma/client"

// ==================== Billing Document Template Hooks ====================

export function useBillingDocumentTemplates() {
  const trpc = useTRPC()
  return useQuery(trpc.billing.documentTemplates.list.queryOptions())
}

export function useBillingDocumentTemplatesByType(documentType: BillingDocumentType) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documentTemplates.listByType.queryOptions(
      { documentType },
      { enabled: !!documentType }
    )
  )
}

export function useDefaultBillingDocumentTemplate(documentType: BillingDocumentType) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documentTemplates.getDefault.queryOptions(
      { documentType },
      { enabled: !!documentType }
    )
  )
}

export function useCreateBillingDocumentTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documentTemplates.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
      })
    },
  })
}

export function useUpdateBillingDocumentTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documentTemplates.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.getById.queryKey(),
      })
    },
  })
}

export function useDeleteBillingDocumentTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documentTemplates.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.getById.queryKey(),
      })
    },
  })
}

export function useSetDefaultBillingDocumentTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documentTemplates.setDefault.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.listByType.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documentTemplates.getDefault.queryKey(),
      })
    },
  })
}
