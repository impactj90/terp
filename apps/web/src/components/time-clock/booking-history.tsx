'use client'

import { LogIn, LogOut, Coffee, Briefcase } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type Booking = components['schemas']['Booking']

interface BookingHistoryProps {
  bookings: Booking[]
  isLoading?: boolean
  className?: string
}

const bookingTypeIcons: Record<string, typeof LogIn> = {
  A1: LogIn,
  A2: LogOut,
  P1: Coffee,
  P2: Coffee,
  D1: Briefcase,
  D2: Briefcase,
}

const bookingTypeLabels: Record<string, string> = {
  A1: 'Clock In',
  A2: 'Clock Out',
  P1: 'Break Start',
  P2: 'Break End',
  D1: 'Errand Start',
  D2: 'Errand End',
}

export function BookingHistory({
  bookings,
  isLoading,
  className,
}: BookingHistoryProps) {
  if (isLoading) {
    return <BookingHistorySkeleton className={className} />
  }

  const sortedBookings = [...bookings].sort((a, b) => {
    const timeA = a.edited_time ?? 0
    const timeB = b.edited_time ?? 0
    return timeB - timeA // Most recent first
  })

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Today&apos;s Bookings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No bookings today
          </p>
        ) : (
          <div className="space-y-3">
            {sortedBookings.map((booking) => (
              <BookingItem key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface BookingItemProps {
  booking: Booking
}

function BookingItem({ booking }: BookingItemProps) {
  const code = booking.booking_type?.code ?? 'A1'
  const Icon = bookingTypeIcons[code] ?? LogIn
  const label = booking.booking_type?.name ?? bookingTypeLabels[code] ?? 'Booking'
  const isInbound = booking.booking_type?.direction === 'in'

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isInbound ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {booking.notes && (
            <p className="text-xs text-muted-foreground">{booking.notes}</p>
          )}
        </div>
      </div>
      <span className="text-sm font-mono tabular-nums text-muted-foreground">
        {booking.time_string}
      </span>
    </div>
  )
}

function BookingHistorySkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
