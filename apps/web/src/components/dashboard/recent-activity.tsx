'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import {
  LogIn,
  LogOut,
  Coffee,
  Briefcase,
  AlertCircle,
  RefreshCw,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useBookings } from '@/hooks/api'
import { formatDate, formatRelativeDate, formatTime } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

interface RecentActivityProps {
  employeeId?: string
  limit?: number
  className?: string
}

type Booking = components['schemas']['Booking']

/**
 * Dashboard section showing recent booking activity.
 */
export function RecentActivity({
  employeeId,
  limit = 5,
  className,
}: RecentActivityProps) {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')

  // Fetch recent bookings (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useBookings({
    employeeId,
    from: formatDate(weekAgo),
    to: formatDate(new Date()),
    limit: limit * 2, // Fetch more to ensure we have enough after filtering
    enabled: !!employeeId,
  })

  // Get recent bookings, sorted by date and time descending
  const recentBookings = (data?.data ?? [])
    .slice()
    .sort((a, b) => {
      // Sort by date first, then by time
      const dateCompare = b.booking_date.localeCompare(a.booking_date)
      if (dateCompare !== 0) return dateCompare
      return b.edited_time - a.edited_time
    })
    .slice(0, limit)

  if (isLoading || !employeeId) {
    return <RecentActivitySkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border', className)}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t('recentActivity')}</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{t('failedToLoadActivity')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {tc('retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{t('recentActivity')}</h2>
      </div>

      {recentBookings.length === 0 ? (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-muted p-3">
              <Activity className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">{t('noRecentActivity')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('bookingsWillAppear')}
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y">
          {recentBookings.map((booking) => (
            <ActivityItem key={booking.id} booking={booking} />
          ))}
        </div>
      )}

      {recentBookings.length > 0 && (
        <div className="border-t px-6 py-3">
          <Link
            href="/timesheet"
            className="text-sm text-primary hover:underline"
          >
            {t('viewAllActivity')}
          </Link>
        </div>
      )}
    </div>
  )
}

function ActivityItem({ booking }: { booking: Booking }) {
  const t = useTranslations('dashboard')
  const direction = booking.booking_type?.direction
  const bookingTypeName = booking.booking_type?.name ?? ''

  // Determine icon and description based on booking type
  const getIcon = () => {
    const name = bookingTypeName.toLowerCase()
    if (name.includes('break') || name.includes('pause')) {
      return <Coffee className="h-4 w-4 text-amber-500" />
    }
    if (name.includes('errand') || name.includes('dienst')) {
      return <Briefcase className="h-4 w-4 text-purple-500" />
    }
    // Default work category
    if (direction === 'in') {
      return <LogIn className="h-4 w-4 text-green-500" />
    }
    return <LogOut className="h-4 w-4 text-blue-500" />
  }

  const getDescription = () => {
    const name = bookingTypeName.toLowerCase()
    if (name.includes('break') || name.includes('pause')) {
      return direction === 'in' ? t('breakStarted') : t('breakEnded')
    }
    if (name.includes('errand') || name.includes('dienst')) {
      return direction === 'in' ? t('errandStarted') : t('errandEnded')
    }
    return direction === 'in' ? t('clockedInActivity') : t('clockedOutActivity')
  }

  const dateStr = formatRelativeDate(booking.booking_date)
  // Use time_string if available, otherwise convert edited_time from minutes
  const timeStr = booking.time_string ?? formatTime(booking.edited_time)
  const wasEdited = booking.edited_time !== booking.original_time

  return (
    <div className="flex items-start gap-3 px-6 py-3">
      <div className="mt-0.5 rounded-full bg-muted p-1.5">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{getDescription()}</p>
          {wasEdited && (
            <span className="text-xs text-muted-foreground">{t('edited')}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {dateStr}, {timeStr}
        </p>
      </div>
    </div>
  )
}

/**
 * Skeleton loading state for RecentActivity.
 */
export function RecentActivitySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="divide-y">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 px-6 py-3">
            <Skeleton className="mt-0.5 h-7 w-7 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1 h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
