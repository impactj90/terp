import { useApiQuery, useApiMutation } from '@/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'
import type { components } from '@/lib/api/types'

// --- Interfaces ---

type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed'

interface UseReportsOptions {
  reportType?: string
  status?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List reports with filters.
 * GET /reports
 */
export function useReports(options: UseReportsOptions = {}) {
  const { reportType, status, limit, cursor, enabled = true } = options
  return useApiQuery('/reports', {
    params: {
      report_type: reportType as components['schemas']['Report']['report_type'] | undefined,
      status: status as ReportStatus | undefined,
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
 * Get a single report by ID.
 * GET /reports/{id}
 */
export function useReport(id: string | undefined) {
  return useApiQuery('/reports/{id}', {
    path: { id: id! },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string })?.status
      return (status === 'pending' || status === 'generating') ? 3000 : false
    },
  })
}

// --- Mutation Hooks ---

/**
 * Generate a new report.
 * POST /reports -> returns 202 (Accepted)
 *
 * NOTE: useApiMutation only infers return types from 200/201.
 * Using custom useMutation with manual typing (same pattern as
 * useGeneratePayrollExport in use-payroll-exports.ts).
 */
export function useGenerateReport() {
  const queryClient = useQueryClient()
  return useMutation<
    components['schemas']['Report'],
    Error,
    { body: components['schemas']['GenerateReportRequest'] }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/reports' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as components['schemas']['Report']
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/reports'] })
    },
  })
}

/**
 * Delete a report.
 * DELETE /reports/{id}
 */
export function useDeleteReport() {
  return useApiMutation('/reports/{id}', 'delete', {
    invalidateKeys: [['/reports']],
  })
}

/**
 * Download a report file as a blob.
 * Custom hook using raw fetch (openapi-fetch cannot handle blob responses).
 */
export function useDownloadReport() {
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const token = authStorage.getToken()
      const tenantId = tenantIdStorage.getTenantId()
      const response = await fetch(
        `${clientEnv.apiUrl}/reports/${id}/download`,
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
      const downloadName = extractedName ?? filename ?? 'report'
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
