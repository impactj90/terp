'use client'

import { AlertCircle, Lock, Wifi } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ClockErrorAlertProps {
  error: Error | unknown
  onRetry?: () => void
}

export function ClockErrorAlert({ error, onRetry }: ClockErrorAlertProps) {
  const { icon: Icon, title, message } = getErrorDetails(error)

  return (
    <Alert variant="destructive">
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{message}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function getErrorDetails(error: unknown): {
  icon: typeof AlertCircle
  title: string
  message: string
} {
  // Check for specific API error types
  if (error && typeof error === 'object') {
    const err = error as { status?: number; message?: string }

    if (err.status === 403) {
      return {
        icon: Lock,
        title: 'Month Closed',
        message: 'This month has been closed. You cannot create new bookings.',
      }
    }

    if (err.status === 400) {
      return {
        icon: AlertCircle,
        title: 'Invalid Request',
        message: err.message ?? 'The booking could not be created. Please try again.',
      }
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      return {
        icon: Wifi,
        title: 'No Connection',
        message: 'Please check your internet connection and try again.',
      }
    }
  }

  return {
    icon: AlertCircle,
    title: 'Error',
    message: 'Something went wrong. Please try again.',
  }
}
