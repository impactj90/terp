import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch a user by ID.
 *
 * @example
 * ```tsx
 * const { data: user, isLoading } = useUser(userId)
 * ```
 */
export function useUser(userId: string, enabled = true) {
  return useApiQuery('/users/{id}', {
    path: { id: userId },
    enabled: enabled && !!userId,
  })
}

/**
 * Hook to update a user (display_name, avatar_url).
 *
 * @example
 * ```tsx
 * const updateUser = useUpdateUser()
 * updateUser.mutate({
 *   path: { id: userId },
 *   body: { display_name: 'New Name' }
 * })
 * ```
 */
export function useUpdateUser() {
  return useApiMutation('/users/{id}', 'patch', {
    invalidateKeys: [['/users/{id}'], ['/auth/me']],
  })
}
