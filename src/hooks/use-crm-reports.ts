import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useCrmOverview(enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.overview.queryOptions(undefined, { enabled }))
}

export function useCrmAddressStats(
  params: { type?: "CUSTOMER" | "SUPPLIER" | "BOTH" } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.addressStats.queryOptions(params, { enabled }))
}

export function useCrmCorrespondenceByPeriod(
  params: { dateFrom: string; dateTo: string; groupBy: "day" | "week" | "month" },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.reports.correspondenceByPeriod.queryOptions(params, { enabled })
  )
}

export function useCrmCorrespondenceByType(
  params: { dateFrom: string; dateTo: string },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.reports.correspondenceByType.queryOptions(params, { enabled })
  )
}

export function useCrmInquiryPipeline(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.inquiryPipeline.queryOptions(params, { enabled }))
}

export function useCrmInquiryByEffort(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.inquiryByEffort.queryOptions(params, { enabled }))
}

export function useCrmTaskCompletion(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.taskCompletion.queryOptions(params, { enabled }))
}

export function useCrmTasksByAssignee(
  params: { dateFrom?: string; dateTo?: string } = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.tasksByAssignee.queryOptions(params, { enabled }))
}
