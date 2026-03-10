import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Keep the existing MonthSummary interface (snake_case) for backward compatibility
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

interface UseMonthlyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  enabled?: boolean
}


interface UseYearOverviewOptions {
  employeeId?: string
  year?: number
  enabled?: boolean
}

/**
 * Transform tRPC MonthSummary (camelCase) to legacy MonthSummary (snake_case).
 */
function transformToLegacyMonthSummary(
  ms: Record<string, unknown>
): MonthSummary {
  const overtime = (ms.totalOvertime as number) ?? 0
  const undertime = (ms.totalUndertime as number) ?? 0
  const balance = overtime - undertime
  const vacationTaken = Number(ms.vacationTaken ?? 0)
  const sickDays = (ms.sickDays as number) ?? 0
  const otherAbsenceDays = (ms.otherAbsenceDays as number) ?? 0

  return {
    employee_id: ms.employeeId as string,
    year: ms.year as number,
    month: ms.month as number,
    total_gross_time: ms.totalGrossTime as number,
    total_net_time: ms.totalNetTime as number,
    total_target_time: ms.totalTargetTime as number,
    total_overtime: overtime,
    total_undertime: undertime,
    total_break_time: ms.totalBreakTime as number,
    flextime_start: ms.flextimeStart as number,
    flextime_change: ms.flextimeChange as number,
    flextime_end: ms.flextimeEnd as number,
    flextime_carryover: ms.flextimeCarryover as number,
    vacation_taken: vacationTaken,
    sick_days: sickDays,
    other_absence_days: otherAbsenceDays,
    work_days: ms.workDays as number,
    days_with_errors: ms.daysWithErrors as number,
    is_closed: ms.isClosed as boolean,
    closed_at: ms.closedAt ? String(ms.closedAt) : undefined,
    closed_by: ms.closedBy as string | undefined,
    reopened_at: ms.reopenedAt ? String(ms.reopenedAt) : undefined,
    reopened_by: ms.reopenedBy as string | undefined,
    warnings: (ms.warnings as string[]) ?? [],
    // Legacy aliases
    id: `${ms.employeeId}-${ms.year}-${ms.month}`,
    target_minutes: ms.totalTargetTime as number,
    gross_minutes: ms.totalGrossTime as number,
    break_minutes: ms.totalBreakTime as number,
    net_minutes: ms.totalNetTime as number,
    balance_minutes: balance,
    working_days: ms.workDays as number,
    worked_days: ms.workDays as number,
    absence_days: vacationTaken + sickDays + otherAbsenceDays,
    holiday_days: 0,
    status: (ms.isClosed as boolean) ? "closed" : "open",
    account_balances: {
      flextime: (ms.flextimeEnd as number) ?? 0,
    },
  }
}

/**
 * Hook to fetch monthly value for an employee.
 * Uses tRPC monthlyValues.forEmployee query.
 *
 * Returns { data: [MonthSummary] } for backward compatibility with components
 * that expect an array (accessed via .data[0]).
 */
export function useMonthlyValues(options: UseMonthlyValuesOptions = {}) {
  const { employeeId, year, month, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.forEmployee.queryOptions(
      { employeeId: employeeId!, year: year!, month: month! },
      { enabled: enabled && !!employeeId && !!year && !!month }
    ),
    select: (data) => ({
      data: [
        transformToLegacyMonthSummary(
          data as unknown as Record<string, unknown>
        ),
      ],
    }),
  })
}

/**
 * Hook to fetch all monthly values for an employee for a given year.
 * Uses tRPC monthlyValues.yearOverview query.
 *
 * Returns { data: MonthSummary[] } with all months that have data.
 */
export function useYearOverview(options: UseYearOverviewOptions = {}) {
  const { employeeId, year, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.yearOverview.queryOptions(
      { employeeId: employeeId!, year: year! },
      { enabled: enabled && !!employeeId && !!year }
    ),
    select: (data) => ({
      data: data.map((ms) =>
        transformToLegacyMonthSummary(ms as unknown as Record<string, unknown>)
      ),
    }),
  })
}

/**
 * Hook to close a month for an employee.
 * Uses tRPC monthlyValues.close mutation with { employeeId, year, month } input.
 */
export function useCloseMonth() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.close.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.forEmployee.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.yearOverview.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to reopen a month for an employee.
 * Uses tRPC monthlyValues.reopen mutation with { employeeId, year, month } input.
 */
export function useReopenMonth() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.reopen.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.forEmployee.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.yearOverview.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to recalculate a month for an employee.
 * Uses tRPC monthlyValues.recalculate mutation.
 */
export function useRecalculateMonth() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.recalculate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.forEmployee.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.yearOverview.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
    },
  })
}
