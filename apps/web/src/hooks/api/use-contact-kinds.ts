import { useApiQuery, useApiMutation } from '@/hooks'

interface UseContactKindsOptions {
  contactTypeId?: string
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch contact kinds.
 *
 * @example
 * ```tsx
 * const { data } = useContactKinds({ contactTypeId: selectedType.id })
 * const contactKinds = data?.data ?? []
 * ```
 */
export function useContactKinds(options: UseContactKindsOptions = {}) {
  const { contactTypeId, active, enabled = true } = options

  return useApiQuery('/contact-kinds', {
    params: {
      contact_type_id: contactTypeId,
      active,
    },
    enabled,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new contact kind.
 */
export function useCreateContactKind() {
  return useApiMutation('/contact-kinds', 'post', {
    invalidateKeys: [['/contact-kinds']],
  })
}

/**
 * Hook to update an existing contact kind.
 */
export function useUpdateContactKind() {
  return useApiMutation('/contact-kinds/{id}', 'patch', {
    invalidateKeys: [['/contact-kinds']],
  })
}

/**
 * Hook to delete a contact kind.
 */
export function useDeleteContactKind() {
  return useApiMutation('/contact-kinds/{id}', 'delete', {
    invalidateKeys: [['/contact-kinds']],
  })
}
