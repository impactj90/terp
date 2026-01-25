'use client'

import { createContext, useContext, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentUser, useLogout, type User } from '@/hooks/use-auth'
import { authStorage } from '@/lib/api/client'

/**
 * Auth context value interface
 */
export interface AuthContextValue {
  /** Current authenticated user, null if not authenticated */
  user: User | null
  /** Whether auth state is being loaded */
  isLoading: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Auth error if any */
  error: Error | null
  /** Logout the current user */
  logout: () => Promise<void>
  /** Refetch user data */
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: React.ReactNode
}

/**
 * Auth provider component that manages authentication state.
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient()

  // Check if we have a token before making the API call
  const hasToken = typeof window !== 'undefined' && !!authStorage.getToken()

  const {
    data: user,
    isLoading,
    error,
    refetch: refetchUser,
  } = useCurrentUser(hasToken)

  const logoutMutation = useLogout()

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync({})
    } catch {
      // Error is handled in the mutation's onError
    } finally {
      // Clear all queries on logout
      queryClient.clear()
    }
  }, [logoutMutation, queryClient])

  const refetch = useCallback(async () => {
    await refetchUser()
  }, [refetchUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      isLoading: hasToken && isLoading,
      isAuthenticated: !!user,
      error: error as Error | null,
      logout,
      refetch,
    }),
    [user, isLoading, hasToken, error, logout, refetch]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access auth context.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, logout } = useAuth()
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
