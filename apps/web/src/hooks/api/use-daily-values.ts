import { useQuery } from '@tanstack/react-query'
import { authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

async function apiRequest(url: string) {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()

  const response = await fetch(`${clientEnv.apiUrl}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || 'Request failed')
  }

  return response.json()
}

interface UseDailyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  // Legacy compatibility: these are accepted but converted to year/month
  from?: string
  to?: string
  enabled?: boolean
}

/**
 * DailyValue type for monthly evaluation view.
 * Uses the API response format with *_time field names.
 */
export interface DailyValue {
  id: string
  employee_id: string
  value_date: string
  target_time: number
  gross_time: number
  break_time: number
  net_time: number
  overtime: number
  undertime: number
  has_error: boolean
  error_codes: string[] | null
  warnings: string[] | null
  booking_count: number
  first_come?: number
  last_go?: number
  // Legacy field aliases for backward compatibility
  date?: string
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  balance_minutes?: number | null
  has_errors?: boolean
  errors?: Array<{ error_type: string; message?: string; severity?: 'error' | 'warning' }> | null
  status?: string
  is_holiday?: boolean
  is_absence?: boolean
  absence_type?: { id?: string; name: string } | null
  is_locked?: boolean
  calculated_at?: string | null
  day_plan?: {
    name: string
    target_minutes: number
  } | null
}

interface DailyBreakdownResponse {
  data: DailyValue[]
}

/**
 * Transform API response to include legacy field names for backward compatibility.
 */
function transformDailyValues(values: DailyValue[]): DailyValue[] {
  return values.map((dv) => {
    const balance = (dv.overtime ?? 0) - (dv.undertime ?? 0)
    // Transform error_codes and warnings into structured error objects with severity
    const structuredErrors: Array<{ error_type: string; message?: string; severity?: 'error' | 'warning' }> = []
    if (dv.error_codes) {
      for (const code of dv.error_codes) {
        structuredErrors.push({ error_type: code, message: code, severity: 'error' })
      }
    }
    if (dv.warnings) {
      for (const code of dv.warnings) {
        structuredErrors.push({ error_type: code, message: code, severity: 'warning' })
      }
    }
    return {
      ...dv,
      // Add legacy field aliases
      date: dv.value_date,
      target_minutes: dv.target_time,
      gross_minutes: dv.gross_time,
      break_minutes: dv.break_time,
      net_minutes: dv.net_time,
      balance_minutes: balance,
      has_errors: dv.has_error,
      errors: structuredErrors.length > 0 ? structuredErrors : null,
      status: dv.has_error ? 'error' : (dv.warnings?.length ? 'warning' : 'ok'),
      // These aren't available from this endpoint but prevent type errors
      is_holiday: false,
      is_absence: false,
      absence_type: null,
      is_locked: false,
      calculated_at: null,
      day_plan: null,
    }
  })
}

/**
 * Hook to fetch daily values for a specific month.
 * Uses the /employees/{id}/months/{year}/{month}/days endpoint.
 *
 * Accepts both new (year/month) and legacy (from/to) parameters.
 * When from/to are provided, year/month are extracted from 'from'.
 *
 * Returns { data: DailyValue[] } to match expected shape.
 */
export function useDailyValues(options: UseDailyValuesOptions = {}) {
  const { employeeId, year, month, from, enabled = true } = options

  // Support legacy from/to parameters by extracting year/month
  let queryYear = year
  let queryMonth = month

  if (!queryYear && !queryMonth && from) {
    const fromDate = new Date(from)
    queryYear = fromDate.getFullYear()
    queryMonth = fromDate.getMonth() + 1
  }

  return useQuery<DailyBreakdownResponse>({
    queryKey: ['employees', employeeId, 'months', queryYear, queryMonth, 'days'],
    queryFn: async () => {
      const response = await apiRequest(`/employees/${employeeId}/months/${queryYear}/${queryMonth}/days`)
      // Transform response to include legacy field names
      return {
        data: transformDailyValues(response.data ?? []),
      }
    },
    enabled: enabled && !!employeeId && !!queryYear && !!queryMonth,
  })
}
