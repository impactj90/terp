import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

interface UseDepartmentsOptions {
  enabled?: boolean
  active?: boolean
  parentId?: string
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
  const { enabled = true, active, parentId } = options

  return useApiQuery('/departments', {
    params: {
      active,
      parent_id: parentId,
    },
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

/**
 * Hook to fetch department tree structure.
 *
 * @example
 * ```tsx
 * const { data: tree, isLoading } = useDepartmentTree()
 * ```
 */
export function useDepartmentTree(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useApiQuery('/departments/tree', {
    enabled,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new department.
 *
 * @example
 * ```tsx
 * const createDepartment = useCreateDepartment()
 * createDepartment.mutate({
 *   body: { name: 'Engineering', code: 'ENG' }
 * })
 * ```
 */
export function useCreateDepartment() {
  return useApiMutation('/departments', 'post', {
    invalidateKeys: [['/departments'], ['/departments/tree']],
  })
}

/**
 * Hook to update an existing department.
 *
 * @example
 * ```tsx
 * const updateDepartment = useUpdateDepartment()
 * updateDepartment.mutate({
 *   path: { id: departmentId },
 *   body: { name: 'Updated Name' }
 * })
 * ```
 */
export function useUpdateDepartment() {
  return useApiMutation('/departments/{id}', 'patch', {
    invalidateKeys: [['/departments'], ['/departments/tree']],
  })
}

/**
 * Hook to delete a department.
 *
 * @example
 * ```tsx
 * const deleteDepartment = useDeleteDepartment()
 * deleteDepartment.mutate({ path: { id: departmentId } })
 * ```
 */
export function useDeleteDepartment() {
  return useApiMutation('/departments/{id}', 'delete', {
    invalidateKeys: [['/departments'], ['/departments/tree']],
  })
}
