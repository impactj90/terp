'use client'

import { useTranslations } from 'next-intl'
import { LogIn, LogOut, Coffee, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ClockStatus } from './clock-status-badge'

export type BookingAction =
  | 'clock_in'
  | 'clock_out'
  | 'start_break'
  | 'end_break'
  | 'start_errand'
  | 'end_errand'

interface ClockButtonProps {
  status: ClockStatus
  onAction: (action: BookingAction) => void
  isLoading?: boolean
  disabled?: boolean
  className?: string
}

const actionConfig: Record<
  ClockStatus,
  {
    action: BookingAction
    labelKey: string
    icon: typeof LogIn
    variant: 'default' | 'destructive'
  }
> = {
  clocked_out: {
    action: 'clock_in',
    labelKey: 'clockIn',
    icon: LogIn,
    variant: 'default',
  },
  clocked_in: {
    action: 'clock_out',
    labelKey: 'clockOut',
    icon: LogOut,
    variant: 'destructive',
  },
  on_break: {
    action: 'end_break',
    labelKey: 'endBreak',
    icon: Coffee,
    variant: 'default',
  },
  on_errand: {
    action: 'end_errand',
    labelKey: 'endErrand',
    icon: Briefcase,
    variant: 'default',
  },
}

export function ClockButton({
  status,
  onAction,
  isLoading,
  disabled,
  className,
}: ClockButtonProps) {
  const t = useTranslations('timeClock')
  const tc = useTranslations('common')
  const config = actionConfig[status]
  const Icon = config.icon
  const label = t(config.labelKey as Parameters<typeof t>[0])

  return (
    <Button
      size="lg"
      variant={config.variant}
      onClick={() => onAction(config.action)}
      disabled={disabled || isLoading}
      aria-label={`${label}. ${t('currentStatus', { status: status.replace(/_/g, ' ') })}`}
      aria-busy={isLoading}
      className={cn(
        'h-32 w-32 rounded-full text-lg font-semibold shadow-lg',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
        'focus:ring-4 focus:ring-ring focus:ring-offset-2',
        config.variant === 'default' && 'bg-success hover:bg-success/90',
        className
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <Icon className="h-8 w-8" />
        <span>{isLoading ? tc('loading') : label}</span>
      </div>
    </Button>
  )
}
