/**
 * Hooks for NK-1 Nachkalkulation reports.
 *
 * Wraps `trpc.nachkalkulation.reports.*` queries.
 */
import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useNkSollIstReport(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.reports.sollIst.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId },
    ),
  )
}

export function useNkIstAufwand(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.reports.istAufwand.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId },
    ),
  )
}

interface UseNkIstAufwandBatchOptions {
  enabled?: boolean
}

export function useNkIstAufwandBatch(
  orderIds: string[],
  options: UseNkIstAufwandBatchOptions = {},
) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.reports.istAufwandBatch.queryOptions(
      { orderIds },
      { enabled: enabled && orderIds.length > 0 },
    ),
  )
}

export type NkDimension =
  | "customer"
  | "service_object"
  | "employee"
  | "order_type"

export type NkSortBy =
  | "margin_desc"
  | "margin_asc"
  | "hourly_margin_desc"
  | "revenue_desc"

interface UseNkByDimensionParams {
  dimension: NkDimension
  dateFrom: string
  dateTo: string
  orderTypeId?: string
  sortBy?: NkSortBy
  limit?: number
}

interface UseNkByDimensionOptions {
  enabled?: boolean
}

export function useNkByDimension(
  params: UseNkByDimensionParams,
  options: UseNkByDimensionOptions = {},
) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.reports.byDimension.queryOptions(params, { enabled }),
  )
}

export type NkDashboardSortBy =
  | "margin_desc"
  | "margin_asc"
  | "hourly_margin_desc"

interface UseNkRecentOrdersDashboardParams {
  days?: number
  sortBy?: NkDashboardSortBy
  limit?: number
}

interface UseNkRecentOrdersDashboardOptions {
  enabled?: boolean
}

export function useNkRecentOrdersDashboard(
  params: UseNkRecentOrdersDashboardParams = {},
  options: UseNkRecentOrdersDashboardOptions = {},
) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.nachkalkulation.reports.recentOrdersDashboard.queryOptions(params, {
      enabled,
    }),
  )
}
