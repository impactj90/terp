import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseWageGroupsOptions {
  enabled?: boolean
  isActive?: boolean
}

export function useWageGroups(options: UseWageGroupsOptions = {}) {
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.wageGroups.list.queryOptions({ isActive }, { enabled }),
  )
}

export function useWageGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.wageGroups.getById.queryOptions({ id }, { enabled: enabled && !!id }),
  )
}

export function useCreateWageGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.wageGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.wageGroups.list.queryKey(),
      })
    },
  })
}

export function useUpdateWageGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.wageGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.wageGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.wageGroups.getById.queryKey(),
      })
    },
  })
}

export function useDeleteWageGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.wageGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.wageGroups.list.queryKey(),
      })
    },
  })
}
