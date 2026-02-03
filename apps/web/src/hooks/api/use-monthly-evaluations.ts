import { useApiQuery, useApiMutation } from '@/hooks'

interface UseMonthlyEvaluationsOptions {
  isActive?: boolean
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of monthly evaluation templates.
 */
export function useMonthlyEvaluations(options: UseMonthlyEvaluationsOptions = {}) {
  const { isActive, limit, cursor, enabled = true } = options
  return useApiQuery('/monthly-evaluations', {
    params: {
      is_active: isActive,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single monthly evaluation template by ID.
 */
export function useMonthlyEvaluation(id: string, enabled = true) {
  return useApiQuery('/monthly-evaluations/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch the default monthly evaluation template.
 */
export function useDefaultMonthlyEvaluation(enabled = true) {
  return useApiQuery('/monthly-evaluations/default', {
    enabled,
  })
}

/**
 * Hook to create a new monthly evaluation template.
 */
export function useCreateMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations', 'post', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/default'],
    ],
  })
}

/**
 * Hook to update an existing monthly evaluation template.
 */
export function useUpdateMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations/{id}', 'put', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/{id}'],
      ['/monthly-evaluations/default'],
    ],
  })
}

/**
 * Hook to delete a monthly evaluation template.
 */
export function useDeleteMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations/{id}', 'delete', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/{id}'],
    ],
  })
}

/**
 * Hook to set a monthly evaluation template as the default.
 */
export function useSetDefaultMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations/{id}/set-default', 'post', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/default'],
      ['/monthly-evaluations/{id}'],
    ],
  })
}
