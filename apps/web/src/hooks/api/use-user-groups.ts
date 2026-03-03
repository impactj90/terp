import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseUserGroupsOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch user groups for the current tenant.
 *
 * Includes system groups (tenantId IS NULL) alongside tenant groups.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useUserGroups({ active: true })
 * ```
 */
export function useUserGroups(options: UseUserGroupsOptions = {}) {
  const { active, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.userGroups.list.queryOptions({ active }, { enabled })
  )
}

/**
 * Hook to fetch a single user group by ID with user count.
 *
 * @example
 * ```tsx
 * const { data: group, isLoading } = useUserGroup(groupId)
 * ```
 */
export function useUserGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.userGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateUserGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.userGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.userGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.permissions.list.queryKey(),
      })
    },
  })
}

export function useUpdateUserGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.userGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.userGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.auth.permissions.queryKey(),
      })
    },
  })
}

export function useDeleteUserGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.userGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.userGroups.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.auth.permissions.queryKey(),
      })
    },
  })
}
