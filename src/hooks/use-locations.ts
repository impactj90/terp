import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseLocationsOptions {
  enabled?: boolean
  isActive?: boolean
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
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.locations.list.queryOptions({ isActive }, { enabled })
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.locations.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new location.
 *
 * @example
 * ```tsx
 * const createLocation = useCreateLocation()
 * createLocation.mutate({ code: 'HQ', name: 'Headquarters' })
 * ```
 */
export function useCreateLocation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.locations.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.locations.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing location.
 *
 * @example
 * ```tsx
 * const updateLocation = useUpdateLocation()
 * updateLocation.mutate({ id: locationId, name: 'Updated Name' })
 * ```
 */
export function useUpdateLocation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.locations.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.locations.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.locations.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a location.
 *
 * @example
 * ```tsx
 * const deleteLocation = useDeleteLocation()
 * deleteLocation.mutate({ id: locationId })
 * ```
 */
export function useDeleteLocation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.locations.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.locations.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.locations.getById.queryKey(),
      })
    },
  })
}
