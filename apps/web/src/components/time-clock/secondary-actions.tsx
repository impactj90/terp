'use client'

import { useTranslations } from 'next-intl'
import { Coffee, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClockStatus } from './clock-status-badge'

type SecondaryAction = 'start_break' | 'start_errand'

interface SecondaryActionsProps {
  status: ClockStatus
  onAction: (action: SecondaryAction) => void
  isLoading?: boolean
}

export function SecondaryActions({
  status,
  onAction,
  isLoading,
}: SecondaryActionsProps) {
  const t = useTranslations('timeClock')

  // Only show secondary actions when clocked in
  if (status !== 'clocked_in') {
    return null
  }

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAction('start_break')}
        disabled={isLoading}
      >
        <Coffee className="mr-2 h-4 w-4" />
        {t('startBreak')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAction('start_errand')}
        disabled={isLoading}
      >
        <Briefcase className="mr-2 h-4 w-4" />
        {t('startErrand')}
      </Button>
    </div>
  )
}
