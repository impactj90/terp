import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

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
  const trpc = useTRPC()
  return useQuery(
    trpc.departments.list.queryOptions(
      { isActive: active, parentId },
      { enabled }
    )
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.departments.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.departments.getTree.queryOptions(undefined, { enabled })
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new department.
 *
 * @example
 * ```tsx
 * const createDepartment = useCreateDepartment()
 * createDepartment.mutate({ name: 'Engineering', code: 'ENG' })
 * ```
 */
export function useCreateDepartment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.departments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.departments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.departments.getTree.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing department.
 *
 * @example
 * ```tsx
 * const updateDepartment = useUpdateDepartment()
 * updateDepartment.mutate({ id: departmentId, name: 'Updated Name' })
 * ```
 */
export function useUpdateDepartment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.departments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.departments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.departments.getTree.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a department.
 *
 * @example
 * ```tsx
 * const deleteDepartment = useDeleteDepartment()
 * deleteDepartment.mutate({ id: departmentId })
 * ```
 */
export function useDeleteDepartment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.departments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.departments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.departments.getTree.queryKey(),
      })
    },
  })
}
