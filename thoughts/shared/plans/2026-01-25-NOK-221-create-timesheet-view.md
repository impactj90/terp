# Implementation Plan: NOK-221 - Create Timesheet View with Daily/Weekly/Monthly Modes

**Date**: 2026-01-25
**Ticket**: NOK-221
**Status**: Ready for Implementation

## Overview

This plan implements the timesheet view page with three viewing modes (Day, Week, Month), period navigation, booking display with original/edited/calculated times, daily summaries, error badges, inline editing capabilities, and export functionality.

---

## Phase 1: Install Required Dependencies and Create UI Primitives

### Description
Install Radix UI Tabs component and create missing UI primitives (Tabs, Table, Select) needed for the timesheet view.

### Tasks

1. **Install @radix-ui/react-tabs**
   - Required for view mode toggle (Day/Week/Month)

2. **Install @radix-ui/react-select**
   - Required for employee selector and period selector

3. **Create Tabs UI component**
   - Based on Radix UI Tabs
   - File: `apps/web/src/components/ui/tabs.tsx`

4. **Create Select UI component**
   - Based on Radix UI Select
   - File: `apps/web/src/components/ui/select.tsx`

5. **Create Table UI component**
   - Simple table primitives (Table, TableHeader, TableBody, TableRow, TableCell, TableHead)
   - File: `apps/web/src/components/ui/table.tsx`

### Commands
```bash
cd apps/web
pnpm add @radix-ui/react-tabs @radix-ui/react-select
```

### Files to Create

**`apps/web/src/components/ui/tabs.tsx`**
```typescript
'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

**`apps/web/src/components/ui/table.tsx`**
```typescript
import * as React from 'react'
import { cn } from '@/lib/utils'

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
))
Table.displayName = 'Table'

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
))
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      className
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
```

**`apps/web/src/components/ui/select.tsx`**
```typescript
'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors
# Verify new component files exist:
ls -la src/components/ui/tabs.tsx src/components/ui/table.tsx src/components/ui/select.tsx
```

### Success Criteria
- All packages installed without errors
- Tabs, Table, and Select components created
- Build passes with no TypeScript errors

---

## Phase 2: Create API Hooks for Daily Values and Monthly Values

### Description
Create the missing React Query hooks for fetching daily values and monthly values.

### Files to Create

**`apps/web/src/hooks/api/use-daily-values.ts`**
```typescript
import { useApiQuery } from '@/hooks'

interface UseDailyValuesOptions {
  employeeId?: string
  from?: string
  to?: string
  status?: 'pending' | 'calculated' | 'error' | 'approved'
  hasErrors?: boolean
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch daily values for an employee.
 */
export function useDailyValues(options: UseDailyValuesOptions = {}) {
  const {
    employeeId,
    from,
    to,
    status,
    hasErrors,
    limit = 50,
    cursor,
    enabled = true,
  } = options

  return useApiQuery('/daily-values', {
    params: {
      employee_id: employeeId,
      from,
      to,
      status,
      has_errors: hasErrors,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single daily value by ID.
 */
export function useDailyValue(id: string, enabled = true) {
  return useApiQuery('/daily-values/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

**`apps/web/src/hooks/api/use-monthly-values.ts`**
```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseMonthlyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  status?: 'open' | 'calculated' | 'closed' | 'exported'
  departmentId?: string
  enabled?: boolean
}

/**
 * Hook to fetch monthly values.
 */
export function useMonthlyValues(options: UseMonthlyValuesOptions = {}) {
  const {
    employeeId,
    year,
    month,
    status,
    departmentId,
    enabled = true,
  } = options

  return useApiQuery('/monthly-values', {
    params: {
      employee_id: employeeId,
      year,
      month,
      status,
      department_id: departmentId,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single monthly value by ID.
 */
export function useMonthlyValue(id: string, enabled = true) {
  return useApiQuery('/monthly-values/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

**Update `apps/web/src/hooks/api/index.ts`** - Add exports:
```typescript
// Domain-specific API hooks

// Employees
export {
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
} from './use-employees'

// Bookings
export {
  useBookings,
  useBooking,
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
} from './use-bookings'

// Daily Values
export {
  useDailyValues,
  useDailyValue,
} from './use-daily-values'

// Monthly Values
export {
  useMonthlyValues,
  useMonthlyValue,
} from './use-monthly-values'
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors
```

### Success Criteria
- `useDailyValues` and `useMonthlyValues` hooks created
- Hooks exported from index file
- Build passes with no TypeScript errors

---

## Phase 3: Create Utility Functions for Time Formatting

### Description
Create utility functions for formatting time values (minutes to HH:MM), date helpers, and period calculations.

### Files to Create

**`apps/web/src/lib/time-utils.ts`**
```typescript
/**
 * Convert minutes from midnight to HH:MM format.
 * @example minutesToTime(480) // "08:00"
 * @example minutesToTime(905) // "15:05"
 */
export function minutesToTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '--:--'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Convert minutes to hours:minutes duration format (e.g., "8:30" for 8.5 hours).
 * @example minutesToDuration(510) // "8:30"
 * @example minutesToDuration(-120) // "-2:00"
 */
export function minutesToDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '--:--'
  const isNegative = minutes < 0
  const absMinutes = Math.abs(minutes)
  const hours = Math.floor(absMinutes / 60)
  const mins = absMinutes % 60
  const sign = isNegative ? '-' : ''
  return `${sign}${hours}:${mins.toString().padStart(2, '0')}`
}

/**
 * Format a balance (overtime/undertime) with sign.
 * @example formatBalance(120) // "+2:00"
 * @example formatBalance(-30) // "-0:30"
 */
export function formatBalance(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '--:--'
  const sign = minutes >= 0 ? '+' : ''
  return `${sign}${minutesToDuration(minutes)}`
}

/**
 * Parse HH:MM string to minutes from midnight.
 * @example timeToMinutes("08:00") // 480
 * @example timeToMinutes("15:30") // 930
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Get ISO date string (YYYY-MM-DD) from Date object.
 */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Parse ISO date string to Date object.
 */
export function parseISODate(dateString: string): Date {
  return new Date(dateString + 'T00:00:00')
}

/**
 * Get start and end dates for a week containing the given date.
 * Week starts on Monday.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
  const start = new Date(d.setDate(diff))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

/**
 * Get start and end dates for a month containing the given date.
 */
export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { start, end }
}

/**
 * Get array of dates for a week.
 */
export function getWeekDates(date: Date): Date[] {
  const { start } = getWeekRange(date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/**
 * Get array of dates for a month.
 */
export function getMonthDates(date: Date): Date[] {
  const { start, end } = getMonthRange(date)
  const dates: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

/**
 * Format date for display.
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'weekday' = 'short'): string {
  switch (format) {
    case 'short':
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    case 'long':
      return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    case 'weekday':
      return date.toLocaleDateString('de-DE', { weekday: 'short' })
    default:
      return date.toLocaleDateString('de-DE')
  }
}

/**
 * Check if two dates are the same day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Check if a date is today.
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

/**
 * Check if a date is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors
```

### Success Criteria
- All time utility functions created
- Functions handle edge cases (null, undefined)
- Build passes with no TypeScript errors

---

## Phase 4: Create Timesheet Page Skeleton and Period State Management

### Description
Create the main timesheet page with basic structure, view mode toggle, and period navigation state.

### Files to Create

**`apps/web/src/app/(dashboard)/timesheet/page.tsx`**
```typescript
'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  toISODate,
  parseISODate,
  getWeekRange,
  getMonthRange,
  formatDate,
} from '@/lib/time-utils'

type ViewMode = 'day' | 'week' | 'month'

export default function TimesheetPage() {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Calculate period dates based on view mode
  const periodDates = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return { start: currentDate, end: currentDate }
      case 'week':
        return getWeekRange(currentDate)
      case 'month':
        return getMonthRange(currentDate)
    }
  }, [viewMode, currentDate])

  // Navigation functions
  const navigatePrevious = () => {
    const newDate = new Date(currentDate)
    switch (viewMode) {
      case 'day':
        newDate.setDate(newDate.getDate() - 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() - 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() - 1)
        break
    }
    setCurrentDate(newDate)
  }

  const navigateNext = () => {
    const newDate = new Date(currentDate)
    switch (viewMode) {
      case 'day':
        newDate.setDate(newDate.getDate() + 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() + 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + 1)
        break
    }
    setCurrentDate(newDate)
  }

  const navigateToToday = () => {
    setCurrentDate(new Date())
  }

  // Format period label for display
  const periodLabel = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return formatDate(currentDate, 'long')
      case 'week':
        return `${formatDate(periodDates.start, 'short')} - ${formatDate(periodDates.end, 'short')}`
      case 'month':
        return currentDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    }
  }, [viewMode, currentDate, periodDates])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timesheet</h1>
          <p className="text-muted-foreground">
            View and manage your time entries
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* View mode tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Period navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToToday}>
            Today
          </Button>
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium min-w-[160px] text-center">
              {periodLabel}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content based on view mode */}
      <Card>
        <CardContent className="pt-6">
          {viewMode === 'day' && (
            <TimesheetDayViewPlaceholder date={currentDate} />
          )}
          {viewMode === 'week' && (
            <TimesheetWeekViewPlaceholder
              startDate={periodDates.start}
              endDate={periodDates.end}
            />
          )}
          {viewMode === 'month' && (
            <TimesheetMonthViewPlaceholder
              year={currentDate.getFullYear()}
              month={currentDate.getMonth() + 1}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Placeholder components - will be replaced in later phases
function TimesheetDayViewPlaceholder({ date }: { date: Date }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      Day view for {formatDate(date, 'long')} - Coming soon
    </div>
  )
}

function TimesheetWeekViewPlaceholder({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      Week view ({formatDate(startDate, 'short')} - {formatDate(endDate, 'short')}) - Coming soon
    </div>
  )
}

function TimesheetMonthViewPlaceholder({ year, month }: { year: number; month: number }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      Month view ({month}/{year}) - Coming soon
    </div>
  )
}
```

### Verification
```bash
cd apps/web && pnpm build
pnpm dev
# Navigate to /timesheet - should see page with view mode toggle and period navigation
```

### Success Criteria
- Timesheet page renders at /timesheet
- View mode toggle (Day/Week/Month) works
- Period navigation (previous/next/today) works
- Period label updates correctly

---

## Phase 5: Create Time Display Components

### Description
Create reusable components for displaying booking times (original, edited, calculated) and daily summaries.

### Files to Create

**`apps/web/src/components/timesheet/time-display.tsx`**
```typescript
import { cn } from '@/lib/utils'
import { minutesToTime, minutesToDuration, formatBalance } from '@/lib/time-utils'

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
  switch (format) {
    case 'time':
      formatted = minutesToTime(value)
      break
    case 'duration':
      formatted = minutesToDuration(value)
      break
    case 'balance':
      formatted = formatBalance(value)
      break
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
  // Check if times differ
  const isEdited = original !== edited
  const isCalculated = edited !== calculated

  // Simplified display when all same
  if (!showAll && !isEdited && !isCalculated) {
    return (
      <span className={cn('font-mono tabular-nums', className)}>
        {minutesToTime(calculated)}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', className)}>
      <span className={cn(
        'font-mono tabular-nums',
        isEdited ? 'line-through text-muted-foreground' : ''
      )}>
        {minutesToTime(original)}
      </span>
      {isEdited && (
        <>
          <span className="text-muted-foreground">→</span>
          <span className={cn(
            'font-mono tabular-nums',
            isCalculated ? 'text-muted-foreground' : 'font-medium'
          )}>
            {minutesToTime(edited)}
          </span>
        </>
      )}
      {isCalculated && (
        <>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono tabular-nums font-medium text-primary">
            {minutesToTime(calculated)}
          </span>
        </>
      )}
    </span>
  )
}
```

**`apps/web/src/components/timesheet/daily-summary.tsx`**
```typescript
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
```

**`apps/web/src/components/timesheet/error-badge.tsx`**
```typescript
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface DailyError {
  id: string
  error_type: string
  message: string
  severity?: 'warning' | 'error'
}

interface ErrorBadgeProps {
  errors?: DailyError[] | null
  className?: string
}

/**
 * Display error/warning badge for days with issues.
 */
export function ErrorBadge({ errors, className }: ErrorBadgeProps) {
  if (!errors || errors.length === 0) return null

  const hasErrors = errors.some(e => e.severity === 'error' || !e.severity)
  const warningCount = errors.filter(e => e.severity === 'warning').length
  const errorCount = errors.length - warningCount

  const variant = hasErrors ? 'destructive' : 'secondary'
  const Icon = hasErrors ? AlertCircle : AlertTriangle

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={variant}
          className={cn('gap-1 cursor-help', className)}
        >
          <Icon className="h-3 w-3" />
          {errors.length}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          {errors.map((error) => (
            <div key={error.id} className="flex items-start gap-2 text-xs">
              {error.severity === 'warning' ? (
                <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
              )}
              <span>{error.message}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
```

**`apps/web/src/components/timesheet/index.ts`**
```typescript
export { TimeDisplay, BookingTimeTriple } from './time-display'
export { DailySummary } from './daily-summary'
export { ErrorBadge } from './error-badge'
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors
```

### Success Criteria
- TimeDisplay component handles all time formats
- BookingTimeTriple shows original/edited/calculated with visual indicators
- DailySummary shows daily totals in multiple layouts
- ErrorBadge shows error count with tooltip details
- Build passes with no TypeScript errors

---

## Phase 6: Create Booking Pair Component

### Description
Create a component to display a pair of bookings (IN/OUT) with times and status.

### Files to Create

**`apps/web/src/components/timesheet/booking-pair.tsx`**
```typescript
import { Clock, ArrowRight, Edit, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookingTimeTriple } from './time-display'

interface Booking {
  id: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  source: string
  notes?: string | null
}

interface BookingPairProps {
  inBooking?: Booking | null
  outBooking?: Booking | null
  durationMinutes?: number | null
  isEditable?: boolean
  onEdit?: (booking: Booking) => void
  onDelete?: (booking: Booking) => void
  className?: string
}

/**
 * Display a pair of IN/OUT bookings with calculated duration.
 */
export function BookingPair({
  inBooking,
  outBooking,
  durationMinutes,
  isEditable = false,
  onEdit,
  onDelete,
  className,
}: BookingPairProps) {
  const hasInBooking = !!inBooking
  const hasOutBooking = !!outBooking
  const isPaired = hasInBooking && hasOutBooking
  const isMissing = !hasInBooking || !hasOutBooking

  return (
    <div className={cn(
      'flex items-center gap-4 py-3 px-4 rounded-lg border',
      isMissing && 'border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10',
      className
    )}>
      {/* Clock icon */}
      <Clock className={cn(
        'h-4 w-4 shrink-0',
        isMissing ? 'text-yellow-600' : 'text-muted-foreground'
      )} />

      {/* IN booking */}
      <div className="flex-1 min-w-0">
        {hasInBooking ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {inBooking.booking_type?.name ?? 'IN'}
            </Badge>
            <BookingTimeTriple
              original={inBooking.original_time}
              edited={inBooking.edited_time}
              calculated={inBooking.calculated_time}
            />
            {inBooking.source !== 'terminal' && (
              <Badge variant="secondary" className="text-xs">
                {inBooking.source}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-yellow-600 italic">Missing IN booking</span>
        )}
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* OUT booking */}
      <div className="flex-1 min-w-0">
        {hasOutBooking ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {outBooking.booking_type?.name ?? 'OUT'}
            </Badge>
            <BookingTimeTriple
              original={outBooking.original_time}
              edited={outBooking.edited_time}
              calculated={outBooking.calculated_time}
            />
            {outBooking.source !== 'terminal' && (
              <Badge variant="secondary" className="text-xs">
                {outBooking.source}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-yellow-600 italic">Missing OUT booking</span>
        )}
      </div>

      {/* Duration */}
      {isPaired && durationMinutes !== undefined && (
        <div className="text-sm font-medium tabular-nums min-w-[60px] text-right">
          {Math.floor((durationMinutes ?? 0) / 60)}:{((durationMinutes ?? 0) % 60).toString().padStart(2, '0')}
        </div>
      )}

      {/* Actions */}
      {isEditable && (
        <div className="flex items-center gap-1">
          {hasInBooking && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEdit?.(inBooking)}
              aria-label="Edit IN booking"
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}
          {hasOutBooking && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEdit?.(outBooking)}
              aria-label="Edit OUT booking"
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

**`apps/web/src/components/timesheet/booking-list.tsx`**
```typescript
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingPair } from './booking-pair'

interface Booking {
  id: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  source: string
  notes?: string | null
  pair_id?: string | null
}

interface BookingListProps {
  bookings?: Booking[]
  isLoading?: boolean
  isEditable?: boolean
  onEdit?: (booking: Booking) => void
  onDelete?: (booking: Booking) => void
  onAdd?: () => void
}

/**
 * Display a list of booking pairs for a day.
 */
export function BookingList({
  bookings = [],
  isLoading,
  isEditable = false,
  onEdit,
  onDelete,
  onAdd,
}: BookingListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  // Group bookings into pairs
  const pairs = groupBookingsIntoPairs(bookings)

  if (pairs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No bookings for this day</p>
        {isEditable && onAdd && (
          <Button variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Booking
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pairs.map((pair, index) => (
        <BookingPair
          key={pair.inBooking?.id ?? pair.outBooking?.id ?? index}
          inBooking={pair.inBooking}
          outBooking={pair.outBooking}
          durationMinutes={pair.duration}
          isEditable={isEditable}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      {isEditable && onAdd && (
        <Button variant="outline" className="w-full" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Booking
        </Button>
      )}
    </div>
  )
}

interface BookingPairData {
  inBooking?: Booking | null
  outBooking?: Booking | null
  duration?: number | null
}

/**
 * Group bookings into IN/OUT pairs based on pair_id or sequential matching.
 */
function groupBookingsIntoPairs(bookings: Booking[]): BookingPairData[] {
  const pairs: BookingPairData[] = []
  const used = new Set<string>()

  // Sort by time
  const sorted = [...bookings].sort((a, b) =>
    (a.calculated_time ?? a.edited_time) - (b.calculated_time ?? b.edited_time)
  )

  // First pass: match by pair_id
  for (const booking of sorted) {
    if (used.has(booking.id)) continue
    if (!booking.pair_id) continue

    const paired = sorted.find(
      b => b.id === booking.pair_id && !used.has(b.id)
    )
    if (paired) {
      const isIn = booking.booking_type?.direction === 'in'
      const inB = isIn ? booking : paired
      const outB = isIn ? paired : booking

      const inTime = inB.calculated_time ?? inB.edited_time
      const outTime = outB.calculated_time ?? outB.edited_time

      pairs.push({
        inBooking: inB,
        outBooking: outB,
        duration: outTime - inTime,
      })
      used.add(booking.id)
      used.add(paired.id)
    }
  }

  // Second pass: sequential matching for unpaired bookings
  const unpaired = sorted.filter(b => !used.has(b.id))
  let i = 0
  while (i < unpaired.length) {
    const current = unpaired[i]
    const isIn = current.booking_type?.direction === 'in'

    if (isIn && i + 1 < unpaired.length) {
      const next = unpaired[i + 1]
      const isOut = next.booking_type?.direction === 'out'

      if (isOut) {
        const inTime = current.calculated_time ?? current.edited_time
        const outTime = next.calculated_time ?? next.edited_time

        pairs.push({
          inBooking: current,
          outBooking: next,
          duration: outTime - inTime,
        })
        i += 2
        continue
      }
    }

    // Unpaired booking
    pairs.push({
      inBooking: isIn ? current : null,
      outBooking: isIn ? null : current,
      duration: null,
    })
    i++
  }

  return pairs
}
```

**Update `apps/web/src/components/timesheet/index.ts`**
```typescript
export { TimeDisplay, BookingTimeTriple } from './time-display'
export { DailySummary } from './daily-summary'
export { ErrorBadge } from './error-badge'
export { BookingPair } from './booking-pair'
export { BookingList } from './booking-list'
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors
```

### Success Criteria
- BookingPair displays IN/OUT times with proper formatting
- Visual indicators for missing bookings
- Duration calculation shown
- Edit/delete buttons when editable
- BookingList groups and displays booking pairs
- Build passes with no TypeScript errors

---

## Phase 7: Implement Daily View

### Description
Create the complete daily view showing all bookings for a single day with summary.

### Files to Create

**`apps/web/src/components/timesheet/day-view.tsx`**
```typescript
'use client'

import { useMemo } from 'react'
import { CalendarDays, Sun, Umbrella, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookings } from '@/hooks/api'
import { useDailyValues } from '@/hooks/api'
import { toISODate, formatDate, isToday, isWeekend } from '@/lib/time-utils'
import { BookingList } from './booking-list'
import { DailySummary } from './daily-summary'
import { ErrorBadge } from './error-badge'

interface DayViewProps {
  date: Date
  employeeId?: string
  isEditable?: boolean
  onAddBooking?: () => void
  onEditBooking?: (booking: unknown) => void
}

export function DayView({
  date,
  employeeId,
  isEditable = true,
  onAddBooking,
  onEditBooking,
}: DayViewProps) {
  const dateString = toISODate(date)
  const today = isToday(date)
  const weekend = isWeekend(date)

  // Fetch bookings for this day
  const { data: bookingsData, isLoading: isLoadingBookings } = useBookings({
    employeeId,
    from: dateString,
    to: dateString,
    enabled: !!employeeId,
  })

  // Fetch daily value for this day
  const { data: dailyValuesData, isLoading: isLoadingDailyValues } = useDailyValues({
    employeeId,
    from: dateString,
    to: dateString,
    enabled: !!employeeId,
  })

  const bookings = bookingsData?.data ?? []
  const dailyValue = dailyValuesData?.data?.[0]

  const isLoading = isLoadingBookings || isLoadingDailyValues

  return (
    <div className="space-y-6">
      {/* Day header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className={cn(
              'text-lg font-semibold',
              today && 'text-primary'
            )}>
              {formatDate(date, 'long')}
            </h2>
            <div className="flex items-center gap-2">
              {today && (
                <Badge variant="default" className="text-xs">Today</Badge>
              )}
              {weekend && (
                <Badge variant="secondary" className="text-xs">Weekend</Badge>
              )}
              {dailyValue?.is_holiday && (
                <Badge variant="secondary" className="text-xs">
                  <Sun className="h-3 w-3 mr-1" />
                  Holiday
                </Badge>
              )}
              {dailyValue?.is_absence && (
                <Badge variant="outline" className="text-xs">
                  <Umbrella className="h-3 w-3 mr-1" />
                  {dailyValue.absence_type?.name ?? 'Absence'}
                </Badge>
              )}
              <ErrorBadge errors={dailyValue?.errors} />
            </div>
          </div>
        </div>

        {/* Day plan info */}
        {dailyValue?.day_plan && (
          <div className="text-sm text-muted-foreground text-right">
            <div>{dailyValue.day_plan.name}</div>
            <div className="text-xs">
              Target: {Math.floor((dailyValue.target_minutes ?? 0) / 60)}:{((dailyValue.target_minutes ?? 0) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      {/* Bookings list */}
      <div>
        <h3 className="text-sm font-medium mb-3">Bookings</h3>
        <BookingList
          bookings={bookings as never[]}
          isLoading={isLoading}
          isEditable={isEditable && !dailyValue?.is_locked}
          onEdit={onEditBooking as never}
          onAdd={onAddBooking}
        />
      </div>

      {/* Daily summary */}
      {dailyValue && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium mb-3">Daily Summary</h3>
          <DailySummary
            targetMinutes={dailyValue.target_minutes}
            grossMinutes={dailyValue.gross_minutes}
            breakMinutes={dailyValue.break_minutes}
            netMinutes={dailyValue.net_minutes}
            balanceMinutes={dailyValue.balance_minutes}
            layout="horizontal"
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && !dailyValue && (
        <div className="pt-4 border-t">
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {/* Status indicators */}
      {dailyValue && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Status: {dailyValue.status}</span>
          {dailyValue.is_locked && (
            <Badge variant="outline" className="text-xs">Locked</Badge>
          )}
          {dailyValue.calculated_at && (
            <span>
              Calculated: {new Date(dailyValue.calculated_at).toLocaleString('de-DE')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

### Update Timesheet Page to Use DayView

**Update `apps/web/src/app/(dashboard)/timesheet/page.tsx`** - Replace placeholder:
```typescript
// Add import at top
import { DayView } from '@/components/timesheet/day-view'

// Replace TimesheetDayViewPlaceholder with:
function TimesheetDayViewContent({ date }: { date: Date }) {
  const { user } = useAuth()
  // TODO: Get employeeId from user or selection
  const employeeId = user?.id // Placeholder - should be employee_id

  const handleAddBooking = () => {
    console.log('Add booking for', date)
    // TODO: Open booking dialog
  }

  const handleEditBooking = (booking: unknown) => {
    console.log('Edit booking', booking)
    // TODO: Open booking edit dialog
  }

  return (
    <DayView
      date={date}
      employeeId={employeeId}
      isEditable={true}
      onAddBooking={handleAddBooking}
      onEditBooking={handleEditBooking}
    />
  )
}
```

### Verification
```bash
cd apps/web && pnpm build
pnpm dev
# Navigate to /timesheet - Day view should show bookings and daily summary
```

### Success Criteria
- Day view displays date header with badges (today, weekend, holiday, absence)
- Bookings list shows all bookings with times
- Daily summary shows totals (target, gross, breaks, net, balance)
- Error badge shows if there are errors
- Status indicators (locked, calculated timestamp)
- Build passes with no TypeScript errors

---

## Phase 8: Implement Weekly View

### Description
Create the weekly view showing all 7 days in a table format with daily totals.

### Files to Create

**`apps/web/src/components/timesheet/week-view.tsx`**
```typescript
'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { useDailyValues } from '@/hooks/api'
import { useBookings } from '@/hooks/api'
import {
  toISODate,
  getWeekDates,
  formatDate,
  isToday,
  isWeekend,
  minutesToDuration,
  formatBalance,
} from '@/lib/time-utils'
import { ErrorBadge } from './error-badge'
import { TimeDisplay } from './time-display'

interface WeekViewProps {
  startDate: Date
  endDate: Date
  employeeId?: string
  onDayClick?: (date: Date) => void
}

export function WeekView({
  startDate,
  endDate,
  employeeId,
  onDayClick,
}: WeekViewProps) {
  const dates = useMemo(() => getWeekDates(startDate), [startDate])

  // Fetch daily values for the week
  const { data: dailyValuesData, isLoading: isLoadingDailyValues } = useDailyValues({
    employeeId,
    from: toISODate(startDate),
    to: toISODate(endDate),
    enabled: !!employeeId,
  })

  // Create a map of date -> daily value
  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, typeof dailyValuesData extends { data: (infer T)[] } ? T : never>()
    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        map.set(dv.value_date, dv as never)
      }
    }
    return map
  }, [dailyValuesData])

  // Calculate week totals
  const weekTotals = useMemo(() => {
    let target = 0
    let gross = 0
    let breaks = 0
    let net = 0
    let balance = 0

    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        target += dv.target_minutes ?? 0
        gross += dv.gross_minutes ?? 0
        breaks += dv.break_minutes ?? 0
        net += dv.net_minutes ?? 0
        balance += dv.balance_minutes ?? 0
      }
    }

    return { target, gross, breaks, net, balance }
  }, [dailyValuesData])

  const isLoading = isLoadingDailyValues

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Day</TableHead>
            <TableHead className="text-right">Target</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Breaks</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-[60px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dates.map((date) => {
            const dateString = toISODate(date)
            const dailyValue = dailyValuesByDate.get(dateString)
            const today = isToday(date)
            const weekend = isWeekend(date)

            return (
              <TableRow
                key={dateString}
                className={cn(
                  'cursor-pointer hover:bg-muted/50',
                  today && 'bg-primary/5',
                  weekend && !dailyValue?.target_minutes && 'text-muted-foreground'
                )}
                onClick={() => onDayClick?.(date)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div>
                      <div className={cn(
                        'font-medium',
                        today && 'text-primary'
                      )}>
                        {formatDate(date, 'weekday')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(date, 'short')}
                      </div>
                    </div>
                    {dailyValue?.is_holiday && (
                      <Badge variant="secondary" className="text-xs">H</Badge>
                    )}
                    {dailyValue?.is_absence && (
                      <Badge variant="outline" className="text-xs">A</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay value={dailyValue?.target_minutes} format="duration" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay value={dailyValue?.gross_minutes} format="duration" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay value={dailyValue?.break_minutes} format="duration" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay
                      value={dailyValue?.net_minutes}
                      format="duration"
                      className="font-medium"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 ml-auto" />
                  ) : (
                    <TimeDisplay
                      value={dailyValue?.balance_minutes}
                      format="balance"
                      className="font-medium"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <ErrorBadge errors={dailyValue?.errors as never} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">Week Total</TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.target} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.gross} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.breaks} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.net} format="duration" />
            </TableCell>
            <TableCell className="text-right font-medium">
              <TimeDisplay value={weekTotals.balance} format="balance" />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
```

### Update Timesheet Page to Use WeekView

**Update `apps/web/src/app/(dashboard)/timesheet/page.tsx`** - Add import and content:
```typescript
// Add import at top
import { WeekView } from '@/components/timesheet/week-view'

// Replace TimesheetWeekViewPlaceholder with:
function TimesheetWeekViewContent({
  startDate,
  endDate,
  onDayClick,
}: {
  startDate: Date
  endDate: Date
  onDayClick: (date: Date) => void
}) {
  const { user } = useAuth()
  const employeeId = user?.id // Placeholder

  return (
    <WeekView
      startDate={startDate}
      endDate={endDate}
      employeeId={employeeId}
      onDayClick={onDayClick}
    />
  )
}
```

Also add navigation from week view to day view:
```typescript
// In TimesheetPage component, add handler:
const handleDayClick = (date: Date) => {
  setCurrentDate(date)
  setViewMode('day')
}
```

### Verification
```bash
cd apps/web && pnpm build
pnpm dev
# Navigate to /timesheet, switch to Week view
# Should see table with 7 days and totals
```

### Success Criteria
- Week view displays all 7 days in a table
- Each row shows day name, date, and time values
- Weekend/holiday/absence badges shown
- Error badges shown for days with issues
- Footer shows week totals
- Clicking a day navigates to day view
- Build passes with no TypeScript errors

---

## Phase 9: Implement Monthly View (Calendar Grid)

### Description
Create the monthly view showing a calendar grid with daily totals.

### Files to Create

**`apps/web/src/components/timesheet/month-view.tsx`**
```typescript
'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDailyValues, useMonthlyValues } from '@/hooks/api'
import {
  toISODate,
  getMonthDates,
  getMonthRange,
  formatDate,
  isToday,
  isWeekend,
  minutesToDuration,
  formatBalance,
} from '@/lib/time-utils'
import { ErrorBadge } from './error-badge'
import { TimeDisplay } from './time-display'
import { DailySummary } from './daily-summary'

interface MonthViewProps {
  year: number
  month: number // 1-12
  employeeId?: string
  onDayClick?: (date: Date) => void
}

export function MonthView({
  year,
  month,
  employeeId,
  onDayClick,
}: MonthViewProps) {
  const referenceDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const { start, end } = useMemo(() => getMonthRange(referenceDate), [referenceDate])
  const dates = useMemo(() => getMonthDates(referenceDate), [referenceDate])

  // Fetch daily values for the month
  const { data: dailyValuesData, isLoading: isLoadingDailyValues } = useDailyValues({
    employeeId,
    from: toISODate(start),
    to: toISODate(end),
    enabled: !!employeeId,
  })

  // Fetch monthly value
  const { data: monthlyValuesData, isLoading: isLoadingMonthlyValues } = useMonthlyValues({
    employeeId,
    year,
    month,
    enabled: !!employeeId,
  })

  // Create a map of date -> daily value
  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, typeof dailyValuesData extends { data: (infer T)[] } ? T : never>()
    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        map.set(dv.value_date, dv as never)
      }
    }
    return map
  }, [dailyValuesData])

  const monthlyValue = monthlyValuesData?.data?.[0]

  // Calculate calendar grid with padding for first week
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1)
    const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday
    const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1 // Monday = 0

    const grid: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = Array(adjustedStartDay).fill(null)

    for (const date of dates) {
      currentWeek.push(date)
      if (currentWeek.length === 7) {
        grid.push(currentWeek)
        currentWeek = []
      }
    }

    // Pad last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      grid.push(currentWeek)
    }

    return grid
  }, [year, month, dates])

  const isLoading = isLoadingDailyValues || isLoadingMonthlyValues
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="space-y-6">
      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'text-center text-sm font-medium py-2',
                  index >= 5 && 'text-muted-foreground'
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar body */}
          <div className="space-y-1">
            {calendarGrid.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((date, dayIndex) => {
                  if (!date) {
                    return <div key={dayIndex} className="min-h-[80px]" />
                  }

                  const dateString = toISODate(date)
                  const dailyValue = dailyValuesByDate.get(dateString)
                  const today = isToday(date)
                  const weekend = isWeekend(date)

                  return (
                    <button
                      key={dayIndex}
                      onClick={() => onDayClick?.(date)}
                      className={cn(
                        'min-h-[80px] p-2 rounded-lg border text-left transition-colors',
                        'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
                        today && 'ring-2 ring-primary bg-primary/5',
                        weekend && !dailyValue?.target_minutes && 'bg-muted/30',
                        dailyValue?.has_errors && 'border-destructive/50'
                      )}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          'text-sm font-medium',
                          today && 'text-primary'
                        )}>
                          {date.getDate()}
                        </span>
                        <ErrorBadge errors={dailyValue?.errors as never} />
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mb-1">
                        {dailyValue?.is_holiday && (
                          <Badge variant="secondary" className="text-[10px] px-1">H</Badge>
                        )}
                        {dailyValue?.is_absence && (
                          <Badge variant="outline" className="text-[10px] px-1">A</Badge>
                        )}
                      </div>

                      {/* Time values */}
                      {isLoading ? (
                        <Skeleton className="h-4 w-12" />
                      ) : dailyValue?.net_minutes !== undefined ? (
                        <div className="text-xs space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Net:</span>
                            <TimeDisplay
                              value={dailyValue.net_minutes}
                              format="duration"
                              className="text-xs"
                            />
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+/-:</span>
                            <TimeDisplay
                              value={dailyValue.balance_minutes}
                              format="balance"
                              className="text-xs font-medium"
                            />
                          </div>
                        </div>
                      ) : weekend ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No data</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly summary */}
      {monthlyValue && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium mb-3">Monthly Summary</h3>
          <DailySummary
            targetMinutes={monthlyValue.target_minutes}
            grossMinutes={monthlyValue.gross_minutes}
            breakMinutes={monthlyValue.break_minutes}
            netMinutes={monthlyValue.net_minutes}
            balanceMinutes={monthlyValue.balance_minutes}
            layout="horizontal"
          />
          <div className="flex items-center gap-6 mt-3 text-sm text-muted-foreground">
            <span>Working days: {monthlyValue.working_days}</span>
            <span>Worked days: {monthlyValue.worked_days}</span>
            <span>Absence days: {monthlyValue.absence_days}</span>
            <span>Holiday days: {monthlyValue.holiday_days}</span>
            <span>Status: {monthlyValue.status}</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

### Update Timesheet Page to Use MonthView

**Update `apps/web/src/app/(dashboard)/timesheet/page.tsx`** - Add import and content:
```typescript
// Add import at top
import { MonthView } from '@/components/timesheet/month-view'

// Replace TimesheetMonthViewPlaceholder with:
function TimesheetMonthViewContent({
  year,
  month,
  onDayClick,
}: {
  year: number
  month: number
  onDayClick: (date: Date) => void
}) {
  const { user } = useAuth()
  const employeeId = user?.id // Placeholder

  return (
    <MonthView
      year={year}
      month={month}
      employeeId={employeeId}
      onDayClick={onDayClick}
    />
  )
}
```

### Verification
```bash
cd apps/web && pnpm build
pnpm dev
# Navigate to /timesheet, switch to Month view
# Should see calendar grid with daily totals
```

### Success Criteria
- Month view displays calendar grid layout
- Days show net time and balance
- Visual indicators for today, weekends, holidays, absences
- Error badges on days with issues
- Monthly summary shows totals at bottom
- Clicking a day navigates to day view
- Build passes with no TypeScript errors

---

## Phase 10: Add Period Summary Component

### Description
Create a period summary component that shows totals for the selected period.

### Files to Create

**`apps/web/src/components/timesheet/period-summary.tsx`**
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from './time-display'

interface PeriodSummaryProps {
  title: string
  targetMinutes?: number | null
  grossMinutes?: number | null
  breakMinutes?: number | null
  netMinutes?: number | null
  balanceMinutes?: number | null
  workingDays?: number | null
  workedDays?: number | null
  absenceDays?: number | null
  holidayDays?: number | null
  isLoading?: boolean
}

export function PeriodSummary({
  title,
  targetMinutes,
  grossMinutes,
  breakMinutes,
  netMinutes,
  balanceMinutes,
  workingDays,
  workedDays,
  absenceDays,
  holidayDays,
  isLoading,
}: PeriodSummaryProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryItem label="Target" value={targetMinutes} format="duration" />
          <SummaryItem label="Gross" value={grossMinutes} format="duration" />
          <SummaryItem label="Breaks" value={breakMinutes} format="duration" />
          <SummaryItem label="Net" value={netMinutes} format="duration" highlight />
          <SummaryItem label="Balance" value={balanceMinutes} format="balance" highlight />
        </div>

        {(workingDays !== undefined || workedDays !== undefined) && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t text-sm text-muted-foreground">
            {workingDays !== undefined && (
              <span>Working days: <strong className="text-foreground">{workingDays}</strong></span>
            )}
            {workedDays !== undefined && (
              <span>Worked: <strong className="text-foreground">{workedDays}</strong></span>
            )}
            {absenceDays !== undefined && absenceDays > 0 && (
              <span>Absence: <strong className="text-foreground">{absenceDays}</strong></span>
            )}
            {holidayDays !== undefined && holidayDays > 0 && (
              <span>Holidays: <strong className="text-foreground">{holidayDays}</strong></span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface SummaryItemProps {
  label: string
  value?: number | null
  format: 'duration' | 'balance'
  highlight?: boolean
}

function SummaryItem({ label, value, format, highlight }: SummaryItemProps) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <TimeDisplay
        value={value}
        format={format}
        className={highlight ? 'text-lg font-semibold' : 'text-lg'}
      />
    </div>
  )
}
```

### Update exports in `apps/web/src/components/timesheet/index.ts`:
```typescript
export { TimeDisplay, BookingTimeTriple } from './time-display'
export { DailySummary } from './daily-summary'
export { ErrorBadge } from './error-badge'
export { BookingPair } from './booking-pair'
export { BookingList } from './booking-list'
export { DayView } from './day-view'
export { WeekView } from './week-view'
export { MonthView } from './month-view'
export { PeriodSummary } from './period-summary'
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors
```

### Success Criteria
- PeriodSummary displays all time totals
- Day counts shown when available
- Highlight on important values (net, balance)
- Loading skeleton support
- Build passes with no TypeScript errors

---

## Phase 11: Create Booking Edit Dialog

### Description
Create a dialog for editing booking times inline.

### Files to Create

**`apps/web/src/components/timesheet/booking-edit-dialog.tsx`**
```typescript
'use client'

import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useUpdateBooking } from '@/hooks/api'
import { minutesToTime, timeToMinutes } from '@/lib/time-utils'

interface Booking {
  id: string
  booking_date: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  notes?: string | null
}

interface BookingEditDialogProps {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function BookingEditDialog({
  booking,
  open,
  onOpenChange,
  onSuccess,
}: BookingEditDialogProps) {
  const [editedTime, setEditedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const updateBooking = useUpdateBooking()

  // Initialize form when booking changes
  useEffect(() => {
    if (booking) {
      setEditedTime(minutesToTime(booking.edited_time))
      setNotes(booking.notes ?? '')
      setError(null)
    }
  }, [booking])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking) return

    setError(null)

    try {
      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
      if (!timeRegex.test(editedTime)) {
        setError('Invalid time format. Use HH:MM (e.g., 08:30)')
        return
      }

      const minutes = timeToMinutes(editedTime)

      await updateBooking.mutateAsync({
        path: { id: booking.id },
        body: {
          edited_time: minutes,
          notes: notes || null,
        },
      } as never)

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking')
    }
  }

  if (!booking) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Booking</SheetTitle>
          <SheetDescription>
            {booking.booking_type?.name ?? 'Booking'} on {booking.booking_date}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="ml-2">{error}</span>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Original Time</Label>
            <Input
              value={minutesToTime(booking.original_time)}
              disabled
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Original time from terminal (cannot be changed)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editedTime">Edited Time</Label>
            <Input
              id="editedTime"
              value={editedTime}
              onChange={(e) => setEditedTime(e.target.value)}
              placeholder="HH:MM"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Time after manual corrections (HH:MM format)
            </p>
          </div>

          {booking.calculated_time !== undefined && (
            <div className="space-y-2">
              <Label>Calculated Time</Label>
              <Input
                value={minutesToTime(booking.calculated_time)}
                disabled
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Time after tolerance and rounding rules applied
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateBooking.isPending}>
              {updateBooking.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

### Update exports in `apps/web/src/components/timesheet/index.ts`:
```typescript
// ... existing exports
export { BookingEditDialog } from './booking-edit-dialog'
```

### Update DayView to use the dialog:
Add state and dialog integration in day-view.tsx.

### Verification
```bash
cd apps/web && pnpm build
pnpm dev
# Navigate to /timesheet, click edit on a booking
# Should see edit dialog with time fields
```

### Success Criteria
- Dialog opens when clicking edit on a booking
- Shows original, edited, and calculated times
- Can modify edited time
- Validation for HH:MM format
- Saves changes via API
- Dialog closes on success
- Build passes with no TypeScript errors

---

## Phase 12: Add Export Functionality

### Description
Add export buttons for PDF and CSV export of timesheet data.

### Files to Create

**`apps/web/src/components/timesheet/export-buttons.tsx`**
```typescript
'use client'

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  toISODate,
  formatDate,
  minutesToDuration,
} from '@/lib/time-utils'

interface ExportButtonsProps {
  viewMode: 'day' | 'week' | 'month'
  periodStart: Date
  periodEnd: Date
  employeeId?: string
  employeeName?: string
  data?: {
    dates: Date[]
    dailyValues: Map<string, {
      target_minutes?: number | null
      gross_minutes?: number | null
      break_minutes?: number | null
      net_minutes?: number | null
      balance_minutes?: number | null
    }>
  }
}

export function ExportButtons({
  viewMode,
  periodStart,
  periodEnd,
  employeeId,
  employeeName,
  data,
}: ExportButtonsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const generateCSV = () => {
    if (!data) return

    const headers = ['Date', 'Target', 'Gross', 'Breaks', 'Net', 'Balance']
    const rows = data.dates.map((date) => {
      const dateString = toISODate(date)
      const dv = data.dailyValues.get(dateString)
      return [
        formatDate(date, 'short'),
        minutesToDuration(dv?.target_minutes),
        minutesToDuration(dv?.gross_minutes),
        minutesToDuration(dv?.break_minutes),
        minutesToDuration(dv?.net_minutes),
        minutesToDuration(dv?.balance_minutes),
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(csv, `timesheet-${toISODate(periodStart)}.csv`, 'text/csv')
  }

  const generatePDF = async () => {
    // For now, generate a simple HTML-based printable view
    // In production, you might want to use a PDF library like jsPDF or server-side generation
    if (!data) return

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Timesheet Export</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f5f5f5; text-align: left; }
          td:first-child { text-align: left; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <h1>Timesheet: ${formatDate(periodStart, 'short')} - ${formatDate(periodEnd, 'short')}</h1>
        ${employeeName ? `<p>Employee: ${employeeName}</p>` : ''}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Target</th>
              <th>Gross</th>
              <th>Breaks</th>
              <th>Net</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${data.dates.map((date) => {
              const dateString = toISODate(date)
              const dv = data.dailyValues.get(dateString)
              return `
                <tr>
                  <td>${formatDate(date, 'short')}</td>
                  <td>${minutesToDuration(dv?.target_minutes)}</td>
                  <td>${minutesToDuration(dv?.gross_minutes)}</td>
                  <td>${minutesToDuration(dv?.break_minutes)}</td>
                  <td>${minutesToDuration(dv?.net_minutes)}</td>
                  <td>${minutesToDuration(dv?.balance_minutes)}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
        <div class="footer">
          Generated: ${new Date().toLocaleString('de-DE')}
        </div>
      </body>
      </html>
    `

    // Open print dialog
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExport = async (format: 'csv' | 'pdf') => {
    setIsExporting(true)
    try {
      if (format === 'csv') {
        generateCSV()
      } else {
        await generatePDF()
      }
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting || !data}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')}>
          <FileText className="h-4 w-4 mr-2" />
          Print / PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Update exports in `apps/web/src/components/timesheet/index.ts`:
```typescript
// ... existing exports
export { ExportButtons } from './export-buttons'
```

### Verification
```bash
cd apps/web && pnpm build
pnpm dev
# Navigate to /timesheet
# Click Export dropdown - should see CSV and PDF options
```

### Success Criteria
- Export dropdown shows CSV and PDF options
- CSV downloads with correct data
- PDF opens print dialog with formatted timesheet
- Disabled when no data available
- Build passes with no TypeScript errors

---

## Phase 13: Final Integration and Testing

### Description
Integrate all components into the final timesheet page, add loading states, and perform testing.

### Files to Update

**`apps/web/src/app/(dashboard)/timesheet/page.tsx`** - Final version:
```typescript
'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDailyValues } from '@/hooks/api'
import {
  toISODate,
  getWeekRange,
  getMonthRange,
  getWeekDates,
  getMonthDates,
  formatDate,
} from '@/lib/time-utils'
import {
  DayView,
  WeekView,
  MonthView,
  PeriodSummary,
  BookingEditDialog,
  ExportButtons,
} from '@/components/timesheet'

type ViewMode = 'day' | 'week' | 'month'

export default function TimesheetPage() {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [editingBooking, setEditingBooking] = useState<unknown | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  // TODO: Get employeeId from user context or selector
  const employeeId = user?.id

  // Calculate period dates based on view mode
  const periodDates = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return { start: currentDate, end: currentDate }
      case 'week':
        return getWeekRange(currentDate)
      case 'month':
        return getMonthRange(currentDate)
    }
  }, [viewMode, currentDate])

  // Fetch daily values for export
  const { data: dailyValuesData } = useDailyValues({
    employeeId,
    from: toISODate(periodDates.start),
    to: toISODate(periodDates.end),
    enabled: !!employeeId && viewMode !== 'day',
  })

  // Prepare export data
  const exportData = useMemo(() => {
    if (viewMode === 'day') return undefined

    const dates = viewMode === 'week'
      ? getWeekDates(currentDate)
      : getMonthDates(currentDate)

    const dailyValuesByDate = new Map<string, {
      target_minutes?: number | null
      gross_minutes?: number | null
      break_minutes?: number | null
      net_minutes?: number | null
      balance_minutes?: number | null
    }>()

    if (dailyValuesData?.data) {
      for (const dv of dailyValuesData.data) {
        dailyValuesByDate.set(dv.value_date, dv)
      }
    }

    return { dates, dailyValues: dailyValuesByDate }
  }, [viewMode, currentDate, dailyValuesData])

  // Navigation functions
  const navigatePrevious = () => {
    const newDate = new Date(currentDate)
    switch (viewMode) {
      case 'day':
        newDate.setDate(newDate.getDate() - 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() - 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() - 1)
        break
    }
    setCurrentDate(newDate)
  }

  const navigateNext = () => {
    const newDate = new Date(currentDate)
    switch (viewMode) {
      case 'day':
        newDate.setDate(newDate.getDate() + 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() + 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + 1)
        break
    }
    setCurrentDate(newDate)
  }

  const navigateToToday = () => {
    setCurrentDate(new Date())
  }

  const handleDayClick = (date: Date) => {
    setCurrentDate(date)
    setViewMode('day')
  }

  const handleEditBooking = (booking: unknown) => {
    setEditingBooking(booking)
    setIsEditDialogOpen(true)
  }

  const handleAddBooking = () => {
    // TODO: Open add booking dialog
    console.log('Add booking for', currentDate)
  }

  // Format period label for display
  const periodLabel = useMemo(() => {
    switch (viewMode) {
      case 'day':
        return formatDate(currentDate, 'long')
      case 'week':
        return `${formatDate(periodDates.start, 'short')} - ${formatDate(periodDates.end, 'short')}`
      case 'month':
        return currentDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    }
  }, [viewMode, currentDate, periodDates])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timesheet</h1>
          <p className="text-muted-foreground">
            View and manage your time entries
          </p>
        </div>

        {/* Export button */}
        <ExportButtons
          viewMode={viewMode}
          periodStart={periodDates.start}
          periodEnd={periodDates.end}
          employeeId={employeeId}
          employeeName={user?.display_name}
          data={exportData}
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* View mode tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Period navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToToday}>
            Today
          </Button>
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium min-w-[180px] text-center">
              {periodLabel}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content based on view mode */}
      <Card>
        <CardContent className="pt-6">
          {viewMode === 'day' && (
            <DayView
              date={currentDate}
              employeeId={employeeId}
              isEditable={true}
              onAddBooking={handleAddBooking}
              onEditBooking={handleEditBooking}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              startDate={periodDates.start}
              endDate={periodDates.end}
              employeeId={employeeId}
              onDayClick={handleDayClick}
            />
          )}
          {viewMode === 'month' && (
            <MonthView
              year={currentDate.getFullYear()}
              month={currentDate.getMonth() + 1}
              employeeId={employeeId}
              onDayClick={handleDayClick}
            />
          )}
        </CardContent>
      </Card>

      {/* Booking edit dialog */}
      <BookingEditDialog
        booking={editingBooking as never}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </div>
  )
}
```

### Verification Commands
```bash
cd apps/web

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build

# Run dev server and test manually
pnpm dev
```

### Manual Testing Checklist

1. **Navigation**
   - [ ] View mode toggle works (Day/Week/Month)
   - [ ] Previous/Next navigation works for all view modes
   - [ ] "Today" button navigates to current date
   - [ ] Clicking day in week/month view switches to day view

2. **Day View**
   - [ ] Shows booking pairs with times
   - [ ] Original/edited/calculated times shown when different
   - [ ] Daily summary shows totals
   - [ ] Error badges shown for days with issues
   - [ ] Edit button opens dialog (when applicable)

3. **Week View**
   - [ ] Shows 7 days in table format
   - [ ] Each row shows day name, date, time values
   - [ ] Week totals shown in footer
   - [ ] Error badges visible

4. **Month View**
   - [ ] Calendar grid displays correctly
   - [ ] Days show net time and balance
   - [ ] Monthly summary at bottom
   - [ ] Visual indicators for weekends/holidays

5. **Export**
   - [ ] CSV export downloads file
   - [ ] PDF/Print opens print dialog

6. **Responsiveness**
   - [ ] Mobile layout works
   - [ ] Tables scroll horizontally on small screens

### Success Criteria
- All view modes render correctly
- Period navigation works in all modes
- Data loads and displays from API
- Edit dialog opens and saves changes
- Export functions work
- No TypeScript errors
- No ESLint errors
- Build completes successfully

---

## Summary of All Files

### New Files to Create
```
apps/web/src/
├── components/
│   ├── ui/
│   │   ├── tabs.tsx              # Phase 1
│   │   ├── table.tsx             # Phase 1
│   │   └── select.tsx            # Phase 1
│   └── timesheet/
│       ├── index.ts              # Phase 5
│       ├── time-display.tsx      # Phase 5
│       ├── daily-summary.tsx     # Phase 5
│       ├── error-badge.tsx       # Phase 5
│       ├── booking-pair.tsx      # Phase 6
│       ├── booking-list.tsx      # Phase 6
│       ├── day-view.tsx          # Phase 7
│       ├── week-view.tsx         # Phase 8
│       ├── month-view.tsx        # Phase 9
│       ├── period-summary.tsx    # Phase 10
│       ├── booking-edit-dialog.tsx # Phase 11
│       └── export-buttons.tsx    # Phase 12
├── hooks/
│   └── api/
│       ├── use-daily-values.ts   # Phase 2
│       └── use-monthly-values.ts # Phase 2
├── lib/
│   └── time-utils.ts             # Phase 3
└── app/
    └── (dashboard)/
        └── timesheet/
            └── page.tsx          # Phase 4, 13
```

### Files to Modify
```
apps/web/src/hooks/api/index.ts   # Phase 2 - Add exports
```

### Total Files
- **New files**: 17
- **Modified files**: 1

---

## Estimated Implementation Time

| Phase | Description | Est. Time |
|-------|-------------|-----------|
| 1 | Install dependencies & UI primitives | 30 min |
| 2 | API hooks for daily/monthly values | 20 min |
| 3 | Time utility functions | 20 min |
| 4 | Timesheet page skeleton | 30 min |
| 5 | Time display components | 40 min |
| 6 | Booking pair components | 40 min |
| 7 | Day view implementation | 45 min |
| 8 | Week view implementation | 45 min |
| 9 | Month view implementation | 60 min |
| 10 | Period summary component | 20 min |
| 11 | Booking edit dialog | 40 min |
| 12 | Export functionality | 30 min |
| 13 | Final integration & testing | 60 min |

**Total estimated time**: ~8 hours

---

## Dependencies

### NPM Packages to Install
- `@radix-ui/react-tabs`
- `@radix-ui/react-select`

### Existing Packages Used
- `@tanstack/react-query`
- `lucide-react`
- `@radix-ui/react-tooltip`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-dialog` (Sheet)

---

## End of Implementation Plan
