import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Document Hooks ====================

interface UseBillingDocumentsOptions {
  enabled?: boolean
  type?: "OFFER" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "SERVICE_NOTE" | "RETURN_DELIVERY" | "INVOICE" | "CREDIT_NOTE"
  status?: "DRAFT" | "PRINTED" | "PARTIALLY_FORWARDED" | "FORWARDED" | "CANCELLED"
  addressId?: string
  inquiryId?: string
  search?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

export function useBillingDocuments(options: UseBillingDocumentsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.list.queryOptions(
      {
        type: input.type,
        status: input.status,
        addressId: input.addressId,
        inquiryId: input.inquiryId,
        search: input.search,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useBillingDocumentById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

export function useUpdateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useDeleteBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

export function useFinalizeBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.finalize.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useForwardBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.forward.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useCancelBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useDuplicateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.duplicate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

// ==================== Position Hooks ====================

export function useBillingPositions(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.positions.list.queryOptions(
      { documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useAddBillingPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.add.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}

export function useUpdateBillingPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}

export function useDeleteBillingPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}

export function useReorderBillingPositions() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}
