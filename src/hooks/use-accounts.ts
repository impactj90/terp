import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseAccountsOptions {
  accountType?: string
  active?: boolean
  includeSystem?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of accounts.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useAccounts({
 *   accountType: 'bonus',
 *   active: true,
 *   includeSystem: true,
 * })
 * const accounts = data?.data ?? []
 * ```
 */
export function useAccounts(options: UseAccountsOptions = {}) {
  const { accountType, active, includeSystem, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.accounts.list.queryOptions(
      { accountType, active, includeSystem },
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single account by ID.
 *
 * @example
 * ```tsx
 * const { data: account, isLoading } = useAccount(accountId)
 * ```
 */
export function useAccount(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.accounts.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

/**
 * Hook to fetch account usage by ID.
 */
export function useAccountUsage(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.accounts.getUsage.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new account.
 */
export function useCreateAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accounts.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accounts.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing account.
 */
export function useUpdateAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accounts.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accounts.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete an account.
 */
export function useDeleteAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accounts.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.accounts.list.queryKey(),
      })
    },
  })
}
