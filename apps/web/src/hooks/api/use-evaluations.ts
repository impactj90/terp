import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

// --- Interfaces ---

interface UseEvaluationDailyValuesOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  include_no_bookings?: boolean
  has_errors?: boolean
  limit?: number
  page?: number
  enabled?: boolean
}

interface UseEvaluationBookingsOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  booking_type_id?: string
  source?: 'web' | 'terminal' | 'api' | 'import' | 'correction'
  direction?: 'in' | 'out'
  limit?: number
  page?: number
  enabled?: boolean
}

interface UseEvaluationTerminalBookingsOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  limit?: number
  page?: number
  enabled?: boolean
}

interface UseEvaluationLogsOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  entity_type?: string
  action?: string
  user_id?: string
  limit?: number
  page?: number
  enabled?: boolean
}

interface UseEvaluationWorkflowHistoryOptions {
  from?: string
  to?: string
  employee_id?: string
  department_id?: string
  entity_type?: string
  action?: string
  limit?: number
  page?: number
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List evaluation daily values.
 * Uses tRPC evaluations.dailyValues query.
 *
 * Returns { items, total } wrapped in react-query result.
 * For backward compatibility, also exposes data/meta shape via select.
 */
export function useEvaluationDailyValues(options: UseEvaluationDailyValuesOptions = {}) {
  const { from, to, employee_id, department_id, has_errors, limit, page, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.evaluations.dailyValues.queryOptions(
      {
        fromDate: from!,
        toDate: to!,
        employeeId: employee_id,
        departmentId: department_id,
        hasErrors: has_errors,
        pageSize: limit,
        page,
      },
      {
        enabled: enabled && !!from && !!to,
      }
    ),
  })
}

/**
 * List evaluation bookings.
 * Uses tRPC evaluations.bookings query.
 */
export function useEvaluationBookings(options: UseEvaluationBookingsOptions = {}) {
  const { from, to, employee_id, department_id, booking_type_id, source, direction, limit, page, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.evaluations.bookings.queryOptions(
      {
        fromDate: from!,
        toDate: to!,
        employeeId: employee_id,
        departmentId: department_id,
        bookingTypeId: booking_type_id,
        source,
        direction,
        pageSize: limit,
        page,
      },
      {
        enabled: enabled && !!from && !!to,
      }
    ),
  })
}

/**
 * List evaluation terminal bookings.
 * Uses tRPC evaluations.terminalBookings query.
 */
export function useEvaluationTerminalBookings(options: UseEvaluationTerminalBookingsOptions = {}) {
  const { from, to, employee_id, department_id, limit, page, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.evaluations.terminalBookings.queryOptions(
      {
        fromDate: from!,
        toDate: to!,
        employeeId: employee_id,
        departmentId: department_id,
        pageSize: limit,
        page,
      },
      {
        enabled: enabled && !!from && !!to,
      }
    ),
  })
}

/**
 * List evaluation change logs.
 * Uses tRPC evaluations.logs query.
 *
 * Note: employee_id and department_id are accepted for API compatibility
 * but are NOT used in filtering (never implemented in Go backend).
 */
export function useEvaluationLogs(options: UseEvaluationLogsOptions = {}) {
  const { from, to, entity_type, action, user_id, limit, page, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.evaluations.logs.queryOptions(
      {
        fromDate: from!,
        toDate: to!,
        entityType: entity_type,
        action,
        userId: user_id,
        pageSize: limit,
        page,
      },
      {
        enabled: enabled && !!from && !!to,
      }
    ),
  })
}

/**
 * List evaluation workflow history.
 * Uses tRPC evaluations.workflowHistory query.
 *
 * Note: employee_id and department_id are accepted for API compatibility
 * but are NOT used in filtering (never implemented in Go backend).
 */
export function useEvaluationWorkflowHistory(options: UseEvaluationWorkflowHistoryOptions = {}) {
  const { from, to, entity_type, action, limit, page, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.evaluations.workflowHistory.queryOptions(
      {
        fromDate: from!,
        toDate: to!,
        entityType: entity_type,
        action,
        pageSize: limit,
        page,
      },
      {
        enabled: enabled && !!from && !!to,
      }
    ),
  })
}
