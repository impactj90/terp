import { useApiQuery, useApiMutation } from '@/hooks'

interface UseEmployeesOptions {
  limit?: number
  page?: number
  search?: string
  departmentId?: string
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employees.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployees({
 *   limit: 20,
 *   search: 'John',
 * })
 * ```
 */
export function useEmployees(options: UseEmployeesOptions = {}) {
  const { limit = 20, page, search, departmentId, active, enabled = true } = options

  return useApiQuery('/employees', {
    params: {
      limit,
      page,
      q: search,
      department_id: departmentId,
      active,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single employee by ID.
 *
 * @example
 * ```tsx
 * const { data: employee, isLoading } = useEmployee(employeeId)
 * ```
 */
export function useEmployee(id: string, enabled = true) {
  return useApiQuery('/employees/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new employee.
 *
 * @example
 * ```tsx
 * const createEmployee = useCreateEmployee()
 * createEmployee.mutate({
 *   body: { first_name: 'John', last_name: 'Doe', ... }
 * })
 * ```
 */
export function useCreateEmployee() {
  return useApiMutation('/employees', 'post', {
    invalidateKeys: [['/employees']],
  })
}

/**
 * Hook to update an existing employee.
 *
 * @example
 * ```tsx
 * const updateEmployee = useUpdateEmployee()
 * updateEmployee.mutate({
 *   path: { id: employeeId },
 *   body: { first_name: 'Updated' }
 * })
 * ```
 */
export function useUpdateEmployee() {
  return useApiMutation('/employees/{id}', 'put', {
    invalidateKeys: [['/employees']],
  })
}

/**
 * Hook to delete an employee.
 *
 * @example
 * ```tsx
 * const deleteEmployee = useDeleteEmployee()
 * deleteEmployee.mutate({ path: { id: employeeId } })
 * ```
 */
export function useDeleteEmployee() {
  return useApiMutation('/employees/{id}', 'delete', {
    invalidateKeys: [['/employees']],
  })
}
