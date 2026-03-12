import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTimeDataInvalidation } from "./use-time-data-invalidation"

// Keep the existing DailyValue interface (snake_case) for backward compatibility
export interface DailyValue {
  id: string
  tenant_id?: string
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
  // Nested employee (from listAll)
  employee?: {
    id: string
    first_name: string
    last_name: string
    personnel_number: string
    is_active: boolean
    department_id?: string | null
    tariff_id?: string | null
  } | null
  // Legacy field aliases for backward compatibility
  date?: string
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  overtime_minutes?: number | null
  balance_minutes?: number | null
  has_errors?: boolean
  errors?: Array<{
    error_type: string
    message?: string
    severity?: "error" | "warning"
  }> | null
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
 * Transform tRPC response to legacy DailyValue shape for backward compatibility.
 */
export function transformToLegacyDailyValue(
  dv: Record<string, unknown>
): DailyValue {
  const overtime = (dv.overtime as number) ?? 0
  const undertime = (dv.undertime as number) ?? 0
  const balance = overtime - undertime
  const errorCodes = (dv.errorCodes as string[]) ?? []
  const warnings = (dv.warnings as string[]) ?? []

  // Build structured errors for legacy consumers
  const structuredErrors: Array<{
    error_type: string
    message?: string
    severity?: "error" | "warning"
  }> = []
  for (const code of errorCodes) {
    structuredErrors.push({ error_type: code, message: code, severity: "error" })
  }
  for (const code of warnings) {
    structuredErrors.push({
      error_type: code,
      message: code,
      severity: "warning",
    })
  }

  const rawDate =
    dv.valueDate instanceof Date
      ? dv.valueDate.toISOString()
      : String(dv.valueDate)
  const valueDate = rawDate.split("T")[0]!

  // Map employee relation if present (camelCase -> snake_case)
  const employee = dv.employee as Record<string, unknown> | undefined | null
  const employeeSnake = employee
    ? {
        id: employee.id as string,
        first_name: employee.firstName as string,
        last_name: employee.lastName as string,
        personnel_number: employee.personnelNumber as string,
        is_active: employee.isActive as boolean,
        department_id: (employee.departmentId as string | null) ?? null,
        tariff_id: (employee.tariffId as string | null) ?? null,
      }
    : undefined

  // Use actual status from tRPC response when available
  const status = (dv.status as string) || ((dv.hasError as boolean) ? "error" : "calculated")

  return {
    id: dv.id as string,
    tenant_id: dv.tenantId as string | undefined,
    employee_id: dv.employeeId as string,
    value_date: valueDate,
    target_time: dv.targetTime as number,
    gross_time: dv.grossTime as number,
    break_time: dv.breakTime as number,
    net_time: dv.netTime as number,
    overtime,
    undertime,
    has_error: dv.hasError as boolean,
    error_codes: errorCodes.length > 0 ? errorCodes : null,
    warnings: warnings.length > 0 ? warnings : null,
    booking_count: dv.bookingCount as number,
    first_come: dv.firstCome as number | undefined,
    last_go: dv.lastGo as number | undefined,
    employee: employeeSnake,
    // Legacy aliases
    date: valueDate,
    target_minutes: dv.targetTime as number,
    gross_minutes: dv.grossTime as number,
    break_minutes: dv.breakTime as number,
    net_minutes: dv.netTime as number,
    overtime_minutes: overtime,
    balance_minutes: balance,
    has_errors: dv.hasError as boolean,
    errors: structuredErrors.length > 0 ? structuredErrors : null,
    status,
    calculated_at: dv.calculatedAt ? String(dv.calculatedAt) : null,
    // Defaults for fields not available from this endpoint
    is_holiday: false,
    is_absence: false,
    absence_type: null,
    is_locked: false,
    day_plan: null,
  }
}

/**
 * Hook to fetch daily values for a specific month.
 * Uses tRPC dailyValues.list query.
 *
 * Accepts both new (year/month) and legacy (from/to) parameters.
 * When from/to are provided, year/month are extracted from 'from'.
 *
 * Returns { data: DailyValue[] } to match expected shape.
 */
export function useDailyValues(options: UseDailyValuesOptions = {}) {
  const { employeeId, year, month, from, enabled = true } = options
  const trpc = useTRPC()

  // Support legacy from/to parameters by extracting year/month
  let queryYear = year
  let queryMonth = month

  if (!queryYear && !queryMonth && from) {
    const fromDate = new Date(from)
    queryYear = fromDate.getFullYear()
    queryMonth = fromDate.getMonth() + 1
  }

  return useQuery({
    ...trpc.dailyValues.list.queryOptions(
      {
        employeeId: employeeId!,
        year: queryYear!,
        month: queryMonth!,
      },
      {
        enabled: enabled && !!employeeId && !!queryYear && !!queryMonth,
      }
    ),
    select: (data) => ({
      data: data.map((dv) =>
        transformToLegacyDailyValue(dv as unknown as Record<string, unknown>)
      ),
    }),
  })
}

interface UseAllDailyValuesOptions {
  employeeId?: string
  from?: string
  to?: string
  status?: "pending" | "calculated" | "error" | "approved"
  hasErrors?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch all daily values for admin approvals view.
 * Uses tRPC dailyValues.listAll query.
 */
export function useAllDailyValues(options: UseAllDailyValuesOptions = {}) {
  const { employeeId, from, to, status, hasErrors, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.dailyValues.listAll.queryOptions(
      {
        employeeId,
        fromDate: from,
        toDate: to,
        status,
        hasErrors,
        pageSize: 100,
      },
      { enabled }
    ),
    staleTime: 30 * 1000,
    select: (data) => ({
      data: data.items.map((dv) =>
        transformToLegacyDailyValue(dv as unknown as Record<string, unknown>)
      ),
    }),
  })
}

/**
 * Hook to approve a daily value.
 * Uses tRPC dailyValues.approve mutation.
 */
export function useApproveDailyValue() {
  const invalidateTimeData = useTimeDataInvalidation()

  return useMutation({
    ...useTRPC().dailyValues.approve.mutationOptions(),
    onSuccess: () => {
      // Approval changes day view, daily values, and monthly aggregates
      invalidateTimeData()
    },
  })
}
