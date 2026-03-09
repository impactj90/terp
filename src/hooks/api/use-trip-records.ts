import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseTripRecordsOptions {
  vehicleId?: string
  fromDate?: string
  toDate?: string
  limit?: number
  page?: number
  enabled?: boolean
}

/**
 * Hook to fetch trip records (tRPC).
 */
export function useTripRecords(options: UseTripRecordsOptions = {}) {
  const {
    vehicleId,
    fromDate,
    toDate,
    limit,
    page,
    enabled = true,
  } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.tripRecords.list.queryOptions(
      { vehicleId, fromDate, toDate, limit, page },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single trip record by ID (tRPC).
 */
export function useTripRecord(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tripRecords.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new trip record (tRPC).
 */
export function useCreateTripRecord() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tripRecords.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tripRecords.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing trip record (tRPC).
 */
export function useUpdateTripRecord() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tripRecords.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tripRecords.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a trip record (tRPC).
 */
export function useDeleteTripRecord() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tripRecords.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tripRecords.list.queryKey(),
      })
    },
  })
}
