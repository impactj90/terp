import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch system settings (singleton per tenant, tRPC).
 *
 * @example
 * ```tsx
 * const { data: settings, isLoading } = useSystemSettings()
 * ```
 */
export function useSystemSettings(enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.systemSettings.get.queryOptions(undefined, { enabled }))
}

/**
 * Hook to update system settings (tRPC).
 * Invalidates settings query on success.
 */
export function useUpdateSystemSettings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.systemSettings.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.systemSettings.get.queryKey(),
      })
    },
  })
}

/**
 * Hook to cleanup: delete bookings within a date range (tRPC).
 */
export function useCleanupDeleteBookings() {
  const trpc = useTRPC()
  return useMutation(trpc.systemSettings.cleanupDeleteBookings.mutationOptions())
}

/**
 * Hook to cleanup: delete booking data (bookings, daily values, employee day plans) (tRPC).
 */
export function useCleanupDeleteBookingData() {
  const trpc = useTRPC()
  return useMutation(
    trpc.systemSettings.cleanupDeleteBookingData.mutationOptions()
  )
}

/**
 * Hook to cleanup: re-read bookings (re-trigger calculation) (tRPC).
 */
export function useCleanupReReadBookings() {
  const trpc = useTRPC()
  return useMutation(
    trpc.systemSettings.cleanupReReadBookings.mutationOptions()
  )
}

/**
 * Hook to cleanup: mark and delete orders (tRPC).
 */
export function useCleanupMarkDeleteOrders() {
  const trpc = useTRPC()
  return useMutation(
    trpc.systemSettings.cleanupMarkDeleteOrders.mutationOptions()
  )
}
