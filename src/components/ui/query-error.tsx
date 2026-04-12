'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Button } from './button'

interface QueryErrorProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export function QueryError({ message, onRetry, className }: QueryErrorProps) {
  const t = useTranslations('common')

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('error')}</AlertTitle>
      <AlertDescription className="flex items-center gap-2">
        <span>{message ?? t('failedToLoad')}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
