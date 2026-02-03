import { useApiQuery, useApiMutation } from '@/hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

// --- Interfaces ---

/**
 * PayrollExportLine - inline schema from preview endpoint.
 * Not generated as a named type, defined manually.
 */
export interface PayrollExportLine {
  employee_id: string
  personnel_number: string
  first_name?: string
  last_name?: string
  department_code?: string
  cost_center_code?: string
  target_hours?: number
  worked_hours?: number
  overtime_hours?: number
  account_values?: Record<string, number>
  vacation_days?: number
  sick_days?: number
  other_absence_days?: number
}

export interface PayrollExportPreview {
  lines: PayrollExportLine[]
  summary: {
    employee_count: number
    total_hours: number
    total_overtime: number
  }
}

type PayrollExportStatus = 'pending' | 'generating' | 'completed' | 'failed'

interface UsePayrollExportsOptions {
  year?: number
  month?: number
  status?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List payroll exports with filters.
 * GET /payroll-exports
 */
export function usePayrollExports(options: UsePayrollExportsOptions = {}) {
  const { year, month, status, limit, cursor, enabled = true } = options
  return useApiQuery('/payroll-exports', {
    params: {
      year,
      month,
      status: status as PayrollExportStatus | undefined,
      limit,
      cursor,
    },
    enabled,
    // Poll list if any item is pending/generating
    refetchInterval: (query) => {
      const items = (query.state.data as { data?: Array<{ status?: string }> })?.data
      const hasInProgress = items?.some(
        (item) => item.status === 'pending' || item.status === 'generating'
      )
      return hasInProgress ? 3000 : false
    },
  })
}

/**
 * Get a single payroll export by ID.
 * GET /payroll-exports/{id}
 */
export function usePayrollExport(id: string | undefined) {
  return useApiQuery('/payroll-exports/{id}', {
    path: { id: id! },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string })?.status
      return (status === 'pending' || status === 'generating') ? 3000 : false
    },
  })
}

/**
 * Preview payroll export data.
 * GET /payroll-exports/{id}/preview
 *
 * NOTE: Response type is inline in the OpenAPI spec.
 * Using manual useQuery with typed response.
 */
export function usePayrollExportPreview(id: string | undefined, enabled = true) {
  return useQuery<PayrollExportPreview>({
    queryKey: ['/payroll-exports/{id}/preview', { id }],
    queryFn: async () => {
      const { data, error } = await api.GET('/payroll-exports/{id}/preview' as never, {
        params: { path: { id } },
      } as never)
      if (error) throw error
      return data as PayrollExportPreview
    },
    enabled: enabled && !!id,
  })
}

/**
 * List export interfaces (for generate dialog dropdown).
 * GET /export-interfaces
 */
export function useExportInterfaces(enabled = true) {
  return useApiQuery('/export-interfaces', {
    params: { active_only: true },
    enabled,
  })
}

// --- Mutation Hooks ---

/**
 * Generate a new payroll export.
 * POST /payroll-exports -> returns 202 (Accepted)
 *
 * NOTE: useApiMutation only infers return types from 200/201.
 * Using custom useMutation with manual typing (same pattern as
 * useRecalculateMonthlyValues in use-admin-monthly-values.ts).
 */
export function useGeneratePayrollExport() {
  const queryClient = useQueryClient()
  return useMutation<
    {
      id?: string
      status?: string
      year?: number
      month?: number
    },
    Error,
    {
      body: {
        year: number
        month: number
        format: string
        export_type?: string
        export_interface_id?: string
        parameters?: {
          employee_ids?: string[]
          department_ids?: string[]
          include_accounts?: string[]
        }
      }
    }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/payroll-exports' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as { id?: string; status?: string; year?: number; month?: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/payroll-exports'] })
    },
  })
}

/**
 * Delete a payroll export.
 * DELETE /payroll-exports/{id}
 */
export function useDeletePayrollExport() {
  return useApiMutation('/payroll-exports/{id}', 'delete', {
    invalidateKeys: [['/payroll-exports']],
  })
}

/**
 * Download a payroll export file as a blob.
 * Custom hook using raw fetch (openapi-fetch cannot handle blob responses).
 */
export function useDownloadPayrollExport() {
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const token = authStorage.getToken()
      const tenantId = tenantIdStorage.getTenantId()
      const response = await fetch(
        `${clientEnv.apiUrl}/payroll-exports/${id}/download`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
          },
        }
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          errorData?.detail ?? errorData?.title ?? `Download failed (${response.status})`
        )
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition')
      const extractedName = disposition?.match(/filename="?(.+?)"?$/)?.[1]
      const downloadName = extractedName ?? filename ?? 'export'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}
