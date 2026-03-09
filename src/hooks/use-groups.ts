import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

type GroupType = "employee" | "workflow" | "activity"

/**
 * Hook to fetch list of groups by type.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useGroups({ type: "employee" })
 * const groups = data?.data ?? []
 * ```
 */
export function useGroups(options: {
  type: GroupType
  isActive?: boolean
  enabled?: boolean
}) {
  const { type, isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.groups.list.queryOptions({ type, isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single group by type and ID.
 *
 * @example
 * ```tsx
 * const { data: group, isLoading } = useGroup("employee", groupId)
 * ```
 */
export function useGroup(type: GroupType, id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.groups.getById.queryOptions(
      { type, id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.groups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.groups.list.queryKey() })
    },
  })
}

export function useUpdateGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.groups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.groups.list.queryKey() })
    },
  })
}

export function useDeleteGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.groups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.groups.list.queryKey() })
    },
  })
}
