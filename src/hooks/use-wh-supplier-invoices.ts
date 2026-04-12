import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

export function useWhSupplierInvoices(
  options?: {
    supplierId?: string
    status?: "OPEN" | "PARTIAL" | "PAID" | "CANCELLED"
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
    trpc.warehouse.supplierInvoices.list.queryOptions(
      {
        supplierId: options?.supplierId,
        status: options?.status,
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

export function useWhSupplierInvoice(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.supplierInvoices.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useWhSupplierInvoiceSummary(
  supplierId?: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.supplierInvoices.summary.queryOptions(
      { supplierId },
      { enabled }
    )
  )
}

export function useWhSupplierPayments(invoiceId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.supplierInvoices.payments.list.queryOptions(
      { invoiceId },
      { enabled: enabled && !!invoiceId }
    )
  )
}

// ==================== Mutation Hooks ====================

export function useCreateWhSupplierInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.supplierInvoices.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.summary.queryKey(),
      })
    },
  })
}

export function useUpdateWhSupplierInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.supplierInvoices.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.summary.queryKey(),
      })
    },
  })
}

export function useCancelWhSupplierInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.supplierInvoices.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.summary.queryKey(),
      })
    },
  })
}

export function useCreateWhSupplierPayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.supplierInvoices.payments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.payments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.summary.queryKey(),
      })
    },
  })
}

export function useCancelWhSupplierPayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.supplierInvoices.payments.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.payments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.supplierInvoices.summary.queryKey(),
      })
    },
  })
}
