import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAbsenceTypeGroupsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch absence type groups.
 */
export function useAbsenceTypeGroups(options: UseAbsenceTypeGroupsOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/absence-type-groups', {
    enabled,
  })
}

/**
 * Hook to fetch a single absence type group by ID.
 */
export function useAbsenceTypeGroup(id: string, enabled = true) {
  return useApiQuery('/absence-type-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new absence type group.
 */
export function useCreateAbsenceTypeGroup() {
  return useApiMutation('/absence-type-groups', 'post', {
    invalidateKeys: [['/absence-type-groups']],
  })
}

/**
 * Hook to update an existing absence type group.
 */
export function useUpdateAbsenceTypeGroup() {
  return useApiMutation('/absence-type-groups/{id}', 'patch', {
    invalidateKeys: [['/absence-type-groups'], ['/absence-type-groups/{id}']],
  })
}

/**
 * Hook to delete an absence type group.
 */
export function useDeleteAbsenceTypeGroup() {
  return useApiMutation('/absence-type-groups/{id}', 'delete', {
    invalidateKeys: [['/absence-type-groups'], ['/absence-type-groups/{id}']],
  })
}
