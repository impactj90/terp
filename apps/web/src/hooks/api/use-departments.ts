import { useApiQuery } from '@/hooks'

interface UseDepartmentsOptions {
  enabled?: boolean
}

/**
 * Hook to fetch list of departments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useDepartments()
 * const departments = data?.data ?? []
 * ```
 */
export function useDepartments(options: UseDepartmentsOptions = {}) {
  const { enabled = true } = options

  return useApiQuery('/departments', {
    enabled,
  })
}

/**
 * Hook to fetch a single department by ID.
 *
 * @example
 * ```tsx
 * const { data: department, isLoading } = useDepartment(departmentId)
 * ```
 */
export function useDepartment(id: string, enabled = true) {
  return useApiQuery('/departments/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
