import { useApiQuery, useApiMutation } from '@/hooks'

interface UseLocationsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of locations.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLocations()
 * const locations = data?.data ?? []
 * ```
 */
export function useLocations(options: UseLocationsOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/locations', {
    enabled,
  })
}

/**
 * Hook to fetch a single location by ID.
 *
 * @example
 * ```tsx
 * const { data: location, isLoading } = useLocation(locationId)
 * ```
 */
export function useLocation(id: string, enabled = true) {
  return useApiQuery('/locations/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateLocation() {
  return useApiMutation('/locations', 'post', {
    invalidateKeys: [['/locations']],
  })
}

export function useUpdateLocation() {
  return useApiMutation('/locations/{id}', 'patch', {
    invalidateKeys: [['/locations']],
  })
}

export function useDeleteLocation() {
  return useApiMutation('/locations/{id}', 'delete', {
    invalidateKeys: [['/locations']],
  })
}
