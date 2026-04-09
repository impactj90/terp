'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

/**
 * /reset-password
 *
 * Landing page for Supabase recovery links. Flow:
 *
 *   1. Supabase's auth.admin.generateLink({ type: 'recovery' }) produces a
 *      URL that, when clicked, has Supabase verify the token and redirect
 *      the browser here with the session attached (as either a PKCE `?code`
 *      query or an implicit `#access_token` hash fragment).
 *   2. `createBrowserClient` from @supabase/ssr has `detectSessionInUrl: true`
 *      as default — on mount it reads whichever form is present, exchanges
 *      it for a session, and stores it in cookies. We poll getSession() for
 *      up to 5s until the session is established (or fail → "invalid link").
 *   3. User enters new password + confirmation, submit → updateUser().
 *   4. On success → redirect to /dashboard. The session is already
 *      established, so the dashboard loads authenticated.
 */
type FlowState =
  | 'detecting'
  | 'ready'
  | 'invalid'
  | 'saving'
  | 'success'
  | 'error'

const SESSION_POLL_INTERVAL_MS = 150
const SESSION_POLL_TIMEOUT_MS = 5000

export default function ResetPasswordPage() {
  const t = useTranslations('resetPassword')
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [state, setState] = useState<FlowState>('detecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Parse the URL hash/query and establish the session. Supabase's
  // auth.admin.generateLink uses the implicit flow and returns a 303 with
  // `Location: .../reset-password#access_token=xxx&refresh_token=yyy&type=recovery`
  // (verified via curl against the local verify endpoint). We could rely on
  // createBrowserClient's detectSessionInUrl auto-detection, but it races
  // with next-intl's locale routing in Next.js 16. Doing it explicitly is
  // deterministic and easier to debug when things go wrong.
  useEffect(() => {
    let cancelled = false

    async function establishSession() {
      if (typeof window === 'undefined') return

      // 1. Error in the hash — Supabase sends `#error=access_denied&error_code=otp_expired&...`
      //    when the token is invalid/expired. Surface that before anything else.
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash
      const hashParams = new URLSearchParams(hash)
      const errorCode = hashParams.get('error_code') ?? hashParams.get('error')
      if (errorCode) {
        setState('invalid')
        return
      }

      // 2. Implicit flow: hash contains access_token + refresh_token.
      //    Call setSession so @supabase/ssr persists them into cookies.
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (cancelled) return
        if (error) {
          setState('invalid')
          return
        }
        // Clean the hash out of the URL so a refresh doesn't re-process it.
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        )
        setState('ready')
        return
      }

      // 3. PKCE fallback: some Supabase versions use ?code=... instead.
      //    Exchange it for a session if present.
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (error) {
          setState('invalid')
          return
        }
        // Clean `code` out of the URL.
        searchParams.delete('code')
        const query = searchParams.toString()
        window.history.replaceState(
          null,
          '',
          window.location.pathname + (query ? `?${query}` : ''),
        )
        setState('ready')
        return
      }

      // 4. Last-resort: maybe a previous recovery flow already set the
      //    session cookies (e.g. user bounced to login and came back).
      //    Poll getSession briefly before giving up.
      const started = Date.now()
      while (!cancelled) {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        if (data.session) {
          setState('ready')
          return
        }
        if (Date.now() - started > SESSION_POLL_TIMEOUT_MS) {
          setState('invalid')
          return
        }
        await new Promise((resolve) =>
          setTimeout(resolve, SESSION_POLL_INTERVAL_MS),
        )
      }
    }

    void establishSession()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (password.length < 8) {
      setErrorMessage(t('validationPasswordMinLength'))
      return
    }
    if (password !== passwordConfirm) {
      setErrorMessage(t('validationPasswordMismatch'))
      return
    }

    setState('saving')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMessage(error.message || t('errorGeneric'))
      setState('ready')
      return
    }

    setState('success')
    // Small delay so the user sees the success state before the redirect.
    setTimeout(() => router.push('/dashboard'), 800)
  }

  // --- Render ---

  if (state === 'detecting') {
    return (
      <Card>
        <Header title={t('title')} subtitle={t('detecting')} />
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (state === 'invalid') {
    return (
      <Card>
        <Header
          title={t('invalidLinkTitle')}
          subtitle={t('invalidLinkBody')}
        />
        <Link
          href="/login"
          className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('invalidLinkBackToLogin')}
        </Link>
      </Card>
    )
  }

  if (state === 'success') {
    return (
      <Card>
        <Header title={t('successTitle')} subtitle={t('successBody')} />
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  // state is 'ready' | 'saving' | 'error'
  const isBusy = state === 'saving'

  return (
    <Card>
      <Header title={t('title')} subtitle={t('subtitle')} />

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            {t('fieldNewPassword')}
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('placeholderPassword')}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBusy}
              className="pr-11"
              required
            />
            <button
              type="button"
              className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
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

        <div className="space-y-2">
          <label htmlFor="passwordConfirm" className="text-sm font-medium">
            {t('fieldConfirmPassword')}
          </label>
          <Input
            id="passwordConfirm"
            type={showPassword ? 'text' : 'password'}
            placeholder={t('placeholderPassword')}
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            disabled={isBusy}
            required
          />
        </div>

        {errorMessage && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <Button type="submit" className="w-full min-h-12" disabled={isBusy}>
          {isBusy && <Loader2 className="size-4 animate-spin" />}
          {isBusy ? t('savingButton') : t('submitButton')}
        </Button>
      </form>
    </Card>
  )
}

// --- Small inline helpers so the page matches the login page's look ---

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>
    </div>
  )
}

function Header({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <span className="text-2xl font-bold">T</span>
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}
