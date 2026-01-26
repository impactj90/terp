'use client'

import { Palmtree, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useEmployeeVacationBalance } from '@/hooks/api'

interface VacationBalanceCardProps {
  employeeId?: string
  className?: string
}

/**
 * Dashboard card showing vacation balance with visual progress.
 */
export function VacationBalanceCard({
  employeeId,
  className,
}: VacationBalanceCardProps) {
  const currentYear = new Date().getFullYear()

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useEmployeeVacationBalance(employeeId ?? '', currentYear, !!employeeId)

  if (isLoading || !employeeId) {
    return <VacationBalanceCardSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Vacation Days
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

  // Handle case where no vacation balance exists
  if (!data) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Vacation Days
          </span>
          <Palmtree className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold">--</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          No vacation data available
        </p>
      </div>
    )
  }

  const totalEntitlement = data.total_entitlement ?? 0
  const remainingDays = data.remaining_days ?? 0
  const usedDays = data.used_days ?? 0
  const plannedDays = data.planned_days ?? 0

  // Calculate progress
  const usedPercent = totalEntitlement > 0
    ? (usedDays / totalEntitlement) * 100
    : 0
  const plannedPercent = totalEntitlement > 0
    ? (plannedDays / totalEntitlement) * 100
    : 0

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Vacation Days
        </span>
        <Palmtree className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{remainingDays}</span>
        <span className="text-sm text-muted-foreground">
          / {totalEntitlement}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {remainingDays === 1 ? 'day' : 'days'} remaining
      </p>

      {/* Stacked progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            {/* Used portion (green) */}
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${usedPercent}%` }}
            />
            {/* Planned/pending portion (yellow) */}
            <div
              className="h-full bg-yellow-500 transition-all"
              style={{ width: `${plannedPercent}%` }}
            />
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{usedDays} used</span>
          {plannedDays > 0 && (
            <span>{plannedDays} planned</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton loading state for VacationBalanceCard.
 */
export function VacationBalanceCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-4 w-8" />
      </div>
      <Skeleton className="mt-2 h-3 w-24" />
      <div className="mt-3">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="mt-1 flex justify-between">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}
