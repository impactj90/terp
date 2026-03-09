import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseVehiclesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch vehicles (tRPC).
 */
export function useVehicles(options: UseVehiclesOptions = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.vehicles.list.queryOptions(undefined, { enabled })
  )
}

/**
 * Hook to fetch a single vehicle by ID (tRPC).
 */
export function useVehicle(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vehicles.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new vehicle (tRPC).
 */
export function useCreateVehicle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vehicles.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vehicles.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing vehicle (tRPC).
 */
export function useUpdateVehicle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vehicles.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vehicles.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a vehicle (tRPC).
 */
export function useDeleteVehicle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vehicles.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vehicles.list.queryKey(),
      })
    },
  })
}
