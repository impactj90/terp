import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Recurring Invoice Hooks ====================

interface UseBillingRecurringInvoicesOptions {
  enabled?: boolean
  isActive?: boolean
  addressId?: string
  search?: string
  page?: number
  pageSize?: number
}

export function useBillingRecurringInvoices(options: UseBillingRecurringInvoicesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.recurringInvoices.list.queryOptions(
      { isActive: input.isActive, addressId: input.addressId, search: input.search, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

export function useBillingRecurringInvoice(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.recurringInvoices.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useBillingRecurringInvoicePreview(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.recurringInvoices.preview.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
    },
  })
}

export function useUpdateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
    },
  })
}

export function useDeleteBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
    },
  })
}

export function useActivateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.activate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
    },
  })
}

export function useDeactivateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.deactivate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
    },
  })
}

export function useGenerateRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.generate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
      // Also invalidate billing documents list since a new invoice was created
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.list.queryKey() })
    },
  })
}

export function useGenerateDueRecurringInvoices() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.generateDue.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.list.queryKey() })
    },
  })
}
