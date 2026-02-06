import { useApiQuery, useApiMutation } from '@/hooks'

interface UseBookingTypeGroupsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch booking type groups.
 */
export function useBookingTypeGroups(options: UseBookingTypeGroupsOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/booking-type-groups', {
    enabled,
  })
}

/**
 * Hook to fetch a single booking type group by ID.
 */
export function useBookingTypeGroup(id: string, enabled = true) {
  return useApiQuery('/booking-type-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new booking type group.
 */
export function useCreateBookingTypeGroup() {
  return useApiMutation('/booking-type-groups', 'post', {
    invalidateKeys: [['/booking-type-groups']],
  })
}

/**
 * Hook to update an existing booking type group.
 */
export function useUpdateBookingTypeGroup() {
  return useApiMutation('/booking-type-groups/{id}', 'patch', {
    invalidateKeys: [['/booking-type-groups'], ['/booking-type-groups/{id}']],
  })
}

/**
 * Hook to delete a booking type group.
 */
export function useDeleteBookingTypeGroup() {
  return useApiMutation('/booking-type-groups/{id}', 'delete', {
    invalidateKeys: [['/booking-type-groups'], ['/booking-type-groups/{id}']],
  })
}
