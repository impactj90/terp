'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useDailyValues } from '@/hooks/api'
import { formatDate, formatRelativeDate } from '@/lib/time-utils'

interface PendingActionsProps {
  employeeId?: string
  className?: string
}

interface PendingItem {
  id: string
  date: string
  type: 'error' | 'warning'
  message: string
}

/**
 * Dashboard section showing pending items that need attention.
 */
export function PendingActions({ employeeId, className }: PendingActionsProps) {
  // Fetch recent daily values (last 14 days) to check for errors
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useDailyValues({
    employeeId,
    from: formatDate(twoWeeksAgo),
    to: formatDate(new Date()),
    enabled: !!employeeId,
  })

  const pendingItems = useMemo<PendingItem[]>(() => {
    if (!data?.data) return []

    const items: PendingItem[] = []

    for (const dv of data.data) {
      // Check for errors
      if (dv.has_errors && dv.errors && dv.errors.length > 0) {
        for (const err of dv.errors) {
          items.push({
            id: `${dv.id}-${err.error_type}`,
            date: dv.value_date,
            type: 'error',
            message: err.message || err.error_type || 'Unknown error',
          })
        }
      }
      // Check for pending status
      else if (dv.status === 'pending' || dv.status === 'error') {
        items.push({
          id: dv.id,
          date: dv.value_date,
          type: dv.status === 'error' ? 'error' : 'warning',
          message: dv.status === 'error' ? 'Calculation error' : 'Pending review',
        })
      }
    }

    // Sort by date descending
    return items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ).slice(0, 5) // Limit to 5 items
  }, [data])

  if (isLoading || !employeeId) {
    return <PendingActionsSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border', className)}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Pending Actions</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">Failed to load pending actions</p>
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
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">Pending Actions</h2>
      </div>

      {pendingItems.length === 0 ? (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-500" />
            </div>
            <p className="mt-3 text-sm font-medium">All caught up!</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No pending items require your attention
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y">
          {pendingItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 px-6 py-3 hover:bg-muted/50 transition-colors"
            >
              {item.type === 'error' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.message}</p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeDate(item.date)}
                </p>
              </div>
              <Link
                href={`/timesheet?date=${item.date}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {pendingItems.length > 0 && (
        <div className="border-t px-6 py-3">
          <Link
            href="/corrections"
            className="text-sm text-primary hover:underline"
          >
            View all corrections
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Skeleton loading state for PendingActions.
 */
export function PendingActionsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="divide-y">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 px-6 py-3">
            <Skeleton className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
