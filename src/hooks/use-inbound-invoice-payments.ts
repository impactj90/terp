import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useInboundInvoicePayments(invoiceId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inboundPayments.list.queryOptions(
      { invoiceId },
      { enabled: enabled && !!invoiceId }
    )
  )
}

export function useCreateInboundInvoicePayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.inboundPayments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inboundPayments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inbound.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inbound.list.queryKey(),
      })
    },
  })
}

export function useCancelInboundInvoicePayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.invoices.inboundPayments.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inboundPayments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inbound.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.invoices.inbound.list.queryKey(),
      })
    },
  })
}
