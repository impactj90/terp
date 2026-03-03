import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Hook to fetch a user by ID with relations (tenant, userGroup, employee).
 *
 * @example
 * ```tsx
 * const { data: user, isLoading } = useUser(userId)
 * ```
 */
export function useUser(userId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.users.getById.queryOptions(
      { id: userId },
      { enabled: enabled && !!userId }
    )
  )
}

/**
 * Hook to update a user (display_name, avatar_url, etc.).
 *
 * Invalidates users list and auth.me queries on success.
 *
 * @example
 * ```tsx
 * const updateUser = useUpdateUser()
 * updateUser.mutate({ id: userId, displayName: 'New Name' })
 * ```
 */
export function useUpdateUser() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.users.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.users.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.users.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.auth.me.queryKey(),
      })
    },
  })
}
