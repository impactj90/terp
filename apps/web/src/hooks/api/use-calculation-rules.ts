import { useApiQuery, useApiMutation } from '@/hooks'

interface UseCalculationRulesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch calculation rules.
 */
export function useCalculationRules(options: UseCalculationRulesOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/calculation-rules', {
    enabled,
  })
}

/**
 * Hook to fetch a single calculation rule by ID.
 */
export function useCalculationRule(id: string, enabled = true) {
  return useApiQuery('/calculation-rules/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new calculation rule.
 */
export function useCreateCalculationRule() {
  return useApiMutation('/calculation-rules', 'post', {
    invalidateKeys: [['/calculation-rules']],
  })
}

/**
 * Hook to update an existing calculation rule.
 */
export function useUpdateCalculationRule() {
  return useApiMutation('/calculation-rules/{id}', 'patch', {
    invalidateKeys: [['/calculation-rules'], ['/calculation-rules/{id}']],
  })
}

/**
 * Hook to delete a calculation rule.
 */
export function useDeleteCalculationRule() {
  return useApiMutation('/calculation-rules/{id}', 'delete', {
    invalidateKeys: [['/calculation-rules'], ['/calculation-rules/{id}']],
  })
}
