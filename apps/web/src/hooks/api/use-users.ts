import { useApiQuery } from '@/hooks'

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
