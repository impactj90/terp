import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useInboundEmailLog(
  options?: {
    status?: string
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
    trpc.invoices.emailLog.list.queryOptions(
      {
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
