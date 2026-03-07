import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Interfaces ---

/**
 * PayrollExportLine - structured line from preview endpoint.
 */
export interface PayrollExportLine {
  employeeId: string
  personnelNumber: string
  firstName: string
  lastName: string
  departmentCode: string
  costCenterCode: string
  targetHours: number
  workedHours: number
  overtimeHours: number
  accountValues: Record<string, number>
  vacationDays: number
  sickDays: number
  otherAbsenceDays: number
}

export interface PayrollExportPreview {
  lines: PayrollExportLine[]
  summary: {
    employeeCount: number
    totalHours: number
    totalOvertime: number
  }
}

interface UsePayrollExportsOptions {
  year?: number
  month?: number
  status?: "pending" | "generating" | "completed" | "failed"
  limit?: number
  cursor?: string
  enabled?: boolean
}

// ==================== Query Hooks ====================

/**
 * List payroll exports with filters (tRPC).
 * Supports polling when items are in pending/generating status.
 */
export function usePayrollExports(options: UsePayrollExportsOptions = {}) {
  const { year, month, status, limit, cursor, enabled = true } = options
  const trpc = useTRPC()
  return useQuery({
    ...trpc.payrollExports.list.queryOptions(
      { year, month, status, limit, cursor },
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
 * Get a single payroll export by ID (tRPC).
 * Polls while status is pending/generating.
 */
export function usePayrollExport(id: string | undefined) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.payrollExports.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    ),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" || status === "generating" ? 3000 : false
    },
  })
}

/**
 * Preview payroll export data (tRPC).
 */
export function usePayrollExportPreview(id: string | undefined, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.payrollExports.preview.queryOptions(
      { id: id! },
      { enabled: enabled && !!id }
    )
  )
}

/**
 * List export interfaces (for generate dialog dropdown) (tRPC).
 */
export function useExportInterfaces(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.exportInterfaces.list.queryOptions(
      { activeOnly: true },
      { enabled }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Generate a new payroll export (tRPC).
 */
export function useGeneratePayrollExport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.payrollExports.generate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.payrollExports.list.queryKey(),
      })
    },
  })
}

/**
 * Delete a payroll export (tRPC).
 */
export function useDeletePayrollExport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.payrollExports.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.payrollExports.list.queryKey(),
      })
    },
  })
}

/**
 * Download a payroll export file (tRPC).
 * Fetches base64-encoded content, decodes it, and triggers browser download.
 */
export function useDownloadPayrollExport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const result = await queryClient.fetchQuery(
        trpc.payrollExports.download.queryOptions({ id })
      )
      const byteString = atob(result.content)
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
