# NOK-216: Implement Authentication Flow - Implementation Plan

## Overview

Implement authentication flow for the Next.js frontend including login page, auth context/provider, protected routes, and session management. Since the backend's `POST /auth/login` endpoint is **NOT IMPLEMENTED**, we will use the dev login system (`GET /auth/dev/login?role=admin|user`) for authentication during development.

## Current State Analysis

### What Exists:
- **API Client** (`/apps/web/src/lib/api/client.ts`):
  - openapi-fetch client with auth middleware
  - `authStorage` interface for token management (localStorage-based)
  - `tenantIdStorage` for multi-tenant support
  - Auth middleware that adds `Authorization: Bearer <token>` header

- **React Query Setup** (`/apps/web/src/providers/query-provider.tsx`):
  - QueryClient with sensible defaults (5min stale time, 1 retry)
  - DevTools in development mode

- **Error Handling** (`/apps/web/src/lib/api/errors.ts`):
  - `parseApiError()`, `isAuthError()`, `isForbiddenError()` utilities
  - RFC 7807 ProblemDetails support

- **Generated Types** (`/apps/web/src/lib/api/types.ts`):
  - All auth operations typed: `devLogin`, `getCurrentUser`, `authLogout`, `authRefresh`
  - `User` schema with id, email, display_name, avatar_url, role, timestamps

- **shadcn/ui**: Only `button.tsx` installed, need to add more components

### What's Missing:
- AuthContext and AuthProvider for global auth state
- Auth hooks (useAuth, useDevLogin, useLogout, useRefreshToken)
- Login page with dev login functionality
- Protected route wrapper/middleware
- Required shadcn components (input, label, card, alert)

## Desired End State

After implementing this plan:

1. Users can log in using the dev login buttons (Admin/User role selection)
2. Auth state is managed globally via React Context
3. Protected routes redirect unauthenticated users to login
4. Token is stored in localStorage and sent with all API requests
5. User can log out, clearing their session
6. Token refresh works automatically before expiration

### Verification:
- Navigate to a protected route while logged out -> redirected to `/login`
- Click "Login as Admin" -> redirected to dashboard with user state populated
- Refresh page -> user stays logged in (token persists in localStorage)
- Click logout -> redirected to login page, token cleared
- API calls include Authorization header

## What We're NOT Doing

- **Email/password login form**: Backend doesn't support `POST /auth/login`
- **User registration**: Not in scope
- **Password reset**: Not in scope
- **OAuth/social login**: Not in scope
- **Remember me functionality**: Token already persists in localStorage
- **Multi-factor authentication**: Not in scope
- **Role-based route protection**: Only implementing authenticated/unauthenticated distinction

## Implementation Approach

We will implement this in 6 phases, each building on the previous:

1. **Phase 1**: Add required shadcn/ui components (foundation)
2. **Phase 2**: Create AuthContext and AuthProvider (state management)
3. **Phase 3**: Create auth hooks (API integration)
4. **Phase 4**: Create login page (UI)
5. **Phase 5**: Create protected route wrapper (route protection)
6. **Phase 6**: Integrate into app layout and test (wiring everything together)

---

## Phase 1: Add Required shadcn/ui Components

### Overview
Install the shadcn/ui components needed for the login page and error handling UI.

### Changes Required:

#### 1. Install shadcn components via CLI

Run from `apps/web/` directory:

```bash
npx shadcn@latest add input label card alert
```

This will create the following files:
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/alert.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] Components exist: `ls apps/web/src/components/ui/{input,label,card,alert}.tsx`
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] None required for this phase

**Implementation Note**: This phase only adds component files. No integration testing needed yet.

---

## Phase 2: Create AuthContext and AuthProvider

### Overview
Create the React Context for managing authentication state globally across the application.

### Changes Required:

#### 1. Create Auth Types
**File**: `apps/web/src/types/auth.ts`

```typescript
import type { components } from '@/lib/api/types'

/**
 * User type from the API schema
 */
export type User = components['schemas']['User']

/**
 * Auth state managed by the AuthContext
 */
export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * Auth context value including state and actions
 */
export interface AuthContextValue extends AuthState {
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  clearAuth: () => void
}

/**
 * Dev login role options
 */
export type DevLoginRole = 'admin' | 'user'
```

#### 2. Update types index export
**File**: `apps/web/src/types/index.ts`

```typescript
export * from './auth'
```

#### 3. Create AuthContext
**File**: `apps/web/src/contexts/auth-context.tsx`

```typescript
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AuthContextValue, User } from '@/types/auth'
import { authStorage, tenantIdStorage } from '@/lib/api/client'

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
  initialUser?: User | null
}

/**
 * AuthProvider manages authentication state for the application.
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUserState] = useState<User | null>(initialUser)
  const [isLoading, setIsLoading] = useState(false)

  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser)
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading)
  }, [])

  const clearAuth = useCallback(() => {
    setUserState(null)
    authStorage.clearToken()
    tenantIdStorage.clearTenantId()
  }, [])

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    setUser,
    setLoading,
    clearAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access auth context.
 * Must be used within an AuthProvider.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated } = useAuthContext()
 * ```
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return context
}
```

#### 4. Create contexts index export
**File**: `apps/web/src/contexts/index.ts`

```typescript
export { AuthProvider, useAuthContext } from './auth-context'
```

### Success Criteria:

#### Automated Verification:
- [ ] Files exist: `ls apps/web/src/types/auth.ts apps/web/src/contexts/auth-context.tsx`
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] None required for this phase

**Implementation Note**: AuthProvider is not yet integrated into the app layout. That happens in Phase 6.

---

## Phase 3: Create Auth Hooks

### Overview
Create custom hooks for auth operations: dev login, logout, refresh token, and the main useAuth hook.

### Changes Required:

#### 1. Create useDevLogin hook
**File**: `apps/web/src/hooks/api/use-auth.ts`

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, authStorage } from '@/lib/api/client'
import type { DevLoginRole, User } from '@/types/auth'
import { useAuthContext } from '@/contexts/auth-context'
import { parseApiError, type ApiError } from '@/lib/api/errors'

/**
 * Response from dev login endpoint
 */
interface DevLoginResponse {
  token?: string
  user?: User
}

/**
 * Hook for dev login functionality.
 * Uses GET /auth/dev/login endpoint.
 *
 * @example
 * ```tsx
 * const { login, isLoading, error } = useDevLogin()
 *
 * const handleLogin = () => {
 *   login('admin', {
 *     onSuccess: () => router.push('/dashboard')
 *   })
 * }
 * ```
 */
export function useDevLogin() {
  const { setUser, setLoading } = useAuthContext()
  const queryClient = useQueryClient()

  const mutation = useMutation<DevLoginResponse, ApiError, DevLoginRole>({
    mutationFn: async (role: DevLoginRole) => {
      const { data, error } = await api.GET('/auth/dev/login', {
        params: {
          query: { role },
        },
      })

      if (error) {
        throw parseApiError(error)
      }

      return data as DevLoginResponse
    },
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      if (data.token) {
        authStorage.setToken(data.token)
      }
      if (data.user) {
        setUser(data.user)
      }
      // Invalidate any cached queries that might depend on auth state
      queryClient.invalidateQueries()
    },
    onSettled: () => {
      setLoading(false)
    },
  })

  const login = useCallback(
    (role: DevLoginRole, options?: { onSuccess?: () => void; onError?: (error: ApiError) => void }) => {
      mutation.mutate(role, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      })
    },
    [mutation]
  )

  return {
    login,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}

/**
 * Hook for logout functionality.
 * Uses POST /auth/logout endpoint.
 *
 * @example
 * ```tsx
 * const { logout, isLoading } = useLogout()
 *
 * const handleLogout = () => {
 *   logout({ onSuccess: () => router.push('/login') })
 * }
 * ```
 */
export function useLogout() {
  const { clearAuth } = useAuthContext()
  const queryClient = useQueryClient()

  const mutation = useMutation<void, ApiError, void>({
    mutationFn: async () => {
      // Call logout endpoint (clears httpOnly cookie on backend)
      const { error } = await api.POST('/auth/logout')

      if (error) {
        // Log error but continue with local logout
        console.error('Logout API error:', error)
      }

      // Always clear local auth state regardless of API response
      return
    },
    onSuccess: () => {
      clearAuth()
      // Clear all cached queries
      queryClient.clear()
    },
  })

  const logout = useCallback(
    (options?: { onSuccess?: () => void }) => {
      mutation.mutate(undefined, {
        onSuccess: options?.onSuccess,
      })
    },
    [mutation]
  )

  return {
    logout,
    isLoading: mutation.isPending,
  }
}

/**
 * Hook for token refresh functionality.
 * Uses POST /auth/refresh endpoint.
 *
 * @example
 * ```tsx
 * const { refresh, isLoading } = useRefreshToken()
 * ```
 */
export function useRefreshToken() {
  const mutation = useMutation<{ token?: string }, ApiError, void>({
    mutationFn: async () => {
      const { data, error } = await api.POST('/auth/refresh')

      if (error) {
        throw parseApiError(error)
      }

      return data as { token?: string }
    },
    onSuccess: (data) => {
      if (data.token) {
        authStorage.setToken(data.token)
      }
    },
  })

  return {
    refresh: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
  }
}

/**
 * Hook to fetch current user profile.
 * Uses GET /auth/me endpoint.
 *
 * This hook is primarily used to hydrate auth state on page load
 * when a token exists in localStorage.
 *
 * @example
 * ```tsx
 * const { data: user, isLoading } = useCurrentUser({ enabled: hasToken })
 * ```
 */
export function useCurrentUser(options?: { enabled?: boolean }) {
  const { setUser } = useAuthContext()

  return useQuery<User, ApiError>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/auth/me')

      if (error) {
        throw parseApiError(error)
      }

      // Update auth context when user data is fetched
      if (data) {
        setUser(data as User)
      }

      return data as User
    },
    enabled: options?.enabled ?? true,
    retry: false, // Don't retry auth requests
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

#### 2. Update hooks/api/index.ts
**File**: `apps/web/src/hooks/api/index.ts`

```typescript
export * from './use-employees'
export * from './use-bookings'
export * from './use-auth'
```

#### 3. Create main useAuth hook
**File**: `apps/web/src/hooks/use-auth.ts`

```typescript
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthContext } from '@/contexts/auth-context'
import { useCurrentUser, useDevLogin, useLogout, useRefreshToken } from '@/hooks/api/use-auth'
import { authStorage } from '@/lib/api/client'

/**
 * Main auth hook that combines all auth functionality.
 * Handles initial auth state hydration and provides auth actions.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, isLoading, login, logout } = useAuth()
 * ```
 */
export function useAuth() {
  const context = useAuthContext()
  const { login, isLoading: isLoginLoading, error: loginError, reset: resetLoginError } = useDevLogin()
  const { logout, isLoading: isLogoutLoading } = useLogout()
  const { refresh } = useRefreshToken()

  // Check for existing token and hydrate user state
  const hasToken = typeof window !== 'undefined' && authStorage.getToken() !== null
  const { isLoading: isUserLoading } = useCurrentUser({
    enabled: hasToken && !context.user,
  })

  return {
    // State
    user: context.user,
    isAuthenticated: context.isAuthenticated,
    isLoading: context.isLoading || isLoginLoading || isLogoutLoading || isUserLoading,

    // Actions
    login,
    logout,
    refresh,

    // Errors
    loginError,
    resetLoginError,
  }
}

/**
 * Hook that redirects to login if user is not authenticated.
 * Use this in protected pages/layouts.
 *
 * @param redirectTo - Path to redirect unauthenticated users (default: '/login')
 *
 * @example
 * ```tsx
 * // In a protected page
 * useRequireAuth()
 * // or with custom redirect
 * useRequireAuth('/signin')
 * ```
 */
export function useRequireAuth(redirectTo: string = '/login') {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Don't redirect while still loading auth state
    if (isLoading) return

    // Don't redirect if already authenticated
    if (isAuthenticated) return

    // Don't redirect if already on login page
    if (pathname === redirectTo) return

    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(pathname)
    router.push(`${redirectTo}?returnUrl=${returnUrl}`)
  }, [isAuthenticated, isLoading, router, pathname, redirectTo])

  return { isAuthenticated, isLoading }
}
```

#### 4. Update hooks/index.ts
**File**: `apps/web/src/hooks/index.ts`

```typescript
export * from './use-api-query'
export * from './use-api-mutation'
export * from './use-auth'
```

### Success Criteria:

#### Automated Verification:
- [ ] Files exist: `ls apps/web/src/hooks/api/use-auth.ts apps/web/src/hooks/use-auth.ts`
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] None required for this phase

**Implementation Note**: Hooks are ready but not yet used in any components. Integration testing happens in Phase 6.

---

## Phase 4: Create Login Page

### Overview
Create the login page with dev login buttons for admin and user roles.

### Changes Required:

#### 1. Create login page
**File**: `apps/web/src/app/login/page.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/hooks/use-auth'
import { clientEnv } from '@/config/env'

/**
 * Login page with dev login functionality.
 *
 * Since the backend POST /auth/login is not implemented,
 * this page provides dev login buttons for testing.
 */
export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, isAuthenticated, isLoading, loginError, resetLoginError } = useAuth()

  const returnUrl = searchParams.get('returnUrl') ?? '/dashboard'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push(returnUrl)
    }
  }, [isAuthenticated, isLoading, router, returnUrl])

  const handleDevLogin = (role: 'admin' | 'user') => {
    resetLoginError()
    login(role, {
      onSuccess: () => {
        router.push(returnUrl)
      },
    })
  }

  // Show nothing while checking auth state
  if (isLoading && !loginError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">{clientEnv.appName}</CardTitle>
          <CardDescription>
            Sign in to access the time tracking system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loginError && (
            <Alert variant="destructive">
              <AlertTitle>Login Failed</AlertTitle>
              <AlertDescription>
                {loginError.message || 'An error occurred during login. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Development Mode - Select a role to continue
            </p>

            <div className="grid gap-3">
              <Button
                onClick={() => handleDevLogin('admin')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Signing in...' : 'Login as Admin'}
              </Button>

              <Button
                onClick={() => handleDevLogin('user')}
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? 'Signing in...' : 'Login as User'}
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Dev Login Only
              </span>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Email/password login is not yet available.
            <br />
            Use the dev login buttons above for testing.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `ls apps/web/src/app/login/page.tsx`
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] Navigate to `/login` - page renders without errors
- [ ] Both login buttons are visible
- [ ] Page shows appropriate loading states

**Implementation Note**: Page is accessible but AuthProvider is not yet in layout. Full testing happens in Phase 6.

---

## Phase 5: Create Protected Route Wrapper

### Overview
Create a component that protects routes from unauthenticated access.

### Changes Required:

#### 1. Create ProtectedRoute component
**File**: `apps/web/src/components/auth/protected-route.tsx`

```typescript
'use client'

import { type ReactNode } from 'react'
import { useRequireAuth } from '@/hooks/use-auth'

interface ProtectedRouteProps {
  children: ReactNode
  /** Path to redirect unauthenticated users */
  redirectTo?: string
  /** Content to show while checking auth */
  loadingFallback?: ReactNode
}

/**
 * Wrapper component that protects its children from unauthenticated access.
 * Redirects to login page if user is not authenticated.
 *
 * @example
 * ```tsx
 * // In a layout or page
 * <ProtectedRoute>
 *   <Dashboard />
 * </ProtectedRoute>
 *
 * // With custom redirect
 * <ProtectedRoute redirectTo="/signin">
 *   <Dashboard />
 * </ProtectedRoute>
 *
 * // With custom loading
 * <ProtectedRoute loadingFallback={<Spinner />}>
 *   <Dashboard />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  redirectTo = '/login',
  loadingFallback,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useRequireAuth(redirectTo)

  // Show loading state while checking authentication
  if (isLoading) {
    return loadingFallback ?? (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Don't render children if not authenticated
  // (redirect will happen via useRequireAuth)
  if (!isAuthenticated) {
    return loadingFallback ?? (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Redirecting to login...</div>
      </div>
    )
  }

  return <>{children}</>
}
```

#### 2. Create auth components index
**File**: `apps/web/src/components/auth/index.ts`

```typescript
export { ProtectedRoute } from './protected-route'
```

#### 3. Create UserMenu component for header
**File**: `apps/web/src/components/auth/user-menu.tsx`

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

/**
 * User menu component showing current user and logout button.
 *
 * @example
 * ```tsx
 * <header>
 *   <UserMenu />
 * </header>
 * ```
 */
export function UserMenu() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  const handleLogout = () => {
    logout({
      onSuccess: () => {
        router.push('/login')
      },
    })
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  if (!isAuthenticated || !user) {
    return (
      <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
        Sign In
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <span className="text-muted-foreground">Signed in as </span>
        <span className="font-medium">{user.display_name}</span>
        <span className="ml-2 text-xs text-muted-foreground">({user.role})</span>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Sign Out
      </Button>
    </div>
  )
}
```

#### 4. Update auth components index
**File**: `apps/web/src/components/auth/index.ts`

```typescript
export { ProtectedRoute } from './protected-route'
export { UserMenu } from './user-menu'
```

### Success Criteria:

#### Automated Verification:
- [ ] Files exist: `ls apps/web/src/components/auth/{protected-route,user-menu,index}.tsx`
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`

#### Manual Verification:
- [ ] None required for this phase

**Implementation Note**: Components ready but not yet used. Full integration in Phase 6.

---

## Phase 6: Integrate into App Layout and Test

### Overview
Wire everything together: add AuthProvider to root layout, create a protected dashboard page, and verify the complete auth flow.

### Changes Required:

#### 1. Update root layout with AuthProvider
**File**: `apps/web/src/app/layout.tsx`

```typescript
import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/providers/query-provider'
import { AuthProvider } from '@/contexts/auth-context'

export const metadata: Metadata = {
  title: 'Terp',
  description: 'Time tracking and employee management system',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
```

#### 2. Create dashboard page (protected)
**File**: `apps/web/src/app/dashboard/page.tsx`

```typescript
'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { UserMenu } from '@/components/auth/user-menu'
import { useAuth } from '@/hooks/use-auth'

function DashboardContent() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <UserMenu />
        </div>
      </header>
      <main className="container py-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Welcome, {user?.display_name}!</h2>
          <p className="text-muted-foreground">
            You are logged in as <strong>{user?.role}</strong>.
          </p>
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-2">User Details</h3>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="inline text-muted-foreground">Email: </dt>
                <dd className="inline">{user?.email}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">User ID: </dt>
                <dd className="inline font-mono text-xs">{user?.id}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Role: </dt>
                <dd className="inline">{user?.role}</dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
```

#### 3. Update home page to redirect
**File**: `apps/web/src/app/page.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'

export default function HomePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) return

    if (isAuthenticated) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`
- [ ] Build succeeds: `cd apps/web && pnpm run build`

#### Manual Verification:
- [ ] Start services: `make dev` (from project root)
- [ ] Navigate to `http://localhost:3001/` - redirects to `/login`
- [ ] Navigate to `http://localhost:3001/dashboard` while not logged in - redirects to `/login`
- [ ] Click "Login as Admin" - redirects to `/dashboard` showing admin user info
- [ ] Refresh page - stays logged in on `/dashboard`
- [ ] Click "Sign Out" - redirects to `/login`, clears auth state
- [ ] Click "Login as User" - shows user role instead of admin
- [ ] Check browser DevTools Network tab - API requests include Authorization header
- [ ] Check browser DevTools Application tab - `auth_token` present in localStorage when logged in

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests (Future):
- AuthContext state management
- useAuth hook behavior
- useRequireAuth redirect logic

### Integration Tests (Future):
- Login flow end-to-end
- Protected route redirection
- Logout and state cleanup

### Manual Testing Steps:
1. Start both backend and frontend: `make dev`
2. Open browser to `http://localhost:3001`
3. Verify redirect to login page
4. Click "Login as Admin"
5. Verify redirect to dashboard with user info
6. Refresh page and verify persistent login
7. Click "Sign Out"
8. Verify redirect to login and cleared state
9. Try accessing `/dashboard` directly - should redirect to login
10. Login as "User" role and verify different role displayed

## Performance Considerations

- Token check uses localStorage (sync access, no network delay)
- User fetch has 5-minute stale time to minimize API calls
- Query client is cleared on logout to prevent stale data
- No refetch on window focus by default

## Migration Notes

Not applicable - this is a new feature implementation.

## References

- Research document: `thoughts/shared/research/2026-01-25-NOK-216-implement-authentication-flow.md`
- Backend auth handler: `apps/api/internal/handler/auth.go`
- Backend auth middleware: `apps/api/internal/middleware/auth.go`
- API client: `apps/web/src/lib/api/client.ts`
- Generated types: `apps/web/src/lib/api/types.ts`
