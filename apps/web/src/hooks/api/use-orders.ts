import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrdersOptions {
  active?: boolean
  status?: 'planned' | 'active' | 'completed' | 'cancelled'
  enabled?: boolean
}

/**
 * Hook to fetch list of orders.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOrders()
 * const orders = data?.data ?? []
 * ```
 */
export function useOrders(options: UseOrdersOptions = {}) {
  const { active, status, enabled = true } = options

  return useApiQuery('/orders', {
    params: { active, status },
    enabled,
  })
}

/**
 * Hook to fetch a single order by ID.
 *
 * @example
 * ```tsx
 * const { data: order, isLoading } = useOrder(orderId)
 * ```
 */
export function useOrder(id: string, enabled = true) {
  return useApiQuery('/orders/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateOrder() {
  return useApiMutation('/orders', 'post', {
    invalidateKeys: [['/orders']],
  })
}

export function useUpdateOrder() {
  return useApiMutation('/orders/{id}', 'patch', {
    invalidateKeys: [['/orders']],
  })
}

export function useDeleteOrder() {
  return useApiMutation('/orders/{id}', 'delete', {
    invalidateKeys: [['/orders']],
  })
}
