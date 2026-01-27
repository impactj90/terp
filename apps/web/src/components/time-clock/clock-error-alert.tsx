'use client'

import { useTranslations } from 'next-intl'
import { AlertCircle, Lock, Wifi } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ClockErrorAlertProps {
  error: Error | unknown
  onRetry?: () => void
}

export function ClockErrorAlert({ error, onRetry }: ClockErrorAlertProps) {
  const t = useTranslations('timeClock')
  const tc = useTranslations('common')
  const { icon: Icon, titleKey, messageKey } = getErrorDetails(error)

  return (
    <Alert variant="destructive">
      <Icon className="h-4 w-4" />
      <AlertTitle>{t(titleKey as Parameters<typeof t>[0])}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{t(messageKey as Parameters<typeof t>[0])}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
            {tc('tryAgain')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function getErrorDetails(error: unknown): {
  icon: typeof AlertCircle
  titleKey: string
  messageKey: string
} {
  // Check for specific API error types
  if (error && typeof error === 'object') {
    const err = error as { status?: number; message?: string }

    if (err.status === 403) {
      return {
        icon: Lock,
        titleKey: 'monthClosed',
        messageKey: 'monthClosedMessage',
      }
    }

    if (err.status === 400) {
      return {
        icon: AlertCircle,
        titleKey: 'invalidRequest',
        messageKey: 'invalidRequestMessage',
      }
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      return {
        icon: Wifi,
        titleKey: 'noConnection',
        messageKey: 'noConnectionMessage',
      }
    }
  }

  return {
    icon: AlertCircle,
    titleKey: 'genericError',
    messageKey: 'genericErrorMessage',
  }
}
