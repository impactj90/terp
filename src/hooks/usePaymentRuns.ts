import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

// ==================== Types ====================

export interface PaymentRunProposalFilters {
  fromDueDate?: string
  toDueDate?: string
  supplierId?: string
  minAmountCents?: number
  maxAmountCents?: number
}

export interface PaymentRunListOptions {
  status?: "DRAFT" | "EXPORTED" | "BOOKED" | "CANCELLED"
  search?: string
  page?: number
  pageSize?: number
}

// ==================== Query Hooks ====================

export function usePaymentRunPreflight(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.paymentRuns.getPreflight.queryOptions(undefined, { enabled })
  )
}

export function usePaymentRunProposal(
  filters: PaymentRunProposalFilters,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.paymentRuns.getProposal.queryOptions(filters, { enabled })
  )
}

export function usePaymentRuns(options?: PaymentRunListOptions, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.paymentRuns.list.queryOptions(
      {
        status: options?.status,
        search: options?.search,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 20,
      },
      { enabled }
    )
  )
}

export function usePaymentRun(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.paymentRuns.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

function useInvalidatePaymentRuns() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.invoices.paymentRuns.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.invoices.paymentRuns.getById.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.invoices.paymentRuns.getProposal.queryKey(),
    })
  }
}

export function useCreatePaymentRun() {
  const trpc = useTRPC()
  const invalidate = useInvalidatePaymentRuns()
  return useMutation({
    ...trpc.invoices.paymentRuns.create.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useDownloadPaymentRunXml() {
  const trpc = useTRPC()
  const invalidate = useInvalidatePaymentRuns()
  return useMutation({
    ...trpc.invoices.paymentRuns.downloadXml.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useMarkPaymentRunBooked() {
  const trpc = useTRPC()
  const invalidate = useInvalidatePaymentRuns()
  return useMutation({
    ...trpc.invoices.paymentRuns.markBooked.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}

export function useCancelPaymentRun() {
  const trpc = useTRPC()
  const invalidate = useInvalidatePaymentRuns()
  return useMutation({
    ...trpc.invoices.paymentRuns.cancel.mutationOptions(),
    onSuccess: () => invalidate(),
  })
}
