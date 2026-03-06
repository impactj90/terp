import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

// --- Interfaces ---

interface UseAuditLogsOptions {
  userId?: string
  entityType?: string
  entityId?: string
  action?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List audit logs with filters (tRPC).
 * Returns paginated results with total count.
 */
export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.auditLogs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

/**
 * Get a single audit log by ID (tRPC).
 */
export function useAuditLog(id: string | undefined) {
  const trpc = useTRPC()
  return useQuery(
    trpc.auditLogs.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    )
  )
}
