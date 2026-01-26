'use client'

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
  const formattedDate = expirationDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const dayLabel = carryoverDays === 1 ? 'day' : 'days'
  const expiresLabel = carryoverDays === 1 ? 'expires' : 'expire'
  const itLabel = carryoverDays === 1 ? 'it' : 'them'
  const willLabel = carryoverDays === 1 ? 'it' : 'they'

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
        {isUrgent ? 'Carryover Expiring Soon' : 'Carryover Expiration Notice'}
      </AlertTitle>
      <AlertDescription>
        You have {carryoverDays} carryover {dayLabel} that {expiresLabel} on {formattedDate}
        {daysUntilExpiry > 0 ? (
          <> ({daysUntilExpiry} {daysUntilExpiry === 1 ? 'day' : 'days'} remaining)</>
        ) : (
          <> (today!)</>
        )}
        . Use {itLabel} or {willLabel} will be forfeited.
      </AlertDescription>
    </Alert>
  )
}
