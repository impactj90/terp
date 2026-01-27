'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useDevLogin } from '@/hooks/use-auth'
import { useAuth } from '@/providers/auth-provider'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const devLogin = useDevLogin()
  const { isAuthenticated, isLoading: isAuthLoading, refetch } = useAuth()
  const t = useTranslations('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const returnUrl = searchParams.get('returnUrl') ?? '/dashboard'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      router.push(returnUrl)
    }
  }, [isAuthenticated, isAuthLoading, router, returnUrl])

  const handleDevLogin = async (role: 'admin' | 'user') => {
    setIsLoading(true)
    setError(null)

    try {
      await devLogin(role)
      // Refetch user data to update auth state
      await refetch()
      router.push(returnUrl)
    } catch {
      setError(t('loginFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const isPageLoading = isLoading || isAuthLoading

  return (
    <div className="space-y-6">
      {/* Logo and title */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-2xl font-bold">T</span>
        </div>
        <h1 className="text-2xl font-bold">{t('welcomeTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('welcomeSubtitle')}
        </p>
      </div>

      {/* Login form card */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isPageLoading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                {t('password')}
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                {t('forgotPassword')}
              </Link>
            </div>
            <input
              id="password"
              type="password"
              placeholder={t('passwordPlaceholder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isPageLoading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPageLoading}>
            {isPageLoading ? t('signingIn') : t('signIn')}
          </Button>
        </form>

        {/* Error message */}
        {error && (
          <p className="mt-4 text-center text-sm text-destructive">{error}</p>
        )}

        {/* Dev login buttons */}
        <div className="mt-6 border-t pt-6">
          <p className="mb-3 text-center text-xs text-muted-foreground">
            {t('devModeQuickLogin')}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleDevLogin('user')}
              disabled={isPageLoading}
            >
              {t('loginAsUser')}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleDevLogin('admin')}
              disabled={isPageLoading}
            >
              {t('loginAsAdmin')}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer links */}
      <p className="text-center text-xs text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/register" className="text-primary hover:underline">
          {t('contactAdministrator')}
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-muted-foreground" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
