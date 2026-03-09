import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch list of orders.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useOrders()
 * const orders = data?.data ?? []
 * ```
 */
export function useOrders(
  options: {
    isActive?: boolean
    status?: string
    enabled?: boolean
  } = {}
) {
  const { isActive, status, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orders.list.queryOptions({ isActive, status }, { enabled })
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.orders.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orders.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

export function useUpdateOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orders.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

export function useDeleteOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orders.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}
