import { useApiQuery, useApiMutation } from '@/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// --- Interfaces ---

interface UseAdminMonthlyValuesOptions {
  year?: number
  month?: number
  status?: 'open' | 'calculated' | 'closed' | 'exported'
  departmentId?: string
  employeeId?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List all monthly values with filters (flat route).
 * GET /monthly-values
 */
export function useAdminMonthlyValues(options: UseAdminMonthlyValuesOptions = {}) {
  const { year, month, status, departmentId, employeeId, enabled = true } = options
  return useApiQuery('/monthly-values', {
    params: {
      year,
      month,
      status,
      department_id: departmentId,
      employee_id: employeeId,
    },
    enabled,
  })
}

/**
 * Get a single monthly value by ID.
 * GET /monthly-values/{id}
 */
export function useMonthlyValueById(id: string | undefined) {
  return useApiQuery('/monthly-values/{id}', {
    path: { id: id! },
    enabled: !!id,
  })
}

// --- Mutation Hooks ---

/**
 * Close a single month by monthly value ID.
 * POST /monthly-values/{id}/close
 */
export function useCloseMonthById() {
  return useApiMutation('/monthly-values/{id}/close', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Reopen a single month by monthly value ID.
 * POST /monthly-values/{id}/reopen
 */
export function useReopenMonthById() {
  return useApiMutation('/monthly-values/{id}/reopen', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Batch close monthly values.
 * POST /monthly-values/close-batch
 */
export function useCloseMonthBatch() {
  return useApiMutation('/monthly-values/close-batch', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Recalculate monthly values.
 * POST /monthly-values/recalculate
 *
 * NOTE: Returns HTTP 202 (Accepted). The useApiMutation MutationResponse
 * type only infers from 200/201 responses, so the return type resolves
 * to void. We use a custom hook with manual typing instead.
 */
export function useRecalculateMonthlyValues() {
  const queryClient = useQueryClient()
  return useMutation<
    { message?: string; affected_employees?: number },
    Error,
    { body: { year: number; month: number; employee_id?: string } }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/monthly-values/recalculate' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as { message?: string; affected_employees?: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/monthly-values'] })
    },
  })
}
