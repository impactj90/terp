import { useTRPC } from "@/trpc"
import { useMutation, useQuery } from "@tanstack/react-query"

export function useOutgoingInvoiceBookList(
  dateFrom: Date,
  dateTo: Date,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.outgoingInvoiceBook.list.queryOptions(
      { dateFrom, dateTo },
      { enabled }
    )
  )
}

export function useExportOutgoingInvoiceBookPdf() {
  const trpc = useTRPC()
  return useMutation(
    trpc.billing.outgoingInvoiceBook.exportPdf.mutationOptions()
  )
}

export function useExportOutgoingInvoiceBookCsv() {
  const trpc = useTRPC()
  return useMutation(
    trpc.billing.outgoingInvoiceBook.exportCsv.mutationOptions()
  )
}
