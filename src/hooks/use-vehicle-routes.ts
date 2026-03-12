import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseVehicleRoutesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch vehicle routes (tRPC).
 */
export function useVehicleRoutes(options: UseVehicleRoutesOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.vehicleRoutes.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single vehicle route by ID (tRPC).
 */
export function useVehicleRoute(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vehicleRoutes.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new vehicle route (tRPC).
 */
export function useCreateVehicleRoute() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vehicleRoutes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vehicleRoutes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vehicleRoutes.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing vehicle route (tRPC).
 */
export function useUpdateVehicleRoute() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vehicleRoutes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vehicleRoutes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vehicleRoutes.getById.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a vehicle route (tRPC).
 */
export function useDeleteVehicleRoute() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vehicleRoutes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vehicleRoutes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.vehicleRoutes.getById.queryKey(),
      })
    },
  })
}
