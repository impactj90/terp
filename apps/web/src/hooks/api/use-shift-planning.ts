import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Shifts ====================

interface UseShiftsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch shifts.
 */
export function useShifts(options: UseShiftsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/shifts', { enabled })
}

/**
 * Hook to fetch a single shift by ID.
 */
export function useShift(id: string, enabled = true) {
  return useApiQuery('/shifts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Shift Mutation Hooks ====================

/**
 * Hook to create a new shift.
 */
export function useCreateShift() {
  return useApiMutation('/shifts', 'post', {
    invalidateKeys: [['/shifts']],
  })
}

/**
 * Hook to update an existing shift.
 */
export function useUpdateShift() {
  return useApiMutation('/shifts/{id}', 'patch', {
    invalidateKeys: [['/shifts'], ['/shifts/{id}']],
  })
}

/**
 * Hook to delete a shift.
 */
export function useDeleteShift() {
  return useApiMutation('/shifts/{id}', 'delete', {
    invalidateKeys: [['/shifts'], ['/shifts/{id}']],
  })
}
