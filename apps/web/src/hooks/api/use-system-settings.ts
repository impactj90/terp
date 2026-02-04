import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch system settings (singleton per tenant).
 *
 * @example
 * ```tsx
 * const { data: settings, isLoading } = useSystemSettings()
 * ```
 */
export function useSystemSettings(enabled = true) {
  return useApiQuery('/system-settings', { enabled })
}

/**
 * Hook to update system settings (PUT, sends all fields).
 */
export function useUpdateSystemSettings() {
  return useApiMutation('/system-settings', 'put', {
    invalidateKeys: [['/system-settings']],
  })
}

/**
 * Hook to cleanup: delete bookings within a date range.
 */
export function useCleanupDeleteBookings() {
  return useApiMutation('/system-settings/cleanup/delete-bookings', 'post')
}

/**
 * Hook to cleanup: delete booking data (bookings, daily values, employee day plans).
 */
export function useCleanupDeleteBookingData() {
  return useApiMutation('/system-settings/cleanup/delete-booking-data', 'post')
}

/**
 * Hook to cleanup: re-read bookings (re-trigger calculation).
 */
export function useCleanupReReadBookings() {
  return useApiMutation('/system-settings/cleanup/re-read-bookings', 'post')
}

/**
 * Hook to cleanup: mark and delete orders.
 */
export function useCleanupMarkDeleteOrders() {
  return useApiMutation('/system-settings/cleanup/mark-delete-orders', 'post')
}
