'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations('common')

  if (isLoading) {
    return <StatsCardSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-4 sm:p-6', className)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">
            {title}
          </span>
          <AlertCircle className="h-3.5 w-3.5 text-destructive sm:h-4 sm:w-4" aria-hidden="true" />
        </div>
        <div className="mt-1.5 sm:mt-2">
          <p className="text-xs text-destructive sm:text-sm">{t('failedToLoad')}</p>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {t('retry')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border bg-card p-4 sm:p-6', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">
          {title}
        </span>
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" aria-hidden="true" />
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5 sm:mt-2 sm:gap-2">
        <span className="text-xl font-bold sm:text-2xl">{value}</span>
        {trend && trendValue && (
          <span
            className={cn(
              'text-xs font-medium sm:text-sm',
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
        <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{description}</p>
      )}
    </div>
  )
}

/**
 * Skeleton loading state for StatsCard.
 */
export function StatsCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 sm:p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-16 sm:h-4 sm:w-24" />
        <Skeleton className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <div className="mt-1.5 sm:mt-2">
        <Skeleton className="h-6 w-14 sm:h-8 sm:w-20" />
      </div>
      <Skeleton className="mt-1.5 h-3 w-20 sm:mt-2 sm:w-32" />
    </div>
  )
}
