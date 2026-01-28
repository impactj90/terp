import { useApiQuery } from '@/hooks'

export function useCurrentPermissions(enabled = true) {
  return useApiQuery('/auth/permissions', {
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
