# Implementation Plan: NOK-223 Vacation Balance Dashboard

## Context

This plan implements a comprehensive vacation balance dashboard for employees to view their vacation entitlement breakdown, transaction history, and upcoming approved vacation. The feature builds on existing infrastructure including the `useEmployeeVacationBalance` hook, vacation balance API endpoint, and absences API endpoint.

### Research Findings Summary

**Existing Assets:**
- `useEmployeeVacationBalance` hook exists at `/apps/web/src/hooks/api/use-vacation-balance.ts`
- `VacationBalanceCard` component exists for dashboard summary
- API endpoints exist: `GET /employees/{id}/vacation-balance` and `GET /employees/{id}/absences`
- All UI primitives (Table, Card, Select, Alert, Badge, Tabs) exist
- Generated TypeScript types for `VacationBalance` and `Absence` exist

**Assets to Create:**
- Vacation page at `/vacation`
- Absences API hook
- Balance breakdown component
- Transaction history table
- Year selector component
- Upcoming vacation section
- Carryover warning component

---

## Implementation Phases

### Phase 1: Create Absences API Hook

**Goal**: Create a reusable hook for fetching employee absences with optional date range filtering.

**Files**:
- Create: `/apps/web/src/hooks/api/use-absences.ts`
- Modify: `/apps/web/src/hooks/api/index.ts`

**Implementation**:

1. Create `/apps/web/src/hooks/api/use-absences.ts`:

```typescript
import { useApiQuery } from '@/hooks'

interface UseEmployeeAbsencesOptions {
  employeeId: string
  from?: string  // YYYY-MM-DD
  to?: string    // YYYY-MM-DD
  enabled?: boolean
}

/**
 * Hook to fetch absences for a specific employee.
 * Supports optional date range filtering.
 *
 * @example
 * ```tsx
 * const { data } = useEmployeeAbsences({
 *   employeeId: '123',
 *   from: '2026-01-01',
 *   to: '2026-12-31',
 * })
 * ```
 */
export function useEmployeeAbsences(options: UseEmployeeAbsencesOptions) {
  const { employeeId, from, to, enabled = true } = options

  return useApiQuery('/employees/{id}/absences', {
    path: { id: employeeId },
    params: { from, to },
    enabled: enabled && !!employeeId,
  })
}
```

2. Add export to `/apps/web/src/hooks/api/index.ts`:

```typescript
// Absences
export { useEmployeeAbsences } from './use-absences'
```

**Verification**:
- [ ] Hook compiles without TypeScript errors
- [ ] Hook is exported from barrel file
- [ ] Test hook in browser console or temporary component

---

### Phase 2: Create Year Selector Component

**Goal**: Create a reusable year selector dropdown for navigating between years.

**Files**:
- Create: `/apps/web/src/components/vacation/year-selector.tsx`

**Implementation**:

```typescript
'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface YearSelectorProps {
  value: number
  onChange: (year: number) => void
  /** Years to show before and after current year */
  range?: number
  className?: string
}

/**
 * Year selector dropdown for vacation/timesheet views.
 */
export function YearSelector({
  value,
  onChange,
  range = 5,
  className,
}: YearSelectorProps) {
  const currentYear = new Date().getFullYear()

  // Generate year options: current year +/- range
  const years: number[] = []
  for (let y = currentYear - range; y <= currentYear + 1; y++) {
    years.push(y)
  }

  return (
    <Select
      value={value.toString()}
      onValueChange={(v) => onChange(parseInt(v, 10))}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select year" />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

**Verification**:
- [ ] Component renders without errors
- [ ] Year selection triggers onChange callback
- [ ] Current year is included in options

---

### Phase 3: Create Balance Breakdown Component

**Goal**: Create a detailed vacation balance breakdown card showing all entitlement components with a visual progress bar.

**Files**:
- Create: `/apps/web/src/components/vacation/balance-breakdown.tsx`

**Implementation**:

```typescript
'use client'

import { Palmtree, AlertCircle, RefreshCw, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useEmployeeVacationBalance } from '@/hooks/api'

interface BalanceBreakdownProps {
  employeeId: string
  year: number
  className?: string
}

interface BreakdownRowProps {
  label: string
  value: number
  prefix?: '+' | '-' | ''
  tooltip?: string
  highlight?: boolean
}

function BreakdownRow({
  label,
  value,
  prefix = '',
  tooltip,
  highlight = false,
}: BreakdownRowProps) {
  const displayValue = prefix
    ? `${prefix}${Math.abs(value)}`
    : value.toString()

  return (
    <div
      className={cn(
        'flex items-center justify-between py-2',
        highlight && 'font-medium'
      )}
    >
      <div className="flex items-center gap-1">
        <span className={highlight ? 'text-foreground' : 'text-muted-foreground'}>
          {label}
        </span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <span className={cn(
        highlight ? 'text-foreground' : 'text-muted-foreground',
        value < 0 && 'text-destructive'
      )}>
        {displayValue} days
      </span>
    </div>
  )
}

export function BalanceBreakdown({
  employeeId,
  year,
  className,
}: BalanceBreakdownProps) {
  const { data, isLoading, error, refetch } = useEmployeeVacationBalance(
    employeeId,
    year,
    !!employeeId
  )

  if (isLoading) {
    return <BalanceBreakdownSkeleton className={className} />
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palmtree className="h-5 w-5" />
            Vacation Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">Failed to load balance</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palmtree className="h-5 w-5" />
            Vacation Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-muted-foreground">
            No vacation data for {year}
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalEntitlement = data.total_entitlement ?? 0
  const remainingDays = data.remaining_days ?? 0
  const usedDays = data.used_days ?? 0
  const plannedDays = data.planned_days ?? 0
  const baseEntitlement = data.base_entitlement ?? 0
  const additionalEntitlement = data.additional_entitlement ?? 0
  const carryover = data.carryover_from_previous ?? 0
  const adjustment = data.manual_adjustment ?? 0

  // Progress bar calculations
  const usedPercent = totalEntitlement > 0 ? (usedDays / totalEntitlement) * 100 : 0
  const plannedPercent = totalEntitlement > 0 ? (plannedDays / totalEntitlement) * 100 : 0

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palmtree className="h-5 w-5" />
          Vacation Balance {year}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Large remaining days display */}
        <div className="text-center">
          <div className="text-4xl font-bold">{remainingDays}</div>
          <div className="text-sm text-muted-foreground">days available</div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="flex h-full">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${usedPercent}%` }}
              />
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: `${plannedPercent}%` }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {usedDays} used
            </span>
            {plannedDays > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                {plannedDays} planned
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted" />
              {remainingDays} available
            </span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="divide-y">
          <BreakdownRow
            label="Base Entitlement"
            value={baseEntitlement}
            tooltip="Annual vacation entitlement based on contract"
          />
          {additionalEntitlement > 0 && (
            <BreakdownRow
              label="Additional Days"
              value={additionalEntitlement}
              prefix="+"
              tooltip="Bonus days for age, tenure, or disability"
            />
          )}
          {carryover > 0 && (
            <BreakdownRow
              label="Carryover"
              value={carryover}
              prefix="+"
              tooltip="Unused days from previous year"
            />
          )}
          {adjustment !== 0 && (
            <BreakdownRow
              label="Adjustments"
              value={adjustment}
              prefix={adjustment > 0 ? '+' : '-'}
              tooltip="Manual adjustments by administrator"
            />
          )}
          <BreakdownRow
            label="Total Entitlement"
            value={totalEntitlement}
            highlight
          />
          <BreakdownRow
            label="Used"
            value={-usedDays}
            prefix="-"
          />
          {plannedDays > 0 && (
            <BreakdownRow
              label="Planned"
              value={-plannedDays}
              prefix="-"
            />
          )}
          <BreakdownRow
            label="Available"
            value={remainingDays}
            highlight
          />
        </div>
      </CardContent>
    </Card>
  )
}

function BalanceBreakdownSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Verification**:
- [ ] Component renders balance breakdown correctly
- [ ] Progress bar shows used/planned/available portions
- [ ] Loading skeleton displays during fetch
- [ ] Error state with retry button works
- [ ] Tooltips show on info icons

---

### Phase 4: Create Carryover Warning Component

**Goal**: Create an alert component to warn about expiring carryover vacation.

**Files**:
- Create: `/apps/web/src/components/vacation/carryover-warning.tsx`

**Implementation**:

```typescript
'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface CarryoverWarningProps {
  carryoverDays: number
  expiresAt: string | null | undefined
  className?: string
}

/**
 * Warning alert for expiring carryover vacation days.
 * Only displays if there are carryover days with an expiration date.
 */
export function CarryoverWarning({
  carryoverDays,
  expiresAt,
  className,
}: CarryoverWarningProps) {
  if (!carryoverDays || carryoverDays <= 0 || !expiresAt) {
    return null
  }

  const expirationDate = new Date(expiresAt)
  const today = new Date()
  const daysUntilExpiry = Math.ceil(
    (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Only show warning if expiring within 90 days
  if (daysUntilExpiry > 90) {
    return null
  }

  const isUrgent = daysUntilExpiry <= 30
  const formattedDate = expirationDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Alert
      variant={isUrgent ? 'destructive' : 'default'}
      className={className}
    >
      {isUrgent ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Clock className="h-4 w-4" />
      )}
      <AlertTitle>
        {isUrgent ? 'Carryover Expiring Soon' : 'Carryover Expiration Notice'}
      </AlertTitle>
      <AlertDescription>
        You have {carryoverDays} carryover {carryoverDays === 1 ? 'day' : 'days'}{' '}
        that {carryoverDays === 1 ? 'expires' : 'expire'} on {formattedDate}
        {daysUntilExpiry > 0 ? (
          <> ({daysUntilExpiry} {daysUntilExpiry === 1 ? 'day' : 'days'} remaining)</>
        ) : (
          <> (today!)</>
        )}
        . Use {carryoverDays === 1 ? 'it' : 'them'} or {carryoverDays === 1 ? 'it' : 'they'} will be forfeited.
      </AlertDescription>
    </Alert>
  )
}
```

**Verification**:
- [ ] Warning displays when carryover exists with expiration date
- [ ] Warning is hidden when no carryover or expiration > 90 days
- [ ] Urgent styling (red) applies within 30 days
- [ ] Date formatting is correct

---

### Phase 5: Create Transaction History Component

**Goal**: Create a table showing vacation transaction history (absences with vacation category).

**Files**:
- Create: `/apps/web/src/components/vacation/transaction-history.tsx`

**Implementation**:

```typescript
'use client'

import { Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeAbsences } from '@/hooks/api'
import { formatDisplayDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface TransactionHistoryProps {
  employeeId: string
  year: number
  className?: string
}

const statusStyles: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn('capitalize', statusStyles[status] ?? '')}
    >
      {status}
    </Badge>
  )
}

export function TransactionHistory({
  employeeId,
  year,
  className,
}: TransactionHistoryProps) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const { data, isLoading, error } = useEmployeeAbsences({
    employeeId,
    from,
    to,
    enabled: !!employeeId,
  })

  // Filter to vacation-related absences only
  const vacationAbsences = (data?.data ?? []).filter(
    (absence: Absence) => absence.absence_type?.category === 'vacation'
  )

  // Sort by date descending (most recent first)
  const sortedAbsences = [...vacationAbsences].sort((a, b) => {
    const dateA = a.absence_date ? new Date(a.absence_date).getTime() : 0
    const dateB = b.absence_date ? new Date(b.absence_date).getTime() : 0
    return dateB - dateA
  })

  if (isLoading) {
    return <TransactionHistorySkeleton className={className} />
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vacation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load vacation history
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Vacation History {year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedAbsences.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            No vacation records for {year}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAbsences.map((absence: Absence) => (
                <TableRow key={absence.id}>
                  <TableCell className="font-medium">
                    {absence.absence_date
                      ? formatDisplayDate(new Date(absence.absence_date), 'short')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {absence.absence_type?.name ?? 'Vacation'}
                  </TableCell>
                  <TableCell className="text-right">
                    {absence.duration === 1
                      ? '1 day'
                      : absence.duration === 0.5
                        ? 'Half day'
                        : `${absence.duration} days`}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={absence.status ?? 'pending'} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {absence.notes ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TransactionHistorySkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 flex-1" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Verification**:
- [ ] Table displays vacation absences for selected year
- [ ] Only vacation category absences are shown
- [ ] Absences are sorted by date (newest first)
- [ ] Status badges show correct colors
- [ ] Empty state displays when no records

---

### Phase 6: Create Upcoming Vacation Component

**Goal**: Create a component showing upcoming approved vacation.

**Files**:
- Create: `/apps/web/src/components/vacation/upcoming-vacation.tsx`

**Implementation**:

```typescript
'use client'

import { CalendarCheck, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeAbsences } from '@/hooks/api'
import { formatDisplayDate, formatDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface UpcomingVacationProps {
  employeeId: string
  className?: string
}

export function UpcomingVacation({
  employeeId,
  className,
}: UpcomingVacationProps) {
  const today = new Date()
  const from = formatDate(today)
  // Look ahead 6 months
  const toDate = new Date(today)
  toDate.setMonth(toDate.getMonth() + 6)
  const to = formatDate(toDate)

  const { data, isLoading, error } = useEmployeeAbsences({
    employeeId,
    from,
    to,
    enabled: !!employeeId,
  })

  // Filter to upcoming approved vacation only
  const upcomingVacation = (data?.data ?? [])
    .filter(
      (absence: Absence) =>
        absence.absence_type?.category === 'vacation' &&
        (absence.status === 'approved' || absence.status === 'pending')
    )
    .sort((a, b) => {
      const dateA = a.absence_date ? new Date(a.absence_date).getTime() : 0
      const dateB = b.absence_date ? new Date(b.absence_date).getTime() : 0
      return dateA - dateB
    })

  // Group consecutive days together
  const groupedVacations = groupConsecutiveDays(upcomingVacation)

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            Upcoming Vacation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          Upcoming Vacation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groupedVacations.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            No upcoming vacation scheduled
          </p>
        ) : (
          <div className="space-y-3">
            {groupedVacations.slice(0, 5).map((group, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="font-medium">
                    {formatDisplayDate(new Date(group.startDate), 'short')}
                    {group.endDate !== group.startDate && (
                      <>
                        <ArrowRight className="mx-1 inline h-3 w-3" />
                        {formatDisplayDate(new Date(group.endDate), 'short')}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {group.totalDays} {group.totalDays === 1 ? 'day' : 'days'}
                  </span>
                  {group.hasPending && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface VacationGroup {
  startDate: string
  endDate: string
  totalDays: number
  hasPending: boolean
}

function groupConsecutiveDays(absences: Absence[]): VacationGroup[] {
  if (absences.length === 0) return []

  const groups: VacationGroup[] = []
  let currentGroup: VacationGroup | null = null

  for (const absence of absences) {
    if (!absence.absence_date) continue

    const date = absence.absence_date
    const duration = absence.duration ?? 1
    const isPending = absence.status === 'pending'

    if (!currentGroup) {
      currentGroup = {
        startDate: date,
        endDate: date,
        totalDays: duration,
        hasPending: isPending,
      }
      continue
    }

    // Check if this date is consecutive (next day)
    const lastDate = new Date(currentGroup.endDate)
    const thisDate = new Date(date)
    const diffDays = Math.floor(
      (thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays <= 1) {
      // Consecutive - extend current group
      currentGroup.endDate = date
      currentGroup.totalDays += duration
      currentGroup.hasPending = currentGroup.hasPending || isPending
    } else {
      // Not consecutive - start new group
      groups.push(currentGroup)
      currentGroup = {
        startDate: date,
        endDate: date,
        totalDays: duration,
        hasPending: isPending,
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup)
  }

  return groups
}
```

**Verification**:
- [ ] Shows upcoming approved and pending vacation
- [ ] Consecutive days are grouped together
- [ ] Pending status is indicated with badge
- [ ] Empty state shows when no upcoming vacation
- [ ] Only shows next 6 months

---

### Phase 7: Create Vacation Balance Page

**Goal**: Assemble all components into the main vacation balance page with year navigation.

**Files**:
- Create: `/apps/web/src/app/(dashboard)/vacation/page.tsx`
- Create: `/apps/web/src/components/vacation/index.ts`
- Modify: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

**Implementation**:

1. Create barrel file `/apps/web/src/components/vacation/index.ts`:

```typescript
export { YearSelector } from './year-selector'
export { BalanceBreakdown } from './balance-breakdown'
export { CarryoverWarning } from './carryover-warning'
export { TransactionHistory } from './transaction-history'
export { UpcomingVacation } from './upcoming-vacation'
```

2. Create main page `/apps/web/src/app/(dashboard)/vacation/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeVacationBalance } from '@/hooks/api'
import {
  YearSelector,
  BalanceBreakdown,
  CarryoverWarning,
  TransactionHistory,
  UpcomingVacation,
} from '@/components/vacation'

export default function VacationPage() {
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employee_id
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Fetch balance to get carryover info for warning
  const { data: balance } = useEmployeeVacationBalance(
    employeeId ?? '',
    selectedYear,
    !!employeeId
  )

  if (authLoading) {
    return <VacationPageSkeleton />
  }

  if (!employeeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">
          No employee record linked to your account.
        </p>
        <p className="text-sm text-muted-foreground">
          Please contact your administrator.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vacation Balance</h1>
          <p className="text-muted-foreground">
            View your vacation entitlement and history
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/absences">
              <Plus className="mr-2 h-4 w-4" />
              Request Vacation
            </Link>
          </Button>
        </div>
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedYear((y) => y - 1)}
          aria-label="Previous year"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <YearSelector
          value={selectedYear}
          onChange={setSelectedYear}
          className="w-32"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedYear((y) => y + 1)}
          disabled={selectedYear >= currentYear + 1}
          aria-label="Next year"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {selectedYear !== currentYear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedYear(currentYear)}
          >
            Current Year
          </Button>
        )}
      </div>

      {/* Carryover warning */}
      {selectedYear === currentYear && balance && (
        <CarryoverWarning
          carryoverDays={balance.carryover_from_previous ?? 0}
          expiresAt={balance.carryover_expires_at}
        />
      )}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Balance breakdown - takes 1 column */}
        <BalanceBreakdown
          employeeId={employeeId}
          year={selectedYear}
        />

        {/* Right side content - takes 2 columns */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming vacation - only show for current year */}
          {selectedYear === currentYear && (
            <UpcomingVacation employeeId={employeeId} />
          )}

          {/* Transaction history */}
          <TransactionHistory
            employeeId={employeeId}
            year={selectedYear}
          />
        </div>
      </div>
    </div>
  )
}

function VacationPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-10" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96" />
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  )
}
```

3. Update sidebar navigation in `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`:

Add a sub-item under Absences or add Vacation as a separate item:

```typescript
// In the 'Main' section, add after Absences:
{
  title: 'Vacation',
  href: '/vacation',
  icon: Palmtree,
  description: 'View vacation balance and history',
},
```

Note: Import `Palmtree` from lucide-react at the top of the file.

**Verification**:
- [ ] Page renders at `/vacation`
- [ ] Year selector navigation works
- [ ] Carryover warning shows when applicable
- [ ] Balance breakdown displays correctly
- [ ] Transaction history shows for selected year
- [ ] Upcoming vacation shows for current year only
- [ ] "Request Vacation" button links to absences page
- [ ] Navigation item appears in sidebar

---

### Phase 8: Final Polish and Testing

**Goal**: Ensure all components work together and handle edge cases.

**Files**:
- Review all created files for consistency

**Implementation**:

1. Test all loading states
2. Test error states with network failures
3. Test with no vacation data
4. Test year switching
5. Verify responsive layout on mobile
6. Test keyboard navigation
7. Verify accessibility (ARIA labels, focus states)

**Verification**:
- [ ] All loading skeletons display correctly
- [ ] Error states show retry options
- [ ] Empty states have clear messaging
- [ ] Layout is responsive on mobile
- [ ] All interactive elements are keyboard accessible
- [ ] No TypeScript errors in build
- [ ] No console errors during runtime

---

## Success Criteria

From ticket NOK-223:

- [x] Create vacation overview page
- [x] Display current year balance breakdown (entitlement, carryover, adjustments, taken, available)
- [x] Show visual progress bar of usage
- [x] Create transaction history table
- [x] Add year selector for historical data
- [x] Show upcoming approved vacation
- [x] Display carryover expiration warning if applicable
- [x] Add link to request new vacation
- [x] Create balance forecast (if requests pending) - Shown as "planned" in balance

---

## Technical Decisions

1. **Page Location**: Created as `/vacation` rather than `/absences/vacation` for simplicity and direct navigation. The existing `/absences` page will be for requesting absences, while `/vacation` focuses on balance viewing.

2. **Absences Hook**: Created a new hook rather than extending vacation balance hook to maintain separation of concerns. The absences endpoint returns different data (individual absence records vs. aggregated balance).

3. **Year Range**: Year selector shows current year +/- 5 years, with restriction on future years beyond next year (since balance data wouldn't exist).

4. **Carryover Warning**: Only shows within 90 days of expiration, with urgent styling at 30 days. This prevents noise while ensuring visibility when action is needed.

5. **Upcoming Vacation Grouping**: Consecutive vacation days are grouped together for better readability, showing date ranges instead of individual days.

6. **Component Structure**: Each major section is its own component for reusability and testability. All components are exported from a barrel file for clean imports.

---

## File Summary

**New Files (9)**:
- `/apps/web/src/hooks/api/use-absences.ts`
- `/apps/web/src/components/vacation/year-selector.tsx`
- `/apps/web/src/components/vacation/balance-breakdown.tsx`
- `/apps/web/src/components/vacation/carryover-warning.tsx`
- `/apps/web/src/components/vacation/transaction-history.tsx`
- `/apps/web/src/components/vacation/upcoming-vacation.tsx`
- `/apps/web/src/components/vacation/index.ts`
- `/apps/web/src/app/(dashboard)/vacation/page.tsx`

**Modified Files (2)**:
- `/apps/web/src/hooks/api/index.ts` - Add absences export
- `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add Vacation nav item

---

*Plan created: 2026-01-26*
