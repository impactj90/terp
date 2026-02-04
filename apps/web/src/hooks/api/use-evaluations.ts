import { useApiQuery } from '@/hooks'

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
 * GET /evaluations/daily-values
 */
export function useEvaluationDailyValues(options: UseEvaluationDailyValuesOptions = {}) {
  const { from, to, employee_id, department_id, include_no_bookings, has_errors, limit, page, enabled = true } = options
  return useApiQuery('/evaluations/daily-values', {
    params: { from: from!, to: to!, employee_id, department_id, include_no_bookings, has_errors, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

/**
 * List evaluation bookings.
 * GET /evaluations/bookings
 */
export function useEvaluationBookings(options: UseEvaluationBookingsOptions = {}) {
  const { from, to, employee_id, department_id, booking_type_id, source, direction, limit, page, enabled = true } = options
  return useApiQuery('/evaluations/bookings', {
    params: { from: from!, to: to!, employee_id, department_id, booking_type_id, source, direction, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

/**
 * List evaluation terminal bookings.
 * GET /evaluations/terminal-bookings
 */
export function useEvaluationTerminalBookings(options: UseEvaluationTerminalBookingsOptions = {}) {
  const { from, to, employee_id, department_id, limit, page, enabled = true } = options
  return useApiQuery('/evaluations/terminal-bookings', {
    params: { from: from!, to: to!, employee_id, department_id, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

/**
 * List evaluation change logs.
 * GET /evaluations/logs
 */
export function useEvaluationLogs(options: UseEvaluationLogsOptions = {}) {
  const { from, to, employee_id, department_id, entity_type, action, user_id, limit, page, enabled = true } = options
  return useApiQuery('/evaluations/logs', {
    params: { from: from!, to: to!, employee_id, department_id, entity_type, action, user_id, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

/**
 * List evaluation workflow history.
 * GET /evaluations/workflow-history
 */
export function useEvaluationWorkflowHistory(options: UseEvaluationWorkflowHistoryOptions = {}) {
  const { from, to, employee_id, department_id, entity_type, action, limit, page, enabled = true } = options
  return useApiQuery('/evaluations/workflow-history', {
    params: { from: from!, to: to!, employee_id, department_id, entity_type, action, limit, page },
    enabled: enabled && !!from && !!to,
  })
}
