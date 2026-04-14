import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Open Items Hooks ====================

interface UseBillingOpenItemsOptions {
  enabled?: boolean
  addressId?: string
  status?: "open" | "partial" | "paid" | "overdue"
  search?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

export function useBillingOpenItems(options: UseBillingOpenItemsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.payments.openItems.list.queryOptions(
      {
        addressId: input.addressId,
        status: input.status,
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

export function useBillingOpenItem(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.payments.openItems.getById.queryOptions(
      { documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useBillingOpenItemsSummary(addressId?: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.payments.openItems.summary.queryOptions({ addressId })
  )
}

// ==================== Billing Payment Hooks ====================

export function useBillingPayments(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.payments.list.queryOptions(
      { documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useCreateBillingPayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.payments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.summary.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      // A new payment may have changed the live open amount of an
      // invoice that is referenced by a DRAFT reminder — the server
      // refreshes on read, but the client cache (5min staleTime) has
      // to be invalidated so the detail sheet actually re-fetches.
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getRun.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listRuns.queryKey(),
      })
    },
  })
}

export function useCancelBillingPayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.payments.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.openItems.summary.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getRun.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listRuns.queryKey(),
      })
    },
  })
}
