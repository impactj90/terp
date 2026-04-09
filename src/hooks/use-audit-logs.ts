import { useTRPC } from "@/trpc"
import { useQuery, useMutation } from "@tanstack/react-query"

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

// --- Export Mutation Hooks ---

/**
 * Export audit logs as CSV (tRPC mutation).
 * Returns base64-encoded CSV with filename and count.
 */
export function useExportAuditLogsCsv() {
  const trpc = useTRPC()
  return useMutation(trpc.auditLogs.exportCsv.mutationOptions())
}

/**
 * Export audit logs as PDF (tRPC mutation).
 * Returns base64-encoded PDF with filename and count.
 */
export function useExportAuditLogsPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.auditLogs.exportPdf.mutationOptions())
}
