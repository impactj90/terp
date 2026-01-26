import { useApiQuery } from '@/hooks'

interface UseAccountsOptions {
  accountType?: 'time' | 'bonus' | 'deduction' | 'vacation' | 'sick'
  active?: boolean
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
 * })
 * ```
 */
export function useAccounts(options: UseAccountsOptions = {}) {
  const { accountType, active, enabled = true } = options

  return useApiQuery('/accounts', {
    params: {
      account_type: accountType,
      active,
    },
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
