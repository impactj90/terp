import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAccountsOptions {
  accountType?: 'bonus' | 'tracking' | 'balance'
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
 * ```
 */
export function useAccounts(options: UseAccountsOptions = {}) {
  const { accountType, active, includeSystem, enabled = true } = options

  return useApiQuery('/accounts', {
    params: {
      account_type: accountType,
      active,
      // Handler reads include_system param (not in OpenAPI spec but handler supports it)
      ...(includeSystem !== undefined ? { include_system: includeSystem } : {}),
    } as Record<string, unknown>,
    enabled,
  })
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
  return useApiQuery('/accounts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch account usage by ID.
 */
export function useAccountUsage(id: string, enabled = true) {
  return useApiQuery('/accounts/{id}/usage', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new account.
 */
export function useCreateAccount() {
  return useApiMutation('/accounts', 'post', {
    invalidateKeys: [['/accounts']],
  })
}

/**
 * Hook to update an existing account.
 */
export function useUpdateAccount() {
  return useApiMutation('/accounts/{id}', 'patch', {
    invalidateKeys: [
      ['/accounts'],
      ['/accounts/{id}'],
      ['/accounts/{id}/usage'],
    ],
  })
}

/**
 * Hook to delete an account.
 */
export function useDeleteAccount() {
  return useApiMutation('/accounts/{id}', 'delete', {
    invalidateKeys: [
      ['/accounts'],
      ['/accounts/{id}'],
      ['/accounts/{id}/usage'],
    ],
  })
}
