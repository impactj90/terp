import { useApiQuery, useApiMutation } from '@/hooks'

interface UseUsersOptions {
  limit?: number
  search?: string
  enabled?: boolean
}

export function useUsers(options: UseUsersOptions = {}) {
  const { limit = 100, search, enabled = true } = options

  return useApiQuery('/users', {
    params: {
      limit,
      search: search || undefined,
    },
    enabled,
  })
}

export function useCreateUser() {
  return useApiMutation('/users', 'post', {
    invalidateKeys: [['/users']],
  })
}

export function useDeleteUser() {
  return useApiMutation('/users/{id}', 'delete', {
    invalidateKeys: [['/users']],
  })
}

export function useChangeUserPassword() {
  return useApiMutation('/users/{id}/password', 'post')
}
