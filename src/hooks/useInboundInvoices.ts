import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useInboundInvoices(
  options?: {
    status?: string
    supplierId?: string
    supplierStatus?: string
    orderId?: string
    costCenterId?: string
    search?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inbound.list.queryOptions(
      {
        status: options?.status,
        supplierId: options?.supplierId,
        supplierStatus: options?.supplierStatus,
        orderId: options?.orderId,
        costCenterId: options?.costCenterId,
        search: options?.search,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useInboundInvoice(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inbound.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useInboundInvoicePdfUrl(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inbound.getPdfUrl.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

function useInvalidateInbound() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.invoices.inbound.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.invoices.inbound.getById.queryKey(),
    })
  }
}

export function useGetUploadUrl() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.invoices.inbound.getUploadUrl.mutationOptions(),
  })
}

export function useCreateFromUpload() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.createFromUpload.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateInboundInvoice() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.update.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateInboundInvoiceLineItems() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.updateLineItems.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useAssignInboundInvoiceSupplier() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.assignSupplier.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useSubmitInboundInvoiceForApproval() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.submitForApproval.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useReopenExportedInboundInvoice() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.reopenExported.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useCancelInboundInvoice() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.cancel.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useRemoveInboundInvoice() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.remove.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

// ==================== Approval Hooks ====================

export function usePendingApprovals(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inbound.pendingApprovals.queryOptions(
      undefined,
      { enabled }
    )
  )
}

export function useApprovalHistory(invoiceId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inbound.approvalHistory.queryOptions(
      { invoiceId },
      { enabled: enabled && !!invoiceId }
    )
  )
}

export function useApproveInboundInvoice() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.inbound.approve.mutationOptions(),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inbound.pendingApprovals.queryKey(),
      })
    },
  })
}

export function useRejectInboundInvoice() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.inbound.reject.mutationOptions(),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inbound.pendingApprovals.queryKey(),
      })
    },
  })
}

// ==================== DATEV Export Hook ====================

export function useExportDatev() {
  const trpc = useTRPC()
  const invalidate = useInvalidateInbound()
  return useMutation({
    ...trpc.invoices.inbound.exportDatev.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}
