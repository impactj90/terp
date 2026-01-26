'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export interface StatsCardProps {
  title: string
  value: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
  className?: string
}

/**
 * Reusable stats card component for the dashboard.
 * Displays a metric with title, value, description, and optional trend indicator.
 * Supports loading and error states.
 */
export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendValue,
  isLoading = false,
  error = null,
  onRetry,
  className,
}: StatsCardProps) {
  if (isLoading) {
    return <StatsCardSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        </div>
        <div className="mt-2">
          <p className="text-sm text-destructive">Failed to load</p>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {title}
        </span>
        {Icon && (
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {trend && trendValue && (
          <span
            className={cn(
              'text-sm font-medium',
              trend === 'up' && 'text-green-600 dark:text-green-500',
              trend === 'down' && 'text-red-600 dark:text-red-500',
              trend === 'neutral' && 'text-muted-foreground'
            )}
          >
            {trendValue}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

/**
 * Skeleton loading state for StatsCard.
 */
export function StatsCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="mt-2">
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  )
}
