# NOK-220: Clock In/Out Feature Implementation Plan

## Overview

Implement a one-click clock in/out feature with status indicator for the Next.js frontend. The feature provides a dedicated time tracking page with a large, prominent clock button, real-time status display, running timer, and today's booking history.

## Current State Analysis

### What Exists
- **API Endpoints**: Full booking CRUD (`/bookings`), day view (`/employees/{id}/day/{date}`), booking types (`/booking-types`)
- **Frontend Hooks**: `useBookings`, `useCreateBooking`, `useUpdateBooking`, `useDeleteBooking`
- **UI Components**: Button (with variants), Badge, Card, Alert, Skeleton, DropdownMenu
- **Navigation**: Time Clock route already configured in sidebar (`/time-clock`) but no page exists
- **Design Tokens**: Colors for success (green), error (red), primary (blue)

### What's Missing
1. `useBookingTypes()` hook - needed to fetch A1/A2/P1/P2/D1/D2 types
2. `useEmployeeDayView()` hook - needed for day view with bookings and daily values
3. Time utility functions - formatting, current time, elapsed timer
4. Time Clock page and components
5. Employee context - User schema doesn't include `employee_id`

### Key Discoveries
- Time is stored as minutes from midnight (integer) in backend
- `time_string` field provides HH:MM format (read-only, computed by backend)
- Booking types have `direction: 'in' | 'out'` to determine clock in vs clock out
- System booking types: A1 (Clock In), A2 (Clock Out), P1 (Break Start), P2 (Break End), D1 (Errand Start), D2 (Errand End)

## Desired End State

A fully functional Time Clock page at `/time-clock` with:
1. Large clock in/out button that changes color based on current state (green = clocked out/ready to clock in, red = clocked in/ready to clock out)
2. Status badge showing current state (Clocked In, On Break, Not Clocked In)
3. Running timer showing elapsed time since clock in
4. Booking type selector for non-standard bookings (breaks, errands)
5. Today's booking history list
6. Summary stats card (total hours, break time, net time)
7. Error handling for locked months, network errors

### Verification of End State
- Navigate to `/time-clock` and see the page load
- Click clock in button, verify booking is created via API
- See running timer increment
- Click clock out, verify booking is created
- View booking history shows today's entries
- Handle error states gracefully (month closed, network error)

## What We're NOT Doing

- Multi-day time tracking view (separate feature)
- Admin booking on behalf of others (separate feature)
- Terminal/hardware integration
- Offline support
- Push notifications
- Historical booking editing from this page

## Implementation Approach

We'll build incrementally:
1. First create the foundational hooks and utilities
2. Then build reusable components (ClockButton, StatusBadge, Timer)
3. Compose them into the page
4. Add polish (loading states, error handling, animations)

## Phase 1: Time Utilities and API Hooks

### Overview
Create time formatting utilities and missing API hooks needed by the clock feature.

### Changes Required:

#### 1. Time Utilities
**File**: `/home/tolga/projects/terp/apps/web/src/lib/time.ts`
**Changes**: Create new file with time formatting functions

```typescript
/**
 * Time utility functions for the time tracking UI.
 */

/**
 * Get current time as HH:MM string.
 */
export function getCurrentTimeString(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

/**
 * Get current date as YYYY-MM-DD string.
 */
export function getCurrentDateString(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

/**
 * Convert minutes from midnight to HH:MM string.
 */
export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Convert HH:MM string to minutes from midnight.
 */
export function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Format elapsed milliseconds as H:MM:SS.
 */
export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Format minutes as H:MM for display.
 */
export function formatMinutesDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.abs(minutes) % 60
  const sign = minutes < 0 ? '-' : ''
  return `${sign}${h}:${m.toString().padStart(2, '0')}`
}

/**
 * Parse ISO date string to Date object (date part only).
 */
export function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}
```

#### 2. Booking Types Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-booking-types.ts`
**Changes**: Create new file

```typescript
import { useApiQuery } from '@/hooks'

interface UseBookingTypesOptions {
  active?: boolean
  direction?: 'in' | 'out'
  enabled?: boolean
}

/**
 * Hook to fetch booking types.
 *
 * @example
 * ```tsx
 * const { data } = useBookingTypes({ active: true })
 * ```
 */
export function useBookingTypes(options: UseBookingTypesOptions = {}) {
  const { active, direction, enabled = true } = options

  return useApiQuery('/booking-types', {
    params: {
      active,
      direction,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single booking type by ID.
 */
export function useBookingType(id: string, enabled = true) {
  return useApiQuery('/booking-types/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

#### 3. Employee Day View Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employee-day.ts`
**Changes**: Create new file

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

/**
 * Hook to fetch an employee's day view (bookings, daily value, day plan).
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeDayView(employeeId, '2026-01-25')
 * ```
 */
export function useEmployeeDayView(
  employeeId: string,
  date: string,
  enabled = true
) {
  return useApiQuery('/employees/{id}/day/{date}', {
    path: { id: employeeId, date },
    enabled: enabled && !!employeeId && !!date,
    // Refetch more frequently for real-time feel
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Hook to trigger day calculation.
 *
 * @example
 * ```tsx
 * const calculate = useCalculateDay()
 * calculate.mutate({ path: { id: employeeId, date: '2026-01-25' } })
 * ```
 */
export function useCalculateDay() {
  return useApiMutation('/employees/{id}/day/{date}/calculate', 'post', {
    invalidateKeys: [['/employees'], ['/bookings'], ['/daily-values']],
  })
}
```

#### 4. Export Hooks
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
**Changes**: Create or update to export all API hooks

```typescript
// Booking hooks
export {
  useBookings,
  useBooking,
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
} from './use-bookings'

// Booking type hooks
export { useBookingTypes, useBookingType } from './use-booking-types'

// Employee hooks
export {
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
} from './use-employees'

// Employee day hooks
export { useEmployeeDayView, useCalculateDay } from './use-employee-day'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`
- [ ] Build succeeds: `cd apps/web && npm run build`

#### Manual Verification:
- [ ] Import hooks in a test file and verify types are correct
- [ ] Verify time utilities work with sample inputs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Clock Status Components

### Overview
Create the core components for displaying clock status and the main clock button.

### Changes Required:

#### 1. Clock Status Badge
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/clock-status-badge.tsx`
**Changes**: Create new component

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ClockStatus = 'clocked_in' | 'clocked_out' | 'on_break' | 'on_errand'

interface ClockStatusBadgeProps {
  status: ClockStatus
  className?: string
}

const statusConfig: Record<ClockStatus, { label: string; className: string }> = {
  clocked_in: {
    label: 'Clocked In',
    className: 'bg-success text-success-foreground',
  },
  clocked_out: {
    label: 'Not Clocked In',
    className: 'bg-muted text-muted-foreground',
  },
  on_break: {
    label: 'On Break',
    className: 'bg-warning text-warning-foreground',
  },
  on_errand: {
    label: 'On Errand',
    className: 'bg-info text-info-foreground',
  },
}

export function ClockStatusBadge({ status, className }: ClockStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge className={cn('text-sm px-3 py-1', config.className, className)}>
      {config.label}
    </Badge>
  )
}
```

#### 2. Running Timer Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/running-timer.tsx`
**Changes**: Create new component

```typescript
'use client'

import { useState, useEffect } from 'react'
import { formatElapsedTime } from '@/lib/time'
import { cn } from '@/lib/utils'

interface RunningTimerProps {
  /** Start time as Date or ISO string */
  startTime: Date | string | null
  /** Whether the timer is active */
  isRunning: boolean
  /** Optional className */
  className?: string
}

export function RunningTimer({
  startTime,
  isRunning,
  className,
}: RunningTimerProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning || !startTime) {
      setElapsed(0)
      return
    }

    const start =
      typeof startTime === 'string' ? new Date(startTime) : startTime

    // Calculate initial elapsed
    setElapsed(Date.now() - start.getTime())

    // Update every second
    const interval = setInterval(() => {
      setElapsed(Date.now() - start.getTime())
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime, isRunning])

  if (!isRunning || !startTime) {
    return (
      <div className={cn('text-4xl font-mono text-muted-foreground', className)}>
        0:00:00
      </div>
    )
  }

  return (
    <div className={cn('text-4xl font-mono tabular-nums', className)}>
      {formatElapsedTime(elapsed)}
    </div>
  )
}
```

#### 3. Main Clock Button
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/clock-button.tsx`
**Changes**: Create new component

```typescript
'use client'

import { LogIn, LogOut, Coffee, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ClockStatus } from './clock-status-badge'

type BookingAction = 'clock_in' | 'clock_out' | 'start_break' | 'end_break' | 'start_errand' | 'end_errand'

interface ClockButtonProps {
  status: ClockStatus
  onAction: (action: BookingAction) => void
  isLoading?: boolean
  disabled?: boolean
  className?: string
}

const actionConfig: Record<
  ClockStatus,
  { action: BookingAction; label: string; icon: typeof LogIn; variant: 'default' | 'destructive' }
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
      className={cn(
        'h-32 w-32 rounded-full text-lg font-semibold shadow-lg',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
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
```

#### 4. Secondary Action Buttons
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/secondary-actions.tsx`
**Changes**: Create new component

```typescript
'use client'

import { Coffee, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClockStatus } from './clock-status-badge'

type SecondaryAction = 'start_break' | 'start_errand'

interface SecondaryActionsProps {
  status: ClockStatus
  onAction: (action: SecondaryAction) => void
  isLoading?: boolean
}

export function SecondaryActions({
  status,
  onAction,
  isLoading,
}: SecondaryActionsProps) {
  // Only show secondary actions when clocked in
  if (status !== 'clocked_in') {
    return null
  }

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAction('start_break')}
        disabled={isLoading}
      >
        <Coffee className="mr-2 h-4 w-4" />
        Start Break
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAction('start_errand')}
        disabled={isLoading}
      >
        <Briefcase className="mr-2 h-4 w-4" />
        Start Errand
      </Button>
    </div>
  )
}
```

#### 5. Component Index Export
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/index.ts`
**Changes**: Create barrel export

```typescript
export { ClockStatusBadge, type ClockStatus } from './clock-status-badge'
export { RunningTimer } from './running-timer'
export { ClockButton } from './clock-button'
export { SecondaryActions } from './secondary-actions'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`
- [ ] Build succeeds: `cd apps/web && npm run build`

#### Manual Verification:
- [ ] Components render correctly in isolation (can test via Storybook or page)
- [ ] ClockButton changes color based on status prop
- [ ] RunningTimer increments when running

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Booking History and Stats Components

### Overview
Create components for displaying today's booking history and summary statistics.

### Changes Required:

#### 1. Today's Stats Card
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/today-stats.tsx`
**Changes**: Create new component

```typescript
'use client'

import { Clock, Coffee, Target, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMinutesDisplay } from '@/lib/time'
import { cn } from '@/lib/utils'

interface TodayStatsProps {
  grossMinutes: number
  breakMinutes: number
  netMinutes: number
  targetMinutes: number
  overtimeMinutes: number
  undertimeMinutes: number
  isLoading?: boolean
  className?: string
}

export function TodayStats({
  grossMinutes,
  breakMinutes,
  netMinutes,
  targetMinutes,
  overtimeMinutes,
  undertimeMinutes,
  isLoading,
  className,
}: TodayStatsProps) {
  if (isLoading) {
    return <TodayStatsSkeleton className={className} />
  }

  const balance = overtimeMinutes - undertimeMinutes
  const balanceIsPositive = balance >= 0

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Today&apos;s Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <StatItem
            icon={Clock}
            label="Gross Time"
            value={formatMinutesDisplay(grossMinutes)}
          />
          <StatItem
            icon={Coffee}
            label="Break Time"
            value={formatMinutesDisplay(breakMinutes)}
          />
          <StatItem
            icon={Target}
            label="Target"
            value={formatMinutesDisplay(targetMinutes)}
          />
          <StatItem
            icon={TrendingUp}
            label="Balance"
            value={`${balanceIsPositive ? '+' : ''}${formatMinutesDisplay(balance)}`}
            valueClassName={balanceIsPositive ? 'text-success' : 'text-destructive'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

interface StatItemProps {
  icon: typeof Clock
  label: string
  value: string
  valueClassName?: string
}

function StatItem({ icon: Icon, label, value, valueClassName }: StatItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-semibold tabular-nums', valueClassName)}>
          {value}
        </p>
      </div>
    </div>
  )
}

function TodayStatsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

#### 2. Booking History List
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/booking-history.tsx`
**Changes**: Create new component

```typescript
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
```

#### 3. Current Time Display
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/current-time.tsx`
**Changes**: Create new component

```typescript
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface CurrentTimeProps {
  className?: string
}

export function CurrentTime({ className }: CurrentTimeProps) {
  const [time, setTime] = useState<Date | null>(null)

  useEffect(() => {
    // Set initial time on client
    setTime(new Date())

    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  if (!time) {
    return (
      <div className={cn('text-lg text-muted-foreground', className)}>
        --:--
      </div>
    )
  }

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className={cn('text-center', className)}>
      <div className="text-5xl font-light tabular-nums">{timeStr}</div>
      <div className="mt-1 text-sm text-muted-foreground">{dateStr}</div>
    </div>
  )
}
```

#### 4. Update Component Index
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/index.ts`
**Changes**: Add new exports

```typescript
export { ClockStatusBadge, type ClockStatus } from './clock-status-badge'
export { RunningTimer } from './running-timer'
export { ClockButton } from './clock-button'
export { SecondaryActions } from './secondary-actions'
export { TodayStats } from './today-stats'
export { BookingHistory } from './booking-history'
export { CurrentTime } from './current-time'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`
- [ ] Build succeeds: `cd apps/web && npm run build`

#### Manual Verification:
- [ ] TodayStats displays correctly with sample data
- [ ] BookingHistory renders bookings with correct icons
- [ ] CurrentTime updates every second

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Time Clock Page and State Management

### Overview
Create the main Time Clock page that composes all components and manages state.

### Changes Required:

#### 1. Clock State Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-clock-state.ts`
**Changes**: Create new hook for managing clock state logic

```typescript
'use client'

import { useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateBooking } from '@/hooks/api/use-bookings'
import { useBookingTypes } from '@/hooks/api/use-booking-types'
import { useEmployeeDayView } from '@/hooks/api/use-employee-day'
import { getCurrentDateString, getCurrentTimeString, timeStringToMinutes } from '@/lib/time'
import type { ClockStatus } from '@/components/time-clock/clock-status-badge'
import type { components } from '@/lib/api/types'

type Booking = components['schemas']['Booking']
type BookingType = components['schemas']['BookingType']

// Booking type codes
const CLOCK_IN = 'A1'
const CLOCK_OUT = 'A2'
const BREAK_START = 'P1'
const BREAK_END = 'P2'
const ERRAND_START = 'D1'
const ERRAND_END = 'D2'

interface UseClockStateOptions {
  employeeId: string
  enabled?: boolean
}

export function useClockState({ employeeId, enabled = true }: UseClockStateOptions) {
  const queryClient = useQueryClient()
  const today = getCurrentDateString()

  // Fetch today's data
  const dayView = useEmployeeDayView(employeeId, today, enabled && !!employeeId)

  // Fetch booking types
  const bookingTypes = useBookingTypes({ active: true, enabled })

  // Create booking mutation
  const createBooking = useCreateBooking()

  // Build booking type lookup
  const bookingTypeMap = useMemo(() => {
    const map = new Map<string, BookingType>()
    if (bookingTypes.data?.data) {
      for (const bt of bookingTypes.data.data) {
        if (bt.code) {
          map.set(bt.code, bt)
        }
      }
    }
    return map
  }, [bookingTypes.data])

  // Determine current status from bookings
  const { status, clockInTime, lastBooking } = useMemo(() => {
    const bookings = dayView.data?.bookings ?? []

    if (bookings.length === 0) {
      return { status: 'clocked_out' as ClockStatus, clockInTime: null, lastBooking: null }
    }

    // Sort by time (ascending)
    const sorted = [...bookings].sort((a, b) => {
      const timeA = a.edited_time ?? 0
      const timeB = b.edited_time ?? 0
      return timeA - timeB
    })

    const lastBooking = sorted[sorted.length - 1]
    const lastCode = lastBooking?.booking_type?.code

    // Determine status based on last booking
    let status: ClockStatus = 'clocked_out'
    let clockInTime: Date | null = null

    if (lastCode === CLOCK_IN || lastCode === BREAK_END || lastCode === ERRAND_END) {
      status = 'clocked_in'
      // Find the last clock in time for the timer
      const clockIn = sorted.find(b => b.booking_type?.code === CLOCK_IN)
      if (clockIn && clockIn.edited_time !== undefined) {
        const todayDate = new Date()
        todayDate.setHours(0, 0, 0, 0)
        clockInTime = new Date(todayDate.getTime() + clockIn.edited_time * 60000)
      }
    } else if (lastCode === BREAK_START) {
      status = 'on_break'
    } else if (lastCode === ERRAND_START) {
      status = 'on_errand'
    } else if (lastCode === CLOCK_OUT) {
      status = 'clocked_out'
    }

    return { status, clockInTime, lastBooking }
  }, [dayView.data?.bookings])

  // Action handler
  const handleAction = useCallback(
    async (action: string) => {
      const codeMap: Record<string, string> = {
        clock_in: CLOCK_IN,
        clock_out: CLOCK_OUT,
        start_break: BREAK_START,
        end_break: BREAK_END,
        start_errand: ERRAND_START,
        end_errand: ERRAND_END,
      }

      const code = codeMap[action]
      const bookingType = bookingTypeMap.get(code)

      if (!bookingType?.id) {
        throw new Error(`Booking type ${code} not found`)
      }

      await createBooking.mutateAsync({
        body: {
          employee_id: employeeId,
          booking_date: today,
          booking_type_id: bookingType.id,
          time: getCurrentTimeString(),
        },
      })

      // Invalidate day view to refresh
      queryClient.invalidateQueries({ queryKey: ['/employees/{id}/day/{date}'] })
    },
    [employeeId, today, bookingTypeMap, createBooking, queryClient]
  )

  return {
    // State
    status,
    clockInTime,
    lastBooking,
    bookings: dayView.data?.bookings ?? [],
    dailyValue: dayView.data?.daily_value,
    dayPlan: dayView.data?.day_plan,
    isHoliday: dayView.data?.is_holiday ?? false,

    // Loading states
    isLoading: dayView.isLoading || bookingTypes.isLoading,
    isActionLoading: createBooking.isPending,

    // Error
    error: dayView.error || bookingTypes.error || createBooking.error,

    // Actions
    handleAction,

    // Refetch
    refetch: dayView.refetch,
  }
}
```

#### 2. Time Clock Page
**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/time-clock/page.tsx`
**Changes**: Create the main page

```typescript
'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useEmployees } from '@/hooks/api/use-employees'
import { useClockState } from '@/hooks/use-clock-state'
import {
  ClockStatusBadge,
  RunningTimer,
  ClockButton,
  SecondaryActions,
  TodayStats,
  BookingHistory,
  CurrentTime,
} from '@/components/time-clock'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

export default function TimeClockPage() {
  const { user } = useAuth()

  // For now, fetch employees and use the first one
  // TODO: Add employee_id to User schema or create employee selector
  const employees = useEmployees({ limit: 10, active: true })
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)

  // Set default employee when data loads
  useEffect(() => {
    if (!selectedEmployeeId && employees.data?.data && employees.data.data.length > 0) {
      setSelectedEmployeeId(employees.data.data[0].id ?? null)
    }
  }, [employees.data, selectedEmployeeId])

  const clockState = useClockState({
    employeeId: selectedEmployeeId ?? '',
    enabled: !!selectedEmployeeId,
  })

  // Loading state
  if (employees.isLoading || !selectedEmployeeId) {
    return <TimeClockSkeleton />
  }

  // Error state
  if (clockState.error) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load time clock data. Please try again.
          </AlertDescription>
        </Alert>
        <Button onClick={() => clockState.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  const dailyValue = clockState.dailyValue ?? {
    gross_minutes: 0,
    break_minutes: 0,
    net_minutes: 0,
    target_minutes: 0,
    overtime_minutes: 0,
    undertime_minutes: 0,
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Employee Selector (temporary until user-employee link exists) */}
      {employees.data?.data && employees.data.data.length > 1 && (
        <EmployeeSelector
          employees={employees.data.data}
          selectedId={selectedEmployeeId}
          onSelect={setSelectedEmployeeId}
        />
      )}

      {/* Main Clock Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-6">
            {/* Current Time Display */}
            <CurrentTime />

            {/* Status Badge */}
            <ClockStatusBadge status={clockState.status} />

            {/* Running Timer */}
            <RunningTimer
              startTime={clockState.clockInTime}
              isRunning={clockState.status === 'clocked_in'}
            />

            {/* Main Clock Button */}
            <ClockButton
              status={clockState.status}
              onAction={clockState.handleAction}
              isLoading={clockState.isActionLoading}
              disabled={clockState.isLoading}
            />

            {/* Secondary Actions */}
            <SecondaryActions
              status={clockState.status}
              onAction={clockState.handleAction}
              isLoading={clockState.isActionLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats and History Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <TodayStats
          grossMinutes={dailyValue.gross_minutes ?? 0}
          breakMinutes={dailyValue.break_minutes ?? 0}
          netMinutes={dailyValue.net_minutes ?? 0}
          targetMinutes={dailyValue.target_minutes ?? 0}
          overtimeMinutes={dailyValue.overtime_minutes ?? 0}
          undertimeMinutes={dailyValue.undertime_minutes ?? 0}
          isLoading={clockState.isLoading}
        />

        <BookingHistory
          bookings={clockState.bookings}
          isLoading={clockState.isLoading}
        />
      </div>
    </div>
  )
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Time Clock</h1>
      <p className="text-muted-foreground">
        Clock in and out, track your work hours
      </p>
    </div>
  )
}

interface EmployeeSelectorProps {
  employees: Array<{ id?: string; first_name?: string; last_name?: string }>
  selectedId: string
  onSelect: (id: string) => void
}

function EmployeeSelector({ employees, selectedId, onSelect }: EmployeeSelectorProps) {
  const selected = employees.find(e => e.id === selectedId)
  const selectedName = selected
    ? `${selected.first_name} ${selected.last_name}`
    : 'Select Employee'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {selectedName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-full">
        {employees.map((emp) => (
          <DropdownMenuItem
            key={emp.id}
            onClick={() => emp.id && onSelect(emp.id)}
          >
            {emp.first_name} {emp.last_name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TimeClockSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-6">
            <Skeleton className="h-16 w-32" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-12 w-28" />
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`
- [ ] Build succeeds: `cd apps/web && npm run build`

#### Manual Verification:
- [ ] Navigate to `/time-clock` - page loads without errors
- [ ] Current time and date display correctly
- [ ] Status badge shows "Not Clocked In" initially
- [ ] Click Clock In - booking is created, status changes to "Clocked In"
- [ ] Running timer starts incrementing
- [ ] Secondary actions (Break, Errand) appear
- [ ] Click Clock Out - booking is created, status returns to "Not Clocked In"
- [ ] Booking history shows today's entries
- [ ] Stats card updates with calculated values

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Error Handling and Polish

### Overview
Add comprehensive error handling, loading states, and accessibility improvements.

### Changes Required:

#### 1. Error Alert Component for Time Clock
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/clock-error-alert.tsx`
**Changes**: Create error display component

```typescript
'use client'

import { AlertCircle, Lock, Wifi } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ClockErrorAlertProps {
  error: Error | unknown
  onRetry?: () => void
}

export function ClockErrorAlert({ error, onRetry }: ClockErrorAlertProps) {
  const { icon: Icon, title, message } = getErrorDetails(error)

  return (
    <Alert variant="destructive">
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{message}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function getErrorDetails(error: unknown): {
  icon: typeof AlertCircle
  title: string
  message: string
} {
  // Check for specific API error types
  if (error && typeof error === 'object') {
    const err = error as { status?: number; message?: string }

    if (err.status === 403) {
      return {
        icon: Lock,
        title: 'Month Closed',
        message: 'This month has been closed. You cannot create new bookings.',
      }
    }

    if (err.status === 400) {
      return {
        icon: AlertCircle,
        title: 'Invalid Request',
        message: err.message ?? 'The booking could not be created. Please try again.',
      }
    }

    if (!navigator.onLine) {
      return {
        icon: Wifi,
        title: 'No Connection',
        message: 'Please check your internet connection and try again.',
      }
    }
  }

  return {
    icon: AlertCircle,
    title: 'Error',
    message: 'Something went wrong. Please try again.',
  }
}
```

#### 2. Success Toast/Feedback
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/clock-success-toast.tsx`
**Changes**: Create success feedback component

```typescript
'use client'

import { CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClockSuccessToastProps {
  message: string
  show: boolean
  onHide: () => void
}

export function ClockSuccessToast({ message, show, onHide }: ClockSuccessToastProps) {
  if (!show) return null

  // Auto-hide after 2 seconds
  setTimeout(onHide, 2000)

  return (
    <div
      className={cn(
        'fixed bottom-20 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-2 rounded-lg',
        'bg-success text-success-foreground shadow-lg',
        'animate-in fade-in slide-in-from-bottom-4'
      )}
      role="status"
      aria-live="polite"
    >
      <CheckCircle className="h-4 w-4" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}
```

#### 3. Update Component Index
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/index.ts`
**Changes**: Add new exports

```typescript
export { ClockStatusBadge, type ClockStatus } from './clock-status-badge'
export { RunningTimer } from './running-timer'
export { ClockButton } from './clock-button'
export { SecondaryActions } from './secondary-actions'
export { TodayStats } from './today-stats'
export { BookingHistory } from './booking-history'
export { CurrentTime } from './current-time'
export { ClockErrorAlert } from './clock-error-alert'
export { ClockSuccessToast } from './clock-success-toast'
```

#### 4. Update Page with Error Handling
**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/time-clock/page.tsx`
**Changes**: Add error handling and success feedback to the page (update the existing file)

Add these imports at the top:
```typescript
import { ClockErrorAlert, ClockSuccessToast } from '@/components/time-clock'
```

Update the component to track success messages and display errors inline:

```typescript
// Add state for success messages
const [successMessage, setSuccessMessage] = useState<string | null>(null)

// Update handleAction to show success feedback
const handleActionWithFeedback = useCallback(
  async (action: string) => {
    try {
      await clockState.handleAction(action)
      const messages: Record<string, string> = {
        clock_in: 'Clocked in successfully',
        clock_out: 'Clocked out successfully',
        start_break: 'Break started',
        end_break: 'Break ended',
        start_errand: 'Errand started',
        end_errand: 'Errand ended',
      }
      setSuccessMessage(messages[action] ?? 'Action completed')
    } catch (err) {
      // Error is already in clockState.error
    }
  },
  [clockState.handleAction]
)

// Add success toast to the JSX
<ClockSuccessToast
  message={successMessage ?? ''}
  show={!!successMessage}
  onHide={() => setSuccessMessage(null)}
/>

// Show mutation errors inline
{clockState.error && (
  <ClockErrorAlert
    error={clockState.error}
    onRetry={() => clockState.refetch()}
  />
)}
```

#### 5. Accessibility Improvements
**File**: `/home/tolga/projects/terp/apps/web/src/components/time-clock/clock-button.tsx`
**Changes**: Add ARIA labels and keyboard handling

Update the Button component with accessibility attributes:

```typescript
<Button
  size="lg"
  variant={config.variant}
  onClick={() => onAction(config.action)}
  disabled={disabled || isLoading}
  aria-label={`${config.label}. Current status: ${status.replace('_', ' ')}`}
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
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`
- [ ] Build succeeds: `cd apps/web && npm run build`

#### Manual Verification:
- [ ] Clock in shows success toast briefly
- [ ] When API fails, error alert displays with retry button
- [ ] Error alert shows specific message for month closed (403)
- [ ] Clock button has visible focus ring when tabbed to
- [ ] Screen readers announce button purpose and status

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests
- Time utility functions (format, parse, elapsed)
- Clock status determination logic
- Booking type mapping

### Integration Tests
- useClockState hook with mocked API responses
- Page renders with different states (loading, error, clocked in, clocked out)

### Manual Testing Steps
1. Navigate to `/time-clock` while logged in
2. Verify page loads with current time display
3. Click "Clock In" - verify:
   - Button shows loading state
   - Booking appears in history
   - Status changes to "Clocked In"
   - Timer starts running
4. Click "Start Break" - verify status changes to "On Break"
5. Click "End Break" - verify status returns to "Clocked In"
6. Click "Clock Out" - verify:
   - Timer stops
   - Status changes to "Not Clocked In"
   - Stats card shows totals
7. Refresh page - verify state persists from API
8. Test on mobile viewport - verify responsive layout
9. Test with slow network - verify loading states
10. Test with network error - verify error display

## Performance Considerations

- Use React Query caching to minimize API calls
- Timer updates use requestAnimationFrame-friendly intervals
- Component memoization for booking list items
- Stale time of 30 seconds for day view to balance freshness and performance

## References

- Research document: `/home/tolga/projects/terp/thoughts/shared/research/2026-01-25-NOK-220-clock-in-out-feature.md`
- Booking handler: `/home/tolga/projects/terp/apps/api/internal/handler/booking.go`
- Existing hooks pattern: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-bookings.ts`
- Design system: `/home/tolga/projects/terp/apps/web/src/app/globals.css`
