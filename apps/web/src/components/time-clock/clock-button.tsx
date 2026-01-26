'use client'

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
    label: string
    icon: typeof LogIn
    variant: 'default' | 'destructive'
  }
> = {
  clocked_out: {
    action: 'clock_in',
    label: 'Clock In',
    icon: LogIn,
    variant: 'default',
  },
  clocked_in: {
    action: 'clock_out',
    label: 'Clock Out',
    icon: LogOut,
    variant: 'destructive',
  },
  on_break: {
    action: 'end_break',
    label: 'End Break',
    icon: Coffee,
    variant: 'default',
  },
  on_errand: {
    action: 'end_errand',
    label: 'End Errand',
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
  const config = actionConfig[status]
  const Icon = config.icon

  return (
    <Button
      size="lg"
      variant={config.variant}
      onClick={() => onAction(config.action)}
      disabled={disabled || isLoading}
      aria-label={`${config.label}. Current status: ${status.replace(/_/g, ' ')}`}
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
        <span>{isLoading ? 'Loading...' : config.label}</span>
      </div>
    </Button>
  )
}
