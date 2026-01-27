# NOK-233: Monthly Evaluation View Implementation Plan

## Overview

Implement a monthly evaluation view that allows users (primarily admins/managers) to review employee monthly time summaries, view daily breakdowns, manage month closing workflow, and export data. The view provides comprehensive time tracking overview with flextime balance tracking, absence summaries, and error highlighting.

## Current State Analysis

### Existing Components Available
- **Month view calendar** (`/apps/web/src/components/timesheet/month-view.tsx`): Calendar grid with daily values, already fetches monthly values
- **Week view table** (`/apps/web/src/components/timesheet/week-view.tsx`): Table pattern with daily breakdown, totals in footer
- **Time display components**: `TimeDisplay`, `DailySummary`, `ErrorBadge` - all ready to use
- **Balance breakdown** (`/apps/web/src/components/vacation/balance-breakdown.tsx`): Card pattern with breakdown rows and progress bar
- **Export buttons** (`/apps/web/src/components/timesheet/export-buttons.tsx`): CSV/PDF export pattern
- **Confirm dialog** (`/apps/web/src/components/ui/confirm-dialog.tsx`): For close/reopen confirmations

### Existing API Hooks
- `useMonthlyValues({ employeeId, year, month, status, departmentId })` - List with filters
- `useMonthlyValue(id)` - Single monthly value
- `useCloseMonthlyValue()` - Close mutation
- `useReopenMonthlyValue()` - Reopen mutation
- `useDailyValues({ employeeId, from, to })` - Daily values for breakdown

### Backend Support
- Monthly evaluation service with close/reopen functionality exists
- Monthly values model includes flextime tracking, absence summary, and status fields
- OpenAPI endpoints defined for all operations

### What's Missing
- Monthly evaluation page (`/monthly-evaluation`)
- Summary cards for flextime, time totals, absences
- Daily breakdown table specific to evaluation view
- Close month sheet with recalculation option
- Reopen month sheet with required reason
- Employee selector for admin view
- Navigation entry in sidebar

## Desired End State

A fully functional monthly evaluation page at `/monthly-evaluation` that:
1. Shows month/year navigation with employee selector (for admins)
2. Displays summary cards for time totals, flextime balance, and absences
3. Provides daily breakdown table with error highlighting
4. Supports month close workflow with optional recalculation
5. Supports month reopen workflow with required reason
6. Allows CSV/PDF export of monthly data
7. Shows month status badge (open, calculated, closed, exported)

### Verification
- Navigate to `/monthly-evaluation` and see current month data
- Change month/year and see data update
- Admin can select different employees
- Click "Close Month" and confirm to close
- See status change to "closed"
- Click "Reopen" on closed month, provide reason, confirm
- Export CSV/PDF with correct data

## What We're NOT Doing

- Batch close multiple employees at once (future feature)
- Approval workflow for monthly values (just close/reopen)
- Editing individual daily values from this view (use timesheet)
- Historical audit log display (backend tracks but UI doesn't show)
- Comparison view between months
- Charts/graphs visualization

## Implementation Approach

Build the feature in 6 phases:
1. Create page structure with navigation
2. Build summary card components
3. Implement daily breakdown table
4. Add close/reopen workflow
5. Integrate export functionality
6. Polish and error handling

---

## Phase 1: Page Structure and Navigation

### Overview
Create the basic monthly evaluation page with month/year navigation and employee selector. Add navigation entry to sidebar.

### Changes Required:

#### 1. Add Navigation Entry
**File**: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**: Add "Monthly Evaluation" item to the Main section (for employees) and Management section (for admin multi-employee view)

```typescript
// Add to Main section items array, after 'Vacation':
{
  title: 'Monthly Evaluation',
  href: '/monthly-evaluation',
  icon: FileText,
  description: 'Monthly time evaluation and closing',
},
```

#### 2. Create Monthly Evaluation Page
**File**: `/apps/web/src/app/(dashboard)/monthly-evaluation/page.tsx`
**Changes**: Create new page with month/year navigation and employee selector

```tsx
'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Lock, Unlock, Download } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks/use-has-role'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonthlyValues, useDailyValues, useEmployees } from '@/hooks/api'
import { formatDate, getMonthRange, getMonthDates } from '@/lib/time-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MonthlySummaryCards } from '@/components/monthly-evaluation/monthly-summary-cards'
import { DailyBreakdownTable } from '@/components/monthly-evaluation/daily-breakdown-table'
import { CloseMonthSheet } from '@/components/monthly-evaluation/close-month-sheet'
import { ReopenMonthSheet } from '@/components/monthly-evaluation/reopen-month-sheet'
import { MonthlyExportButtons } from '@/components/monthly-evaluation/monthly-export-buttons'

const statusStyles: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  calculated: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  closed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  exported: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export default function MonthlyEvaluationPage() {
  const { user, isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // For regular users, use their employee_id; for admin, allow selection
  const userEmployeeId = user?.employee_id
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)
  const effectiveEmployeeId = isAdmin ? selectedEmployeeId : userEmployeeId

  // Date state
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)

  // Sheet states
  const [closeSheetOpen, setCloseSheetOpen] = useState(false)
  const [reopenSheetOpen, setReopenSheetOpen] = useState(false)

  // Fetch employees for admin selector
  const { data: employeesData } = useEmployees({
    enabled: isAdmin,
    limit: 250,
  })

  // Calculate date range for the month
  const { start: monthStart, end: monthEnd } = useMemo(() => {
    return getMonthRange(new Date(selectedYear, selectedMonth - 1, 1))
  }, [selectedYear, selectedMonth])

  // Fetch monthly value
  const { data: monthlyData, isLoading: monthlyLoading } = useMonthlyValues({
    employeeId: effectiveEmployeeId,
    year: selectedYear,
    month: selectedMonth,
    enabled: !!effectiveEmployeeId,
  })

  // Fetch daily values for breakdown
  const { data: dailyData, isLoading: dailyLoading } = useDailyValues({
    employeeId: effectiveEmployeeId,
    from: formatDate(monthStart),
    to: formatDate(monthEnd),
    enabled: !!effectiveEmployeeId,
  })

  const monthlyValue = monthlyData?.data?.[0]
  const dailyValues = dailyData?.data ?? []

  // Navigation handlers
  const navigatePrevious = () => {
    if (selectedMonth === 1) {
      setSelectedYear(y => y - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const navigateNext = () => {
    if (selectedMonth === 12) {
      setSelectedYear(y => y + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  const navigateToCurrent = () => {
    setSelectedYear(currentDate.getFullYear())
    setSelectedMonth(currentDate.getMonth() + 1)
  }

  // Format month label
  const monthLabel = new Date(selectedYear, selectedMonth - 1, 1)
    .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  // Check if we can navigate to next month
  const canNavigateNext = selectedYear < currentDate.getFullYear() ||
    (selectedYear === currentDate.getFullYear() && selectedMonth < currentDate.getMonth() + 1)

  if (authLoading) {
    return <MonthlyEvaluationSkeleton />
  }

  if (!isAdmin && !userEmployeeId) {
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
          <h1 className="text-2xl font-bold tracking-tight">Monthly Evaluation</h1>
          <p className="text-muted-foreground">
            Review monthly time summary and close periods
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          {monthlyValue && (
            <Badge className={statusStyles[monthlyValue.status ?? 'open']}>
              {monthlyValue.status ?? 'open'}
            </Badge>
          )}

          {/* Action buttons */}
          {monthlyValue?.status === 'closed' ? (
            <Button variant="outline" size="sm" onClick={() => setReopenSheetOpen(true)}>
              <Unlock className="h-4 w-4 mr-2" />
              Reopen
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCloseSheetOpen(true)} disabled={!monthlyValue}>
              <Lock className="h-4 w-4 mr-2" />
              Close Month
            </Button>
          )}

          {/* Export */}
          <MonthlyExportButtons
            monthlyValue={monthlyValue}
            dailyValues={dailyValues}
            year={selectedYear}
            month={selectedMonth}
            employeeName={user?.display_name}
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Employee selector (admin only) */}
        {isAdmin && (
          <Select
            value={selectedEmployeeId ?? ''}
            onValueChange={setSelectedEmployeeId}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select employee..." />
            </SelectTrigger>
            <SelectContent>
              {employeesData?.data?.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigateToCurrent}>
            Current
          </Button>
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium min-w-[160px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={navigateNext}
              disabled={!canNavigateNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {effectiveEmployeeId && (
        <MonthlySummaryCards
          monthlyValue={monthlyValue}
          isLoading={monthlyLoading}
        />
      )}

      {/* Daily breakdown table */}
      {effectiveEmployeeId && (
        <Card>
          <CardContent className="pt-6">
            <DailyBreakdownTable
              dailyValues={dailyValues}
              isLoading={dailyLoading}
              year={selectedYear}
              month={selectedMonth}
            />
          </CardContent>
        </Card>
      )}

      {/* Close month sheet */}
      <CloseMonthSheet
        open={closeSheetOpen}
        onOpenChange={setCloseSheetOpen}
        monthlyValueId={monthlyValue?.id}
        monthLabel={monthLabel}
      />

      {/* Reopen month sheet */}
      <ReopenMonthSheet
        open={reopenSheetOpen}
        onOpenChange={setReopenSheetOpen}
        monthlyValueId={monthlyValue?.id}
        monthLabel={monthLabel}
      />
    </div>
  )
}

function MonthlyEvaluationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-[250px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
```

#### 3. Create Component Index
**File**: `/apps/web/src/components/monthly-evaluation/index.ts`
**Changes**: Create barrel export file

```typescript
export { MonthlySummaryCards } from './monthly-summary-cards'
export { DailyBreakdownTable } from './daily-breakdown-table'
export { CloseMonthSheet } from './close-month-sheet'
export { ReopenMonthSheet } from './reopen-month-sheet'
export { MonthlyExportButtons } from './monthly-export-buttons'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`
- [ ] Build succeeds: `cd apps/web && pnpm build`

#### Manual Verification:
- [ ] Navigate to `/monthly-evaluation` - page loads without errors
- [ ] Navigation item appears in sidebar
- [ ] Month navigation buttons work (previous/next/current)
- [ ] Admin sees employee selector dropdown
- [ ] Regular user does not see employee selector

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Summary Card Components

### Overview
Create summary cards displaying time totals, flextime balance, and absence summary.

### Changes Required:

#### 1. Monthly Summary Cards Component
**File**: `/apps/web/src/components/monthly-evaluation/monthly-summary-cards.tsx`
**Changes**: Create component with 4 summary cards

```tsx
'use client'

import { Clock, TrendingUp, CalendarOff, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from '@/components/timesheet'
import { cn } from '@/lib/utils'

interface MonthlyValueData {
  id: string
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  balance_minutes?: number | null
  overtime_minutes?: number | null
  undertime_minutes?: number | null
  working_days?: number | null
  worked_days?: number | null
  absence_days?: number | null
  holiday_days?: number | null
  account_balances?: Record<string, number> | null
  status?: string | null
}

interface MonthlySummaryCardsProps {
  monthlyValue?: MonthlyValueData | null
  isLoading: boolean
}

export function MonthlySummaryCards({
  monthlyValue,
  isLoading,
}: MonthlySummaryCardsProps) {
  if (isLoading) {
    return <SummaryCardsSkeleton />
  }

  if (!monthlyValue) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-4">
                No data available
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const targetMinutes = monthlyValue.target_minutes ?? 0
  const netMinutes = monthlyValue.net_minutes ?? 0
  const balanceMinutes = monthlyValue.balance_minutes ?? 0
  const workingDays = monthlyValue.working_days ?? 0
  const workedDays = monthlyValue.worked_days ?? 0
  const absenceDays = monthlyValue.absence_days ?? 0
  const holidayDays = monthlyValue.holiday_days ?? 0

  // Get flextime from account_balances if available
  const flextimeBalance = monthlyValue.account_balances?.flextime ?? balanceMinutes

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Time Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Time Summary</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target</span>
              <TimeDisplay value={targetMinutes} format="duration" className="font-medium" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Worked</span>
              <TimeDisplay value={netMinutes} format="duration" className="font-medium" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Balance</span>
              <TimeDisplay value={balanceMinutes} format="balance" className="text-lg font-bold" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flextime Balance Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Flextime Balance</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-2">
            <TimeDisplay
              value={flextimeBalance}
              format="balance"
              className={cn(
                'text-3xl font-bold',
                flextimeBalance > 0 && 'text-green-600 dark:text-green-400',
                flextimeBalance < 0 && 'text-red-600 dark:text-red-400'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {flextimeBalance >= 0 ? 'Credit' : 'Deficit'}
            </p>
          </div>
          {/* Balance indicator bar */}
          <div className="mt-3 relative h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'absolute top-0 h-full transition-all',
                flextimeBalance >= 0 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'
              )}
              style={{
                width: `${Math.min(Math.abs(flextimeBalance) / 60 / 8 * 50, 50)}%`
              }}
            />
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-border -translate-x-1/2" />
          </div>
        </CardContent>
      </Card>

      {/* Working Days Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Working Days</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-center py-2">
            <div className="text-3xl font-bold">
              {workedDays} <span className="text-lg text-muted-foreground">/ {workingDays}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">days worked</p>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${workingDays > 0 ? (workedDays / workingDays) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Absences Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Absences</CardTitle>
          <CalendarOff className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Absence days</span>
              <span className="font-medium">{absenceDays}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Holidays</span>
              <span className="font-medium">{holidayDays}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Total non-work</span>
              <span className="text-lg font-bold">{absenceDays + holidayDays}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Summary cards display with correct data
- [ ] Time values format correctly (hours:minutes)
- [ ] Balance shows correct color (green positive, red negative)
- [ ] Working days progress bar is accurate
- [ ] Loading skeleton displays during data fetch

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Daily Breakdown Table

### Overview
Create a table showing daily values for the month with error highlighting and row click navigation.

### Changes Required:

#### 1. Daily Breakdown Table Component
**File**: `/apps/web/src/components/monthly-evaluation/daily-breakdown-table.tsx`
**Changes**: Create table component with daily values

```tsx
'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
import { TimeDisplay, ErrorBadge } from '@/components/timesheet'
import {
  formatDate,
  formatDisplayDate,
  getMonthDates,
  isToday,
  isWeekend,
} from '@/lib/time-utils'

interface DailyValueData {
  id: string
  value_date: string
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  balance_minutes?: number | null
  is_holiday?: boolean | null
  is_absence?: boolean | null
  has_errors?: boolean | null
  errors?: Array<{ id: string; error_type: string; message: string; severity?: 'warning' | 'error' }> | null
}

interface DailyBreakdownTableProps {
  dailyValues: DailyValueData[]
  isLoading: boolean
  year: number
  month: number
}

export function DailyBreakdownTable({
  dailyValues,
  isLoading,
  year,
  month,
}: DailyBreakdownTableProps) {
  const router = useRouter()

  // Get all dates in the month
  const monthDates = useMemo(() => {
    return getMonthDates(new Date(year, month - 1, 1))
  }, [year, month])

  // Create a map for quick lookup
  const dailyValuesByDate = useMemo(() => {
    const map = new Map<string, DailyValueData>()
    for (const dv of dailyValues) {
      map.set(dv.value_date, dv)
    }
    return map
  }, [dailyValues])

  // Calculate totals
  const totals = useMemo(() => {
    let target = 0
    let gross = 0
    let breaks = 0
    let net = 0
    let balance = 0
    let errorCount = 0

    for (const dv of dailyValues) {
      target += dv.target_minutes ?? 0
      gross += dv.gross_minutes ?? 0
      breaks += dv.break_minutes ?? 0
      net += dv.net_minutes ?? 0
      balance += dv.balance_minutes ?? 0
      if (dv.has_errors) errorCount++
    }

    return { target, gross, breaks, net, balance, errorCount }
  }, [dailyValues])

  const handleRowClick = (date: Date) => {
    // Navigate to timesheet day view
    const dateString = formatDate(date)
    router.push(`/timesheet?date=${dateString}&view=day`)
  }

  if (isLoading) {
    return <DailyBreakdownSkeleton />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Daily Breakdown</h3>
        {totals.errorCount > 0 && (
          <Badge variant="destructive" className="ml-2">
            {totals.errorCount} day{totals.errorCount !== 1 ? 's' : ''} with errors
          </Badge>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Breaks</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-[80px] text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthDates.map((date) => {
              const dateString = formatDate(date)
              const dailyValue = dailyValuesByDate.get(dateString)
              const today = isToday(date)
              const weekend = isWeekend(date)
              const hasErrors = dailyValue?.has_errors

              return (
                <TableRow
                  key={dateString}
                  className={cn(
                    'cursor-pointer hover:bg-muted/50',
                    today && 'bg-primary/5',
                    weekend && !dailyValue?.target_minutes && 'text-muted-foreground bg-muted/30',
                    hasErrors && 'bg-destructive/5 hover:bg-destructive/10'
                  )}
                  onClick={() => handleRowClick(date)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className={cn(
                          'font-medium',
                          today && 'text-primary'
                        )}>
                          {formatDisplayDate(date, 'weekday')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDisplayDate(date, 'short')}
                        </div>
                      </div>
                      {dailyValue?.is_holiday && (
                        <Badge variant="secondary" className="text-xs">Holiday</Badge>
                      )}
                      {dailyValue?.is_absence && (
                        <Badge variant="outline" className="text-xs">Absence</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay value={dailyValue?.target_minutes} format="duration" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay value={dailyValue?.gross_minutes} format="duration" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay value={dailyValue?.break_minutes} format="duration" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay
                      value={dailyValue?.net_minutes}
                      format="duration"
                      className="font-medium"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <TimeDisplay
                      value={dailyValue?.balance_minutes}
                      format="balance"
                      className="font-medium"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <ErrorBadge errors={dailyValue?.errors as never} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Month Total</TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.target} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.gross} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.breaks} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.net} format="duration" />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <TimeDisplay value={totals.balance} format="balance" />
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

function DailyBreakdownSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Breaks</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Table shows all days of the selected month
- [ ] Weekend rows have muted background
- [ ] Today's row is highlighted
- [ ] Error rows have red background tint
- [ ] Holiday/Absence badges show on appropriate days
- [ ] Clicking a row navigates to timesheet day view
- [ ] Footer shows correct monthly totals
- [ ] Error count badge shows when errors exist

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Close/Reopen Workflow

### Overview
Implement the close month sheet with recalculate option and reopen month sheet with required reason.

### Changes Required:

#### 1. Close Month Sheet
**File**: `/apps/web/src/components/monthly-evaluation/close-month-sheet.tsx`
**Changes**: Create sheet for closing month

```tsx
'use client'

import { useState } from 'react'
import { Lock, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCloseMonthlyValue } from '@/hooks/api'

interface CloseMonthSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monthlyValueId?: string
  monthLabel: string
}

export function CloseMonthSheet({
  open,
  onOpenChange,
  monthlyValueId,
  monthLabel,
}: CloseMonthSheetProps) {
  const [recalculate, setRecalculate] = useState(true)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const closeMutation = useCloseMonthlyValue()

  const handleClose = () => {
    setRecalculate(true)
    setNotes('')
    setError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!monthlyValueId) return

    setError(null)

    try {
      await closeMutation.mutateAsync({
        path: { id: monthlyValueId },
        body: {
          recalculate,
          notes: notes || undefined,
        },
      })
      handleClose()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to close month')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Close Month
          </SheetTitle>
          <SheetDescription>
            Close {monthLabel} for final evaluation. This will lock all time entries for this period.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-start space-x-3">
            <Checkbox
              id="recalculate"
              checked={recalculate}
              onCheckedChange={(checked) => setRecalculate(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="recalculate" className="cursor-pointer">
                Recalculate before closing
              </Label>
              <p className="text-sm text-muted-foreground">
                Ensures all values are up-to-date before finalizing. Recommended.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this closing..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-medium text-sm">What happens when you close:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3" />
                {recalculate ? 'All values will be recalculated' : 'Values will not be recalculated'}
              </li>
              <li>Time entries for this month will be locked</li>
              <li>Monthly totals will be finalized</li>
              <li>An admin can reopen if needed</li>
            </ul>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={closeMutation.isPending || !monthlyValueId}
            className="flex-1"
          >
            {closeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close Month
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 2. Reopen Month Sheet
**File**: `/apps/web/src/components/monthly-evaluation/reopen-month-sheet.tsx`
**Changes**: Create sheet for reopening month with required reason

```tsx
'use client'

import { useState } from 'react'
import { Unlock, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useReopenMonthlyValue } from '@/hooks/api'

interface ReopenMonthSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  monthlyValueId?: string
  monthLabel: string
}

export function ReopenMonthSheet({
  open,
  onOpenChange,
  monthlyValueId,
  monthLabel,
}: ReopenMonthSheetProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reopenMutation = useReopenMonthlyValue()

  const handleClose = () => {
    setReason('')
    setError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!monthlyValueId) return

    if (reason.trim().length < 10) {
      setError('Please provide a reason with at least 10 characters')
      return
    }

    setError(null)

    try {
      await reopenMutation.mutateAsync({
        path: { id: monthlyValueId },
        body: {
          reason: reason.trim(),
        },
      })
      handleClose()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to reopen month')
    }
  }

  const isValid = reason.trim().length >= 10

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5" />
            Reopen Month
          </SheetTitle>
          <SheetDescription>
            Reopen {monthLabel} to allow editing of time entries. A reason is required.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Reopening a closed month will unlock all time entries. Any changes will require
              recalculation before closing again.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for reopening <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Explain why this month needs to be reopened..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className={!isValid && reason.length > 0 ? 'border-destructive' : ''}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 10 characters. {reason.length}/10
            </p>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={reopenMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={reopenMutation.isPending || !isValid || !monthlyValueId}
            className="flex-1"
          >
            {reopenMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reopen Month
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Click "Close Month" opens the close sheet
- [ ] Recalculate checkbox is checked by default
- [ ] Can add optional notes
- [ ] Clicking "Close Month" button closes the month
- [ ] Status badge updates to "closed"
- [ ] "Close Month" button becomes "Reopen" button
- [ ] Click "Reopen" opens the reopen sheet
- [ ] Cannot submit without a reason (min 10 chars)
- [ ] Character count shows below textarea
- [ ] Clicking "Reopen Month" reopens the month
- [ ] Status badge updates back to "open" or "calculated"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Export Functionality

### Overview
Implement CSV and PDF export for monthly evaluation data.

### Changes Required:

#### 1. Monthly Export Buttons Component
**File**: `/apps/web/src/components/monthly-evaluation/monthly-export-buttons.tsx`
**Changes**: Create export component

```tsx
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
  formatDate,
  formatMinutes,
  formatDisplayDate,
  getMonthDates,
} from '@/lib/time-utils'

interface DailyValueData {
  value_date: string
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  balance_minutes?: number | null
  is_holiday?: boolean | null
  is_absence?: boolean | null
  has_errors?: boolean | null
}

interface MonthlyValueData {
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  balance_minutes?: number | null
  working_days?: number | null
  worked_days?: number | null
  absence_days?: number | null
  holiday_days?: number | null
  status?: string | null
}

interface MonthlyExportButtonsProps {
  monthlyValue?: MonthlyValueData | null
  dailyValues: DailyValueData[]
  year: number
  month: number
  employeeName?: string
}

export function MonthlyExportButtons({
  monthlyValue,
  dailyValues,
  year,
  month,
  employeeName,
}: MonthlyExportButtonsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const monthDates = getMonthDates(new Date(year, month - 1, 1))
  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  // Create lookup map
  const dailyValuesByDate = new Map<string, DailyValueData>()
  for (const dv of dailyValues) {
    dailyValuesByDate.set(dv.value_date, dv)
  }

  const generateCSV = () => {
    const headers = ['Date', 'Day', 'Target', 'Gross', 'Breaks', 'Net', 'Balance', 'Holiday', 'Absence', 'Errors']

    const rows = monthDates.map((date) => {
      const dateString = formatDate(date)
      const dv = dailyValuesByDate.get(dateString)
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })

      return [
        formatDisplayDate(date, 'short'),
        dayName,
        formatMinutes(dv?.target_minutes ?? 0),
        formatMinutes(dv?.gross_minutes ?? 0),
        formatMinutes(dv?.break_minutes ?? 0),
        formatMinutes(dv?.net_minutes ?? 0),
        formatMinutes(dv?.balance_minutes ?? 0),
        dv?.is_holiday ? 'Yes' : '',
        dv?.is_absence ? 'Yes' : '',
        dv?.has_errors ? 'Yes' : '',
      ].join(',')
    })

    // Add summary row
    if (monthlyValue) {
      rows.push('')
      rows.push('Summary')
      rows.push(`Total Target,${formatMinutes(monthlyValue.target_minutes ?? 0)}`)
      rows.push(`Total Net,${formatMinutes(monthlyValue.net_minutes ?? 0)}`)
      rows.push(`Balance,${formatMinutes(monthlyValue.balance_minutes ?? 0)}`)
      rows.push(`Working Days,${monthlyValue.working_days ?? 0}`)
      rows.push(`Worked Days,${monthlyValue.worked_days ?? 0}`)
      rows.push(`Absence Days,${monthlyValue.absence_days ?? 0}`)
      rows.push(`Holiday Days,${monthlyValue.holiday_days ?? 0}`)
      rows.push(`Status,${monthlyValue.status ?? 'open'}`)
    }

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(
      csv,
      `monthly-evaluation-${year}-${String(month).padStart(2, '0')}.csv`,
      'text/csv'
    )
  }

  const generatePDF = () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Monthly Evaluation - ${monthLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .subtitle { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; }
          th { background: #f5f5f5; text-align: left; font-weight: 600; }
          td { text-align: right; }
          td:first-child, td:nth-child(2) { text-align: left; }
          .weekend { background: #f9f9f9; color: #888; }
          .error { background: #fff0f0; }
          .summary { margin-top: 20px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .summary-item { padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .summary-label { font-size: 10px; color: #666; }
          .summary-value { font-size: 16px; font-weight: 600; }
          .footer { margin-top: 20px; font-size: 10px; color: #666; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
          .badge-holiday { background: #e0f2fe; color: #0369a1; }
          .badge-absence { background: #fef3c7; color: #92400e; }
        </style>
      </head>
      <body>
        <h1>Monthly Evaluation: ${monthLabel}</h1>
        ${employeeName ? `<div class="subtitle">Employee: ${employeeName}</div>` : ''}

        ${monthlyValue ? `
        <div class="summary">
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Target Time</div>
              <div class="summary-value">${formatMinutes(monthlyValue.target_minutes ?? 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Net Time</div>
              <div class="summary-value">${formatMinutes(monthlyValue.net_minutes ?? 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Balance</div>
              <div class="summary-value">${formatMinutes(monthlyValue.balance_minutes ?? 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Status</div>
              <div class="summary-value">${monthlyValue.status ?? 'open'}</div>
            </div>
          </div>
        </div>
        ` : ''}

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Target</th>
              <th>Gross</th>
              <th>Breaks</th>
              <th>Net</th>
              <th>Balance</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${monthDates.map((date) => {
              const dateString = formatDate(date)
              const dv = dailyValuesByDate.get(dateString)
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              const hasError = dv?.has_errors

              const badges = []
              if (dv?.is_holiday) badges.push('<span class="badge badge-holiday">Holiday</span>')
              if (dv?.is_absence) badges.push('<span class="badge badge-absence">Absence</span>')

              return `
                <tr class="${isWeekend ? 'weekend' : ''} ${hasError ? 'error' : ''}">
                  <td>${formatDisplayDate(date, 'short')}</td>
                  <td>${dayName}</td>
                  <td>${formatMinutes(dv?.target_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.gross_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.break_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.net_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.balance_minutes ?? 0)}</td>
                  <td style="text-align: left">${badges.join(' ')}</td>
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
        generatePDF()
      }
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting || dailyValues.length === 0}>
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

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Export dropdown appears with CSV and PDF options
- [ ] CSV download works and contains all daily data plus summary
- [ ] PDF/Print opens in new window with formatted report
- [ ] Export disabled when no data available
- [ ] Weekends styled differently in PDF
- [ ] Error days highlighted in PDF

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 6.

---

## Phase 6: Polish and Error Handling

### Overview
Add final polish including error states, empty states, and accessibility improvements.

### Changes Required:

#### 1. Update Index Export
**File**: `/apps/web/src/components/monthly-evaluation/index.ts`
**Changes**: Ensure all components are exported

```typescript
export { MonthlySummaryCards } from './monthly-summary-cards'
export { DailyBreakdownTable } from './daily-breakdown-table'
export { CloseMonthSheet } from './close-month-sheet'
export { ReopenMonthSheet } from './reopen-month-sheet'
export { MonthlyExportButtons } from './monthly-export-buttons'
```

#### 2. Update Sidebar Nav Config (if not already added)
**File**: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**: Verify navigation entry is added with FileText icon import

Ensure at the import section:
```typescript
import {
  // ... existing imports
  FileText,
} from 'lucide-react'
```

#### 3. Add Loading/Error States to Page
**File**: `/apps/web/src/app/(dashboard)/monthly-evaluation/page.tsx`
**Changes**: Add error boundary and improved loading states (may already be handled)

The page should handle:
- API errors with retry option
- No employee selected state for admin
- No data for selected month

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`
- [ ] Build succeeds: `cd apps/web && pnpm build`
- [ ] All tests pass: `cd apps/web && pnpm test` (if tests exist)

#### Manual Verification:
- [ ] Full flow: Navigate, view data, close month, reopen month, export
- [ ] All loading states display correctly
- [ ] Error states show with retry option
- [ ] Admin can switch between employees
- [ ] Regular user sees only their data
- [ ] All keyboard navigation works
- [ ] Mobile responsive layout

**Implementation Note**: After completing this phase, the feature is complete. Verify end-to-end functionality.

---

## Testing Strategy

### Unit Tests
- Test MonthlySummaryCards with various data states
- Test DailyBreakdownTable with edge cases (empty month, all errors)
- Test CloseMonthSheet validation logic
- Test ReopenMonthSheet validation (min 10 chars)
- Test export functions generate correct output

### Integration Tests
- Test full page load with mock API data
- Test navigation between months
- Test close/reopen workflow end-to-end

### Manual Testing Steps
1. Navigate to `/monthly-evaluation` as regular employee
2. Verify current month data displays
3. Navigate to previous months
4. Click on a daily row and verify navigation to timesheet
5. Login as admin
6. Select different employees from dropdown
7. Close a month with recalculate option
8. Verify status changes to "closed"
9. Reopen the month with a reason
10. Export CSV and verify data
11. Export PDF and verify formatting
12. Test on mobile viewport

## Performance Considerations

- Daily values fetched once per month view (not per day)
- Employee list fetched once and cached (admin only)
- Monthly values query invalidated on close/reopen
- Skeleton loaders prevent layout shift
- Export generation done client-side (no server round-trip)

## Migration Notes

N/A - This is a new feature with no existing data migration required.

## References

- Research document: `thoughts/shared/research/2026-01-26-NOK-233-monthly-evaluation-view.md`
- Similar implementation patterns:
  - `/apps/web/src/app/(dashboard)/vacation/page.tsx` - Year navigation
  - `/apps/web/src/app/(dashboard)/timesheet/page.tsx` - Period navigation
  - `/apps/web/src/components/timesheet/week-view.tsx` - Table pattern
  - `/apps/web/src/components/employees/employee-form-sheet.tsx` - Sheet pattern
