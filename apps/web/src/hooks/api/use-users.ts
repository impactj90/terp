import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseUsersOptions {
  limit?: number
  search?: string
  enabled?: boolean
}

/**
 * Hook to fetch a paginated list of users for the current tenant.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useUsers({ search: 'john', limit: 50 })
 * ```
 */
export function useUsers(options: UseUsersOptions = {}) {
  const { limit = 100, search, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.users.list.queryOptions(
      { limit, search: search || undefined },
      { enabled }
    )
  )
}

export function useCreateUser() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.users.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.users.list.queryKey(),
      })
    },
  })
}

export function useDeleteUser() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.users.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.users.list.queryKey(),
      })
    },
  })
}

export function useChangeUserPassword() {
  const trpc = useTRPC()
  return useMutation(trpc.users.changePassword.mutationOptions())
}
