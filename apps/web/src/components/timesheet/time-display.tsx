import { cn } from '@/lib/utils'
import { formatMinutes, formatBalance } from '@/lib/time-utils'

interface TimeDisplayProps {
  value: number | null | undefined
  format?: 'time' | 'duration' | 'balance'
  className?: string
}

/**
 * Display a time value in various formats.
 */
export function TimeDisplay({ value, format = 'time', className }: TimeDisplayProps) {
  let formatted: string

  if (value === null || value === undefined) {
    formatted = '--:--'
  } else {
    switch (format) {
      case 'time':
        // Time of day (e.g., 08:30)
        const hours = Math.floor(value / 60)
        const mins = value % 60
        formatted = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
        break
      case 'duration':
        formatted = formatMinutes(value)
        break
      case 'balance':
        formatted = formatBalance(value)
        break
    }
  }

  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        format === 'balance' && value !== null && value !== undefined && (
          value > 0 ? 'text-green-600 dark:text-green-400' :
          value < 0 ? 'text-red-600 dark:text-red-400' : ''
        ),
        className
      )}
    >
      {formatted}
    </span>
  )
}

interface BookingTimeTripleProps {
  original: number | null | undefined
  edited: number | null | undefined
  calculated: number | null | undefined
  showAll?: boolean
  className?: string
}

/**
 * Display original -> edited -> calculated time triple.
 * By default, shows simplified view unless times differ.
 */
export function BookingTimeTriple({
  original,
  edited,
  calculated,
  showAll = false,
  className,
}: BookingTimeTripleProps) {
  // Helper function to format time
  const formatTime = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '--:--'
    const hours = Math.floor(value / 60)
    const mins = value % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  // Check if times differ
  const isEdited = original !== edited
  const isCalculated = edited !== calculated

  // Simplified display when all same
  if (!showAll && !isEdited && !isCalculated) {
    return (
      <span className={cn('font-mono tabular-nums', className)}>
        {formatTime(calculated)}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', className)}>
      <span className={cn(
        'font-mono tabular-nums',
        isEdited ? 'line-through text-muted-foreground' : ''
      )}>
        {formatTime(original)}
      </span>
      {isEdited && (
        <>
          <span className="text-muted-foreground">→</span>
          <span className={cn(
            'font-mono tabular-nums',
            isCalculated ? 'text-muted-foreground' : 'font-medium'
          )}>
            {formatTime(edited)}
          </span>
        </>
      )}
      {isCalculated && (
        <>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono tabular-nums font-medium text-primary">
            {formatTime(calculated)}
          </span>
        </>
      )}
    </span>
  )
}
