'use client'

import { TrendingUp, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useMonthlyValues } from '@/hooks/api'
import { formatBalance, formatMinutes } from '@/lib/time-utils'

interface FlextimeBalanceCardProps {
  employeeId?: string
  className?: string
}

/**
 * Dashboard card showing current flextime (overtime) balance from monthly values.
 */
export function FlextimeBalanceCard({
  employeeId,
  className,
}: FlextimeBalanceCardProps) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useMonthlyValues({
    employeeId,
    year: currentYear,
    month: currentMonth,
    enabled: !!employeeId,
  })

  if (isLoading || !employeeId) {
    return <FlextimeBalanceCardSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Flextime Balance
          </span>
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        </div>
        <div className="mt-2">
          <p className="text-sm text-destructive">Failed to load</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      </div>
    )
  }

  // Get the first (and should be only) monthly value for current month
  const monthlyValue = data?.data?.[0]

  if (!monthlyValue) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Flextime Balance
          </span>
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold">--</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          No data for this month
        </p>
      </div>
    )
  }

  // Balance is the overtime/undertime for the month
  const balanceMinutes = monthlyValue.balance_minutes ?? 0
  const isPositive = balanceMinutes >= 0

  // Calculate target vs actual for context
  const targetMinutes = monthlyValue.target_minutes ?? 0
  const netMinutes = monthlyValue.net_minutes ?? 0

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Flextime Balance
        </span>
        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-2">
        <span
          className={cn(
            'text-2xl font-bold',
            isPositive
              ? 'text-green-600 dark:text-green-500'
              : 'text-red-600 dark:text-red-500'
          )}
        >
          {formatBalance(balanceMinutes)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatMinutes(netMinutes)} of {formatMinutes(targetMinutes)} target
      </p>

      {/* Balance indicator bar */}
      <div className="mt-3">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
          {/* Balance indicator */}
          {balanceMinutes !== 0 && (
            <div
              className={cn(
                'absolute top-0 h-full transition-all',
                isPositive
                  ? 'left-1/2 bg-green-500'
                  : 'right-1/2 bg-red-500'
              )}
              style={{
                width: `${Math.min(50, Math.abs(balanceMinutes) / 12)}%`,
              }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>Under</span>
          <span>Over</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton loading state for FlextimeBalanceCard.
 */
export function FlextimeBalanceCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="mt-2">
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="mt-2 h-3 w-32" />
      <div className="mt-3">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="mt-1 flex justify-between">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
    </div>
  )
}
