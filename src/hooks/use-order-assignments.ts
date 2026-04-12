import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch list of order assignments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOrderAssignments({ orderId })
 * const assignments = data?.data ?? []
 * ```
 */
export function useOrderAssignments(
  options: {
    orderId?: string
    employeeId?: string
    enabled?: boolean
  } = {}
) {
  const { orderId, employeeId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orderAssignments.list.queryOptions(
      { orderId, employeeId },
      { enabled }
    )
  )
}

/**
 * Hook to fetch assignments for a specific order.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOrderAssignmentsByOrder(orderId)
 * const assignments = data?.data ?? []
 * ```
 */
export function useOrderAssignmentsByOrder(
  orderId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderAssignments.byOrder.queryOptions(
      { orderId },
      { enabled: enabled && !!orderId }
    )
  )
}

/**
 * Hook to fetch a single order assignment by ID.
 *
 * @example
 * ```tsx
 * const { data: assignment, isLoading } = useOrderAssignment(assignmentId)
 * ```
 */
export function useOrderAssignment(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderAssignments.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateOrderAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderAssignments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.byOrder.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

export function useUpdateOrderAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderAssignments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.byOrder.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

export function useDeleteOrderAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderAssignments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderAssignments.byOrder.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}
