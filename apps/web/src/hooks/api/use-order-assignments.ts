import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrderAssignmentsOptions {
  orderId?: string
  employeeId?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of order assignments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOrderAssignments({ orderId })
 * const assignments = data?.data ?? []
 * ```
 */
export function useOrderAssignments(options: UseOrderAssignmentsOptions = {}) {
  const { orderId, employeeId, enabled = true } = options

  return useApiQuery('/order-assignments', {
    params: { order_id: orderId, employee_id: employeeId },
    enabled,
  })
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
export function useOrderAssignmentsByOrder(orderId: string, enabled = true) {
  return useApiQuery('/orders/{id}/assignments', {
    path: { id: orderId },
    enabled: enabled && !!orderId,
  })
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
  return useApiQuery('/order-assignments/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateOrderAssignment() {
  return useApiMutation('/order-assignments', 'post', {
    invalidateKeys: [['/order-assignments'], ['/orders']],
  })
}

export function useUpdateOrderAssignment() {
  return useApiMutation('/order-assignments/{id}', 'patch', {
    invalidateKeys: [['/order-assignments'], ['/orders']],
  })
}

export function useDeleteOrderAssignment() {
  return useApiMutation('/order-assignments/{id}', 'delete', {
    invalidateKeys: [['/order-assignments'], ['/orders']],
  })
}
