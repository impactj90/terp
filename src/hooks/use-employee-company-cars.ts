import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee company cars.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeCompanyCars(employeeId)
 * const companyCars = data?.data ?? []
 * ```
 */
export function useEmployeeCompanyCars(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeCompanyCars.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee company car.
 *
 * @example
 * ```tsx
 * const createCompanyCar = useCreateEmployeeCompanyCar()
 * createCompanyCar.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeCompanyCar() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCompanyCars.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCompanyCars.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee company car.
 *
 * @example
 * ```tsx
 * const updateCompanyCar = useUpdateEmployeeCompanyCar()
 * updateCompanyCar.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeCompanyCar() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCompanyCars.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCompanyCars.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee company car.
 *
 * @example
 * ```tsx
 * const deleteCompanyCar = useDeleteEmployeeCompanyCar()
 * deleteCompanyCar.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeCompanyCar() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeCompanyCars.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeCompanyCars.list.queryKey(),
      })
    },
  })
}
