import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

/**
 * Hook to fetch employee vouchers.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEmployeeVouchers(employeeId)
 * const vouchers = data?.data ?? []
 * ```
 */
export function useEmployeeVouchers(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeVouchers.list.queryOptions(
      { employeeId },
      { enabled: enabled && !!employeeId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new employee voucher.
 *
 * @example
 * ```tsx
 * const createVoucher = useCreateEmployeeVoucher()
 * createVoucher.mutate({ employeeId: '...', ... })
 * ```
 */
export function useCreateEmployeeVoucher() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeVouchers.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeVouchers.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an employee voucher.
 *
 * @example
 * ```tsx
 * const updateVoucher = useUpdateEmployeeVoucher()
 * updateVoucher.mutate({ id: '...', ... })
 * ```
 */
export function useUpdateEmployeeVoucher() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeVouchers.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeVouchers.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an employee voucher.
 *
 * @example
 * ```tsx
 * const deleteVoucher = useDeleteEmployeeVoucher()
 * deleteVoucher.mutate({ id: '...' })
 * ```
 */
export function useDeleteEmployeeVoucher() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeVouchers.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.employeeVouchers.list.queryKey(),
      })
    },
  })
}
