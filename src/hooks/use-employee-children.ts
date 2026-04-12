import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee children.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeChildren(employeeId)
 * const children = data?.data ?? []
 * ```
 */
export function useEmployeeChildren(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeChildren.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee child.
 *
 * @example
 * ```tsx
 * const createChild = useCreateEmployeeChild()
 * createChild.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeChild() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeChildren.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeChildren.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee child.
 *
 * @example
 * ```tsx
 * const updateChild = useUpdateEmployeeChild()
 * updateChild.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeChild() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeChildren.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeChildren.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee child.
 *
 * @example
 * ```tsx
 * const deleteChild = useDeleteEmployeeChild()
 * deleteChild.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeChild() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeChildren.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeChildren.list.queryKey(),
      })
    },
  })
}
