'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { isDev } from '@/lib/config'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const t = useTranslations('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const returnUrl = searchParams.get('returnUrl') ?? '/dashboard'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      router.push(returnUrl)
    }
  }, [isAuthenticated, isAuthLoading, router, returnUrl])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(t('loginFailed'))
        return
      }

      // The onAuthStateChange listener in AuthProvider will pick up the session.
      // Redirect will happen via the useEffect above once isAuthenticated is true.
      router.push(returnUrl)
    } catch {
      setError(t('loginFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Dev login: uses pre-seeded Supabase test users
  const handleDevLogin = async (role: 'admin' | 'user') => {
    setIsLoading(true)
    setError(null)

    const devCredentials = {
      admin: { email: 'admin@dev.local', password: 'dev-password-admin' },
      user: { email: 'user@dev.local', password: 'dev-password-user' },
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword(
        devCredentials[role]
      )

      if (signInError) {
        setError(t('loginFailed'))
        return
      }

      router.push(returnUrl)
    } catch {
      setError(t('loginFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const isPageLoading = isLoading || isAuthLoading

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              {t('email')}
            </label>
            <Input
              id="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              autoComplete="email"
              enterKeyHint="next"
              disabled={isPageLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('passwordPlaceholder')}
                autoComplete="current-password"
                enterKeyHint="go"
                className="pr-11"
                disabled={isPageLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full min-h-12"
            disabled={isPageLoading}
          >
            {isPageLoading && <Loader2 className="size-4 animate-spin" />}
            {isPageLoading ? t('signingIn') : t('signIn')}
          </Button>
        </form>

        {/* Dev login buttons - only shown in development */}
        {isDev && (
          <div className="mt-6 border-t pt-6">
            <p className="mb-3 text-center text-xs text-muted-foreground">
              {t('devModeQuickLogin')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-12"
                onClick={() => handleDevLogin('user')}
                disabled={isPageLoading}
              >
                {t('loginAsUser')}
              </Button>
              <Button
                variant="outline"
                className="flex-1 min-h-12"
                onClick={() => handleDevLogin('admin')}
                disabled={isPageLoading}
              >
                {t('loginAsAdmin')}
              </Button>
            </div>
          </div>
        )}
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
        <div className="flex min-h-[100dvh] items-center justify-center">
          <div className="text-muted-foreground" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
