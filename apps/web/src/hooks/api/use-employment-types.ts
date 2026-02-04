import { useApiQuery, useApiMutation } from '@/hooks'

interface UseEmploymentTypesOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of employment types.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmploymentTypes()
 * const employmentTypes = data?.data ?? []
 * ```
 */
export function useEmploymentTypes(options: UseEmploymentTypesOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/employment-types', {
    enabled,
  })
}

/**
 * Hook to fetch a single employment type by ID.
 *
 * @example
 * ```tsx
 * const { data: employmentType, isLoading } = useEmploymentType(typeId)
 * ```
 */
export function useEmploymentType(id: string, enabled = true) {
  return useApiQuery('/employment-types/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateEmploymentType() {
  return useApiMutation('/employment-types', 'post', {
    invalidateKeys: [['/employment-types']],
  })
}

export function useUpdateEmploymentType() {
  return useApiMutation('/employment-types/{id}', 'patch', {
    invalidateKeys: [['/employment-types']],
  })
}

export function useDeleteEmploymentType() {
  return useApiMutation('/employment-types/{id}', 'delete', {
    invalidateKeys: [['/employment-types']],
  })
}
