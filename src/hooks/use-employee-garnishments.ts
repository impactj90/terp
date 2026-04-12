import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee garnishments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeGarnishments(employeeId)
 * const garnishments = data?.data ?? []
 * ```
 */
export function useEmployeeGarnishments(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeGarnishments.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee garnishment.
 *
 * @example
 * ```tsx
 * const createGarnishment = useCreateEmployeeGarnishment()
 * createGarnishment.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeGarnishment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeGarnishments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeGarnishments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee garnishment.
 *
 * @example
 * ```tsx
 * const updateGarnishment = useUpdateEmployeeGarnishment()
 * updateGarnishment.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeGarnishment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeGarnishments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeGarnishments.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee garnishment.
 *
 * @example
 * ```tsx
 * const deleteGarnishment = useDeleteEmployeeGarnishment()
 * deleteGarnishment.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeGarnishment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeGarnishments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeGarnishments.list.queryKey(),
      })
    },
  })
}
