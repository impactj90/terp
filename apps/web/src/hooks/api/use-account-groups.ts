import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAccountGroupsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch account groups.
 */
export function useAccountGroups(options: UseAccountGroupsOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/account-groups', {
    enabled,
  })
}

/**
 * Hook to fetch a single account group by ID.
 */
export function useAccountGroup(id: string, enabled = true) {
  return useApiQuery('/account-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new account group.
 */
export function useCreateAccountGroup() {
  return useApiMutation('/account-groups', 'post', {
    invalidateKeys: [['/account-groups']],
  })
}

/**
 * Hook to update an existing account group.
 */
export function useUpdateAccountGroup() {
  return useApiMutation('/account-groups/{id}', 'patch', {
    invalidateKeys: [['/account-groups'], ['/account-groups/{id}']],
  })
}

/**
 * Hook to delete an account group.
 */
export function useDeleteAccountGroup() {
  return useApiMutation('/account-groups/{id}', 'delete', {
    invalidateKeys: [['/account-groups'], ['/account-groups/{id}']],
  })
}
