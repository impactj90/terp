import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Interfaces ---

interface UseReportsOptions {
  reportType?: "daily_overview" | "weekly_overview" | "monthly_overview" |
    "employee_timesheet" | "department_summary" | "absence_report" |
    "vacation_report" | "overtime_report" | "account_balances" | "custom"
  status?: "pending" | "generating" | "completed" | "failed"
  limit?: number
  cursor?: string
  enabled?: boolean
}

// ==================== Query Hooks ====================

/**
 * List reports with filters (tRPC).
 * Supports polling when items are in pending/generating status.
 */
export function useReports(options: UseReportsOptions = {}) {
  const { reportType, status, limit, cursor, enabled = true } = options
  const trpc = useTRPC()
  return useQuery({
    ...trpc.reports.list.queryOptions(
      { reportType, status, limit, cursor },
      { enabled }
    ),
    refetchInterval: (query) => {
      const items = query.state.data?.data
      const hasInProgress = items?.some(
        (item) => item.status === "pending" || item.status === "generating"
      )
      return hasInProgress ? 3000 : false
    },
  })
}

/**
 * Get a single report by ID (tRPC).
 * Polls while status is pending/generating.
 */
export function useReport(id: string | undefined) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.reports.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    ),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" || status === "generating" ? 3000 : false
    },
  })
}

// ==================== Mutation Hooks ====================

/**
 * Generate a new report (tRPC).
 */
export function useGenerateReport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.reports.generate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.reports.list.queryKey(),
      })
    },
  })
}

/**
 * Delete a report (tRPC).
 */
export function useDeleteReport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.reports.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.reports.list.queryKey(),
      })
    },
  })
}

/**
 * Download a report file (tRPC).
 * Fetches base64-encoded content, decodes it, and triggers browser download.
 */
export function useDownloadReport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const result = await queryClient.fetchQuery(
        trpc.reports.download.queryOptions({ id })
      )
      let byteString: string
      try {
        byteString = atob(result.content)
      } catch {
        throw new Error('Failed to decode file content')
      }
      const bytes = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: result.contentType })
      const downloadName = filename ?? result.filename
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}
