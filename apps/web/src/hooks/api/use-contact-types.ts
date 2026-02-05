import { useApiQuery, useApiMutation } from '@/hooks'

interface UseContactTypesOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch contact types.
 *
 * @example
 * ```tsx
 * const { data } = useContactTypes({ active: true })
 * const contactTypes = data?.data ?? []
 * ```
 */
export function useContactTypes(options: UseContactTypesOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/contact-types', {
    params: {
      active,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single contact type by ID.
 *
 * @example
 * ```tsx
 * const { data: contactType } = useContactType(contactTypeId)
 * ```
 */
export function useContactType(id: string, enabled = true) {
  return useApiQuery('/contact-types/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new contact type.
 */
export function useCreateContactType() {
  return useApiMutation('/contact-types', 'post', {
    invalidateKeys: [['/contact-types']],
  })
}

/**
 * Hook to update an existing contact type.
 */
export function useUpdateContactType() {
  return useApiMutation('/contact-types/{id}', 'patch', {
    invalidateKeys: [['/contact-types']],
  })
}

/**
 * Hook to delete a contact type.
 */
export function useDeleteContactType() {
  return useApiMutation('/contact-types/{id}', 'delete', {
    invalidateKeys: [['/contact-types']],
  })
}
