import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseOrderTypesOptions {
  enabled?: boolean
  isActive?: boolean
}

export function useOrderTypes(options: UseOrderTypesOptions = {}) {
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orderTypes.list.queryOptions({ isActive }, { enabled }),
  )
}

export function useOrderType(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderTypes.getById.queryOptions({ id }, { enabled: enabled && !!id }),
  )
}

export function useCreateOrderType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderTypes.list.queryKey(),
      })
    },
  })
}

export function useUpdateOrderType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderTypes.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderTypes.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.orderTypes.getById.queryKey(),
      })
    },
  })
}

export function useDeleteOrderType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderTypes.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.orderTypes.list.queryKey(),
      })
    },
  })
}
