'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { AlertTriangle, Clock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface CarryoverWarningProps {
  carryoverDays: number
  expiresAt: string | null | undefined
  className?: string
}

/**
 * Warning alert for expiring carryover vacation days.
 * Only displays if there are carryover days with an expiration date.
 */
export function CarryoverWarning({
  carryoverDays,
  expiresAt,
  className,
}: CarryoverWarningProps) {
  const t = useTranslations('vacation')
  const locale = useLocale()

  if (!carryoverDays || carryoverDays <= 0 || !expiresAt) {
    return null
  }

  const expirationDate = new Date(expiresAt)
  const today = new Date()
  const daysUntilExpiry = Math.ceil(
    (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Only show warning if expiring within 90 days
  if (daysUntilExpiry > 90) {
    return null
  }

  const isUrgent = daysUntilExpiry <= 30
  const formattedDate = expirationDate.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Alert
      variant={isUrgent ? 'destructive' : 'default'}
      className={className}
    >
      {isUrgent ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Clock className="h-4 w-4" />
      )}
      <AlertTitle>
        {isUrgent ? t('expiringTitle') : t('expirationNotice')}
      </AlertTitle>
      <AlertDescription>
        {t('carryoverExpiresMessage', { count: carryoverDays, date: formattedDate })}
        {' '}
        {daysUntilExpiry > 0 ? (
          <>({daysUntilExpiry === 1 ? t('dayRemaining') : t('daysRemaining', { count: daysUntilExpiry })})</>
        ) : (
          <>({t('expirestoday')})</>
        )}
        {' '}
        {t('useOrForfeit')}
      </AlertDescription>
    </Alert>
  )
}
