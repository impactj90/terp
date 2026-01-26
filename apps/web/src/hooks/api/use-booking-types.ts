import { useApiQuery } from '@/hooks'

interface UseBookingTypesOptions {
  active?: boolean
  direction?: 'in' | 'out'
  enabled?: boolean
}

/**
 * Hook to fetch booking types.
 *
 * @example
 * ```tsx
 * const { data } = useBookingTypes({ active: true })
 * // Returns booking types like A1 (Clock In), A2 (Clock Out), P1 (Break Start), etc.
 * ```
 */
export function useBookingTypes(options: UseBookingTypesOptions = {}) {
  const { active, direction, enabled = true } = options

  return useApiQuery('/booking-types', {
    params: {
      active,
      direction,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single booking type by ID.
 *
 * @example
 * ```tsx
 * const { data: bookingType } = useBookingType(bookingTypeId)
 * ```
 */
export function useBookingType(id: string, enabled = true) {
  return useApiQuery('/booking-types/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
