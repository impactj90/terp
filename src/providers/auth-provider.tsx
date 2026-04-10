'use client'

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTRPC } from '@/trpc'
import {
  authStorage,
  platformImpersonationStorage,
  type PlatformImpersonationRef,
} from '@/lib/storage'
import type { Session } from '@supabase/supabase-js'

/**
 * User type from the tRPC auth.me response.
 */
export type AuthUser = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: string
  tenantId: string | null
  userGroupId: string | null
  employeeId: string | null
  isActive: boolean | null
}

/**
 * Auth context value interface.
 */
export interface AuthContextValue {
  /** Current authenticated user from DB (via tRPC auth.me) */
  user: AuthUser | null
  /** Supabase session */
  session: Session | null
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
 * Auth provider component that manages authentication state via Supabase.
 *
 * Listens for Supabase auth state changes and fetches the full user
 * from the database via the tRPC auth.me endpoint.
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
  const supabase = useMemo(() => createClient(), [])
  const trpc = useTRPC()
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  // Platform operator impersonation state. Populated when the operator
  // clicks "Tenant öffnen" in /platform/support-sessions (Phase 4). This
  // acts as a second auth source alongside the normal Supabase session —
  // either one being present makes the user "authenticated" for the
  // purposes of ProtectedRoute, and both drive auth.me resolution.
  const [impersonation, setImpersonation] =
    useState<PlatformImpersonationRef | null>(null)

  // Listen for Supabase auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      setIsSessionLoading(false)
      // Sync token to authStorage for legacy API hooks
      if (initialSession?.access_token) {
        authStorage.setToken(initialSession.access_token)
      } else {
        authStorage.clearToken()
      }
    })

    // Subscribe to auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setIsSessionLoading(false)
      // Sync token to authStorage for legacy API hooks
      if (newSession?.access_token) {
        authStorage.setToken(newSession.access_token)
      } else {
        authStorage.clearToken()
      }
    })

    // Load platform impersonation state from localStorage on mount
    // (no-ops on SSR). Also listen for cross-tab storage events so that
    // exiting the session in one operator tab propagates to any other.
    setImpersonation(platformImpersonationStorage.get())
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'terp_platform_impersonation') {
        setImpersonation(platformImpersonationStorage.get())
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }

    return () => {
      subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    }
  }, [supabase])

  // Fetch user data from tRPC when EITHER auth source is available.
  // During impersonation, the tRPC client (src/trpc/client.tsx) injects
  // x-support-session-id and the backend (src/trpc/init.ts) synthesizes
  // the Platform System sentinel as ctx.user — so auth.me resolves cleanly.
  const meQuery = useQuery(
    trpc.auth.me.queryOptions(undefined, {
      enabled: !!session || !!impersonation,
      retry: false,
      staleTime: 5 * 60 * 1000,
    })
  )

  const logout = useCallback(async () => {
    // If an operator clicks the normal tenant-header Logout button while
    // impersonating, surface a warning and recover cleanly. The intended
    // exit path is the banner's "Session verlassen" action (Phase 4).
    if (platformImpersonationStorage.get()) {
      console.warn(
        "[Auth] logout() called while platform impersonation is active. " +
          "Use the 'Session verlassen' banner action instead — this also " +
          'clears the impersonation state.',
      )
      platformImpersonationStorage.clear()
      setImpersonation(null)
    }
    await supabase.auth.signOut()
    authStorage.clearToken()
    queryClient.clear()
    setSession(null)
  }, [supabase, queryClient])

  const refetch = useCallback(async () => {
    await meQuery.refetch()
  }, [meQuery])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data?.user ?? null,
      session,
      isLoading:
        isSessionLoading ||
        ((!!session || !!impersonation) && meQuery.isLoading),
      isAuthenticated:
        (!!session || !!impersonation) && !!meQuery.data?.user,
      error: meQuery.error as Error | null,
      logout,
      refetch,
    }),
    [
      session,
      impersonation,
      isSessionLoading,
      meQuery.data,
      meQuery.isLoading,
      meQuery.error,
      logout,
      refetch,
    ]
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
