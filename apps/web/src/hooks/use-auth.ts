import { useApiQuery, useApiMutation } from '@/hooks'
import { api, authStorage } from '@/lib/api/client'
import type { components } from '@/lib/api/types'

export type User = components['schemas']['User']

/**
 * Hook to fetch the current authenticated user.
 *
 * @example
 * ```tsx
 * const { data: user, isLoading, isError } = useCurrentUser()
 * ```
 */
export function useCurrentUser(enabled = true) {
  return useApiQuery('/auth/me', {
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook to login with credentials.
 *
 * @example
 * ```tsx
 * const login = useLogin()
 * login.mutate({ body: { email: 'user@example.com', password: 'secret' } })
 * ```
 */
export function useLogin() {
  return useApiMutation('/auth/login', 'post', {
    onSuccess: (data) => {
      // Store the token from the response
      if ('token' in data && typeof data.token === 'string') {
        authStorage.setToken(data.token)
      }
    },
  })
}

/**
 * Hook to login with dev user (development only).
 * Uses GET endpoint so we handle it differently.
 *
 * @example
 * ```tsx
 * const devLogin = useDevLogin()
 * await devLogin('admin')
 * ```
 */
export function useDevLogin() {
  return async (role: 'admin' | 'user' = 'user') => {
    const { data, error } = await api.GET('/auth/dev/login', {
      params: { query: { role } },
    })

    if (error) {
      throw error
    }

    if (data && 'token' in data && typeof data.token === 'string') {
      authStorage.setToken(data.token)
    }

    return data
  }
}

/**
 * Hook to list available dev users (development only).
 */
export function useDevUsers() {
  return useApiQuery('/auth/dev/users', {
    retry: false,
    staleTime: Infinity,
  })
}

/**
 * Hook to logout the current user.
 *
 * @example
 * ```tsx
 * const logout = useLogout()
 * logout.mutate({})
 * ```
 */
export function useLogout() {
  return useApiMutation('/auth/logout', 'post', {
    onSuccess: () => {
      authStorage.clearToken()
    },
    onError: () => {
      // Even if the server call fails, clear the local token
      authStorage.clearToken()
    },
  })
}
