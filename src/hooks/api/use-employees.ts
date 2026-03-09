import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseEmployeesOptions {
  enabled?: boolean
  page?: number
  pageSize?: number
  search?: string
  departmentId?: string
  costCenterId?: string
  employmentTypeId?: string
  isActive?: boolean
  hasExitDate?: boolean
}

/**
 * Hook to fetch paginated list of employees.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployees({
 *   pageSize: 20,
 *   search: 'John',
 * })
 * const employees = data?.items ?? []
 * ```
 */
export function useEmployees(options: UseEmployeesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.employees.list.queryOptions(input, { enabled })
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.employees.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

/**
 * Hook for employee search autocomplete.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeSearch('John')
 * const results = data?.items ?? []
 * ```
 */
export function useEmployeeSearch(query: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employees.search.queryOptions(
      { query },
      { enabled: enabled && query.length > 0 }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee.
 *
 * @example
 * ```tsx
 * const createEmployee = useCreateEmployee()
 * createEmployee.mutate({
 *   personnelNumber: 'EMP001',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   entryDate: new Date(),
 * })
 * ```
 */
export function useCreateEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing employee.
 *
 * @example
 * ```tsx
 * const updateEmployee = useUpdateEmployee()
 * updateEmployee.mutate({ id: employeeId, firstName: 'Updated' })
 * ```
 */
export function useUpdateEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete (deactivate) an employee.
 *
 * @example
 * ```tsx
 * const deleteEmployee = useDeleteEmployee()
 * deleteEmployee.mutate({ id: employeeId })
 * ```
 */
export function useDeleteEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to bulk assign or clear tariffs for employees.
 *
 * @example
 * ```tsx
 * const bulkAssignTariff = useBulkAssignTariff()
 * bulkAssignTariff.mutate({
 *   employeeIds: ['...'],
 *   tariffId: '...',
 * })
 * ```
 */
export function useBulkAssignTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.bulkAssignTariff.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employees.list.queryKey(),
      })
    },
  })
}
