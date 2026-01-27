'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'

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
  const { isAuthenticated, isLoading } = useAuth()
  const t = useTranslations('auth')
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

  // Show loading state while checking authentication
  if (isLoading) {
    return loadingFallback ?? (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">{t('loading')}</div>
      </div>
    )
  }

  // Don't render children if not authenticated
  // (redirect will happen via useEffect)
  if (!isAuthenticated) {
    return loadingFallback ?? (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">{t('redirectingToLogin')}</div>
      </div>
    )
  }

  return <>{children}</>
}
