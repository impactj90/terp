import { useApiQuery } from '@/hooks'

export function usePermissions(enabled = true) {
  return useApiQuery('/permissions', {
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
