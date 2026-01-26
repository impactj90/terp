import { cn } from '@/lib/utils'
import { TimeDisplay } from './time-display'

interface DailySummaryProps {
  targetMinutes?: number | null
  grossMinutes?: number | null
  breakMinutes?: number | null
  netMinutes?: number | null
  balanceMinutes?: number | null
  layout?: 'horizontal' | 'vertical' | 'compact'
  className?: string
}

/**
 * Display daily time totals summary.
 */
export function DailySummary({
  targetMinutes,
  grossMinutes,
  breakMinutes,
  netMinutes,
  balanceMinutes,
  layout = 'horizontal',
  className,
}: DailySummaryProps) {
  const items = [
    { label: 'Target', value: targetMinutes, format: 'duration' as const },
    { label: 'Gross', value: grossMinutes, format: 'duration' as const },
    { label: 'Breaks', value: breakMinutes, format: 'duration' as const },
    { label: 'Net', value: netMinutes, format: 'duration' as const },
    { label: 'Balance', value: balanceMinutes, format: 'balance' as const },
  ]

  if (layout === 'compact') {
    return (
      <div className={cn('flex items-center gap-4 text-sm', className)}>
        <span className="text-muted-foreground">Net:</span>
        <TimeDisplay value={netMinutes} format="duration" className="font-medium" />
        <span className="text-muted-foreground">/</span>
        <TimeDisplay value={targetMinutes} format="duration" />
        <span className="text-muted-foreground">=</span>
        <TimeDisplay value={balanceMinutes} format="balance" className="font-medium" />
      </div>
    )
  }

  if (layout === 'vertical') {
    return (
      <div className={cn('space-y-2', className)}>
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <TimeDisplay value={item.value} format={item.format} />
          </div>
        ))}
      </div>
    )
  }

  // Horizontal layout (default)
  return (
    <div className={cn('flex items-center gap-6 text-sm', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-muted-foreground">{item.label}:</span>
          <TimeDisplay value={item.value} format={item.format} />
        </div>
      ))}
    </div>
  )
}
