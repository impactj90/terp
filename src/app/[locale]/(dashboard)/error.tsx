'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * Dashboard error boundary — catches errors inside the dashboard layout.
 * Providers (auth, i18n, theme) are still available since this is nested
 * inside the root layout.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {t('dashboardTitle')}
        </h2>
        <p className="text-muted-foreground">
          {t('dashboardDescription')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('reload')}
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              {t('goHome')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
