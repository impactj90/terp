import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

async function apiRequest(url: string, options?: RequestInit) {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()

  const response = await fetch(`${clientEnv.apiUrl}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || 'Request failed')
  }

  return response.json()
}

interface UseMonthlyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  enabled?: boolean
}

export interface MonthSummary {
  // Core fields from API
  employee_id: string
  year: number
  month: number
  total_gross_time: number
  total_net_time: number
  total_target_time: number
  total_overtime: number
  total_undertime: number
  total_break_time: number
  flextime_start: number
  flextime_change: number
  flextime_end: number
  flextime_carryover: number
  vacation_taken: number
  sick_days: number
  other_absence_days: number
  work_days: number
  days_with_errors: number
  is_closed: boolean
  closed_at?: string
  closed_by?: string
  reopened_at?: string
  reopened_by?: string
  warnings: string[]

  // Legacy field aliases for backward compatibility
  id: string
  target_minutes?: number
  gross_minutes?: number
  break_minutes?: number
  net_minutes?: number
  balance_minutes?: number
  working_days?: number
  worked_days?: number
  absence_days?: number
  holiday_days?: number
  status?: string
  account_balances?: Record<string, number> | null
}

/**
 * Response structure that wraps MonthSummary in a data array for backward compatibility.
 * Legacy components access via .data[0], new components can use directly.
 */
interface MonthlyValuesResponse {
  data: MonthSummary[]
}

/**
 * Transform API response to include legacy field names.
 */
function addLegacyFields(summary: Omit<MonthSummary, 'id'>): MonthSummary {
  const balance = (summary.total_overtime ?? 0) - (summary.total_undertime ?? 0)
  return {
    ...summary,
    // Add legacy field aliases
    id: `${summary.employee_id}-${summary.year}-${summary.month}`,
    target_minutes: summary.total_target_time,
    gross_minutes: summary.total_gross_time,
    break_minutes: summary.total_break_time,
    net_minutes: summary.total_net_time,
    balance_minutes: balance,
    working_days: summary.work_days,
    worked_days: summary.work_days,
    absence_days: summary.vacation_taken + summary.sick_days + summary.other_absence_days,
    holiday_days: 0, // Not available from this endpoint
    status: summary.is_closed ? 'closed' : 'open',
    account_balances: {
      flextime: summary.flextime_end ?? 0,
    },
  }
}

/**
 * Hook to fetch monthly value for an employee.
 * Uses the /employees/{id}/months/{year}/{month} endpoint.
 *
 * Returns { data: [MonthSummary] } for backward compatibility with components
 * that expect an array (accessed via .data[0]).
 */
export function useMonthlyValues(options: UseMonthlyValuesOptions = {}) {
  const { employeeId, year, month, enabled = true } = options

  return useQuery<MonthlyValuesResponse>({
    queryKey: ['employees', employeeId, 'months', year, month],
    queryFn: async () => {
      const summary = await apiRequest(`/employees/${employeeId}/months/${year}/${month}`)
      // Transform and wrap in array for backward compatibility
      return { data: [addLegacyFields(summary)] }
    },
    enabled: enabled && !!employeeId && !!year && !!month,
  })
}

interface CloseMonthParams {
  employeeId: string
  year: number
  month: number
}

/**
 * Hook to close a month for an employee.
 * Uses the /employees/{id}/months/{year}/{month}/close endpoint.
 */
export function useCloseMonth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, year, month }: CloseMonthParams) =>
      apiRequest(`/employees/${employeeId}/months/${year}/${month}/close`, { method: 'POST' }),
    onSuccess: (_, { employeeId, year, month }) => {
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'months', year, month] })
    },
  })
}

/**
 * Hook to reopen a month for an employee.
 * Uses the /employees/{id}/months/{year}/{month}/reopen endpoint.
 */
export function useReopenMonth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, year, month }: CloseMonthParams) =>
      apiRequest(`/employees/${employeeId}/months/${year}/${month}/reopen`, { method: 'POST' }),
    onSuccess: (_, { employeeId, year, month }) => {
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'months', year, month] })
    },
  })
}

/**
 * Hook to recalculate a month for an employee.
 * Uses the /employees/{id}/months/{year}/{month}/recalculate endpoint.
 */
export function useRecalculateMonth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, year, month }: CloseMonthParams) =>
      apiRequest(`/employees/${employeeId}/months/${year}/${month}/recalculate`, { method: 'POST' }),
    onSuccess: (_, { employeeId, year, month }) => {
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'months', year, month] })
    },
  })
}
