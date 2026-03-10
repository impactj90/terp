import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseAccountGroupsOptions {
  isActive?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch account groups.
 *
 * @example
 * ```tsx
 * const { data } = useAccountGroups()
 * const groups = data?.data ?? []
 * ```
 */
export function useAccountGroups(options: UseAccountGroupsOptions = {}) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.accountGroups.list.queryOptions({ isActive }, { enabled })
  )
}

/**
 * Hook to fetch a single account group by ID.
 *
 * @example
 * ```tsx
 * const { data: group } = useAccountGroup(groupId)
 * ```
 */
export function useAccountGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.accountGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new account group.
 */
export function useCreateAccountGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accountGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accountGroups.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing account group.
 */
export function useUpdateAccountGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accountGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accountGroups.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an account group.
 */
export function useDeleteAccountGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accountGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accountGroups.list.queryKey(),
      })
    },
  })
}
