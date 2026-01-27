# Research: NOK-233 Monthly Evaluation View

## Overview

This document researches existing codebase patterns and components relevant to implementing a monthly evaluation view with close/reopen workflow.

---

## 1. Existing Frontend Page Patterns

### 1.1 Dashboard Page Pattern (`/apps/web/src/app/(dashboard)/dashboard/page.tsx`)

**Structure:**
- Uses `useAuth()` for user context and employee ID extraction
- Handles loading state with skeleton component
- Handles "no employee linked" edge case with message UI
- Grid-based layout with `gap-4 md:grid-cols-2 lg:grid-cols-4`
- Composes multiple card components (TodayScheduleCard, HoursThisWeekCard, etc.)

**Key Pattern:**
```tsx
const { user, isLoading } = useAuth()
const employeeId = user?.employee_id

if (isLoading) return <LoadingSkeleton />
if (!employeeId) return <NoEmployeeMessage />
```

### 1.2 Timesheet Page Pattern (`/apps/web/src/app/(dashboard)/timesheet/page.tsx`)

**Key Features:**
- View mode tabs: 'day' | 'week' | 'month' with Tabs component
- Period navigation with ChevronLeft/ChevronRight buttons
- "Today" quick navigation button
- Date range calculation with `useMemo` based on view mode
- Uses `useDailyValues` hook for data fetching
- Export functionality via dropdown menu
- Card-wrapped content area

**Navigation Pattern:**
```tsx
const [viewMode, setViewMode] = useState<ViewMode>('day')
const [currentDate, setCurrentDate] = useState(new Date())

const navigatePrevious = () => { ... }
const navigateNext = () => { ... }
const navigateToToday = () => { ... }
```

### 1.3 Vacation Page Pattern (`/apps/web/src/app/(dashboard)/vacation/page.tsx`)

**Key Features:**
- Year selector with navigation buttons
- Balance breakdown card (1 column)
- Transaction history (2 columns)
- `useEmployeeVacationBalance` hook for data
- Conditional rendering based on year (current year vs others)

**Year Navigation:**
```tsx
const currentYear = new Date().getFullYear()
const [selectedYear, setSelectedYear] = useState(currentYear)
```

### 1.4 Absences Page Pattern (`/apps/web/src/app/(dashboard)/absences/page.tsx`)

**Layout Pattern:**
```tsx
<div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
  {/* Left column - Balance and Requests */}
  {/* Right column - Calendar */}
</div>
```

### 1.5 Admin Employees Page Pattern (`/apps/web/src/app/(dashboard)/admin/employees/page.tsx`)

**Admin Page Features:**
- Role-based access check with `useHasRole(['admin'])`
- Pagination state management
- Search and filter state
- Multiple dialogs/sheets: create, edit, view, delete confirmation
- Bulk actions support
- Loading skeletons

**Dialog State Management:**
```tsx
const [createOpen, setCreateOpen] = useState(false)
const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
const [viewEmployee, setViewEmployee] = useState<Employee | null>(null)
const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null)
```

---

## 2. Existing API Hooks Patterns

### 2.1 Monthly Values Hooks (`/apps/web/src/hooks/api/use-monthly-values.ts`)

**Available Hooks:**
```typescript
// List monthly values with filters
useMonthlyValues({
  employeeId?: string,
  year?: number,
  month?: number,
  status?: 'open' | 'calculated' | 'closed' | 'exported',
  departmentId?: string,
  enabled?: boolean,
})

// Get single monthly value by ID
useMonthlyValue(id: string, enabled = true)

// Close a monthly value
useCloseMonthlyValue()
// Usage: mutateAsync({ path: { id }, body: { recalculate, notes } })

// Reopen a monthly value
useReopenMonthlyValue()
// Usage: mutateAsync({ path: { id }, body: { reason } })
```

### 2.2 Daily Values Hooks (`/apps/web/src/hooks/api/use-daily-values.ts`)

**Available Hooks:**
```typescript
useDailyValues({
  employeeId?: string,
  from?: string,  // YYYY-MM-DD
  to?: string,    // YYYY-MM-DD
  status?: 'pending' | 'calculated' | 'error' | 'approved',
  hasErrors?: boolean,
  limit?: number,
  cursor?: string,
  enabled?: boolean,
})

useDailyValue(id: string, enabled = true)
useRecalculateDailyValues()
useApproveDailyValue()
```

### 2.3 Base Hook Patterns (`/apps/web/src/hooks/use-api-query.ts`)

**Query Pattern:**
```typescript
useApiQuery<Path extends GetPaths>(path: Path, {
  params?: QueryParams<Path>,
  path?: PathParams<Path>,
  ...otherQueryOptions
})
```

### 2.4 Full API Hook Index (`/apps/web/src/hooks/api/index.ts`)

Exports 50+ hooks including:
- Employee management
- Bookings
- Daily/Monthly values
- Vacation balances
- Absences
- Teams, Departments, Tariffs
- Day Plans, Week Plans

---

## 3. Data Table Patterns

### 3.1 Employee Data Table (`/apps/web/src/components/employees/employee-data-table.tsx`)

**Props Interface:**
```typescript
interface EmployeeDataTableProps {
  employees: Employee[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onView: (employee: Employee) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
  onViewTimesheet: (employee: Employee) => void
}
```

**Features:**
- Checkbox selection (individual and bulk)
- Skeleton loading state
- Row click handler
- Dropdown menu for actions
- Table structure with TableHeader, TableBody, TableRow, TableCell
- Column widths with `className="w-[xxx]"`

### 3.2 Week View Table (`/apps/web/src/components/timesheet/week-view.tsx`)

**Time Table Pattern:**
```tsx
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
    {dates.map((date) => (
      <TableRow key={dateString} className={cn(...)} onClick={...}>
        <TableCell>...</TableCell>
        <TableCell className="text-right">
          <TimeDisplay value={...} format="duration" />
        </TableCell>
        ...
      </TableRow>
    ))}
  </TableBody>
  <TableFooter>
    <TableRow>
      <TableCell className="font-medium">Week Total</TableCell>
      ...
    </TableRow>
  </TableFooter>
</Table>
```

### 3.3 Transaction History Table (`/apps/web/src/components/vacation/transaction-history.tsx`)

**Card-wrapped Table:**
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Calendar className="h-5 w-5" />
      Vacation History {year}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <Table>...</Table>
  </CardContent>
</Card>
```

---

## 4. Form Sheet Patterns

### 4.1 Employee Form Sheet (`/apps/web/src/components/employees/employee-form-sheet.tsx`)

**Sheet Structure:**
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
    <SheetHeader>
      <SheetTitle>{isEdit ? 'Edit' : 'New'}</SheetTitle>
      <SheetDescription>...</SheetDescription>
    </SheetHeader>

    <ScrollArea className="flex-1 -mx-4 px-4">
      <div className="space-y-6 py-4">
        {/* Form sections */}
      </div>
    </ScrollArea>

    <SheetFooter className="flex-row gap-2 border-t">
      <Button variant="outline" onClick={handleClose}>Cancel</Button>
      <Button onClick={handleSubmit}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**Form State Pattern:**
```tsx
const [form, setForm] = useState<FormState>(INITIAL_STATE)
const [error, setError] = useState<string | null>(null)

const createMutation = useCreateEmployee()
const updateMutation = useUpdateEmployee()

const handleSubmit = async () => {
  setError(null)
  const errors = validateForm(form, isEdit)
  if (errors.length > 0) {
    setError(errors.join('. '))
    return
  }
  try {
    await mutation.mutateAsync({ path: { id }, body: { ... } })
    onSuccess?.()
  } catch (err) {
    setError(apiError.detail ?? apiError.message ?? 'Failed')
  }
}
```

### 4.2 Confirm Dialog (`/apps/web/src/components/ui/confirm-dialog.tsx`)

**Props Interface:**
```typescript
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

**Usage Pattern:**
```tsx
<ConfirmDialog
  open={!!deleteEmployee}
  onOpenChange={(open) => !open && setDeleteEmployee(null)}
  title="Deactivate Employee"
  description={`Are you sure you want to deactivate ${name}?`}
  confirmLabel="Deactivate"
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

---

## 5. Calendar/Month Components

### 5.1 Month View (`/apps/web/src/components/timesheet/month-view.tsx`)

**Props:**
```typescript
interface MonthViewProps {
  year: number
  month: number  // 1-12
  employeeId?: string
  onDayClick?: (date: Date) => void
}
```

**Key Features:**
- Calendar grid calculation with padding for first week
- Daily values fetched via `useDailyValues`
- Monthly value fetched via `useMonthlyValues`
- Day cells with click handlers
- Holiday/Absence badges
- Error badges
- Time values (Net, Balance) per day
- Monthly summary section at bottom

**Calendar Grid Generation:**
```typescript
const calendarGrid = useMemo(() => {
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const startingDayOfWeek = firstDayOfMonth.getDay()
  const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1

  const grid: (Date | null)[][] = []
  let currentWeek: (Date | null)[] = Array(adjustedStartDay).fill(null)
  // ... fill weeks
  return grid
}, [year, month, dates])
```

**Monthly Summary Display (existing):**
```tsx
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
```

---

## 6. Display Components

### 6.1 Time Display (`/apps/web/src/components/timesheet/time-display.tsx`)

```typescript
interface TimeDisplayProps {
  value: number | null | undefined
  format?: 'time' | 'duration' | 'balance'
  className?: string
}
```

**Formats:**
- `time`: 08:30 (time of day)
- `duration`: 8:30 (hours:minutes)
- `balance`: +0:30 or -1:00 (with sign and color)

**Color Logic:**
```tsx
format === 'balance' && value !== null && (
  value > 0 ? 'text-green-600 dark:text-green-400' :
  value < 0 ? 'text-red-600 dark:text-red-400' : ''
)
```

### 6.2 Error Badge (`/apps/web/src/components/timesheet/error-badge.tsx`)

```typescript
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
```

Uses Badge with Tooltip to show error count and messages.

### 6.3 Daily Summary (`/apps/web/src/components/timesheet/daily-summary.tsx`)

```typescript
interface DailySummaryProps {
  targetMinutes?: number | null
  grossMinutes?: number | null
  breakMinutes?: number | null
  netMinutes?: number | null
  balanceMinutes?: number | null
  layout?: 'horizontal' | 'vertical' | 'compact'
  className?: string
}
```

### 6.4 Balance Breakdown (`/apps/web/src/components/vacation/balance-breakdown.tsx`)

Shows detailed breakdown with:
- Large remaining days display
- Progress bar with used/planned segments
- Line-item breakdown (base entitlement, additional, carryover, etc.)
- Tooltips for explanations

**Breakdown Row Pattern:**
```tsx
<BreakdownRow
  label="Base Entitlement"
  value={baseEntitlement}
  tooltip="Annual vacation entitlement based on contract"
/>
```

### 6.5 Flextime Balance Card (`/apps/web/src/components/dashboard/flextime-balance-card.tsx`)

Shows:
- Current balance with color coding (green positive, red negative)
- Net vs target display
- Balance indicator bar with center marker

---

## 7. Time Utilities (`/apps/web/src/lib/time-utils.ts`)

**Available Functions:**
```typescript
formatMinutes(minutes: number): string        // "8:30"
formatDuration(minutes: number): string       // "8h 30m"
formatBalance(minutes: number): string        // "+0:30"
formatBalanceDuration(minutes: number): string // "+30m"
formatDate(date: Date): string                // "2026-01-25"
formatTime(minutesSinceMidnight: number): string // "08:30"
formatDisplayDate(date: Date, format): string // "25.01." or "Montag, 25. Januar 2026"
formatRelativeDate(date: Date): string        // "Today", "Yesterday", "Jan 25, 2026"
getMonthRange(date: Date): { start, end }
getMonthDates(date: Date): Date[]
isToday(date: Date): boolean
isWeekend(date: Date): boolean
```

---

## 8. Backend Services

### 8.1 Monthly Evaluation Service (`/apps/api/internal/service/monthlyeval.go`)

**Service Interface:**
```go
type MonthlyEvalService struct { ... }

// Get monthly summary
func (s *MonthlyEvalService) GetMonthSummary(ctx, employeeID, year, month) (*MonthSummary, error)

// Recalculate monthly aggregation
func (s *MonthlyEvalService) RecalculateMonth(ctx, employeeID, year, month) error

// Close month
func (s *MonthlyEvalService) CloseMonth(ctx, employeeID, year, month, closedBy) error

// Reopen month
func (s *MonthlyEvalService) ReopenMonth(ctx, employeeID, year, month, reopenedBy) error

// Year overview
func (s *MonthlyEvalService) GetYearOverview(ctx, employeeID, year) ([]MonthSummary, error)
```

**MonthSummary Struct:**
```go
type MonthSummary struct {
  EmployeeID uuid.UUID
  Year, Month int

  // Time totals (minutes)
  TotalGrossTime, TotalNetTime, TotalTargetTime int
  TotalOvertime, TotalUndertime, TotalBreakTime int

  // Flextime tracking
  FlextimeStart, FlextimeChange, FlextimeEnd, FlextimeCarryover int

  // Absence summary
  VacationTaken decimal.Decimal
  SickDays, OtherAbsenceDays int

  // Work summary
  WorkDays, DaysWithErrors int

  // Status
  IsClosed bool
  ClosedAt, ReopenedAt *time.Time
  ClosedBy, ReopenedBy *uuid.UUID

  Warnings []string
}
```

### 8.2 Monthly Value Model (`/apps/api/internal/model/monthlyvalue.go`)

```go
type MonthlyValue struct {
  ID, TenantID, EmployeeID uuid.UUID
  Year, Month int

  // Time totals (minutes)
  TotalGrossTime, TotalNetTime, TotalTargetTime int
  TotalOvertime, TotalUndertime, TotalBreakTime int

  // Flextime balance (minutes)
  FlextimeStart, FlextimeChange, FlextimeEnd, FlextimeCarryover int

  // Absence summary
  VacationTaken decimal.Decimal
  SickDays, OtherAbsenceDays int

  // Work summary
  WorkDays, DaysWithErrors int

  // Month closing
  IsClosed bool
  ClosedAt *time.Time
  ClosedBy *uuid.UUID
  ReopenedAt *time.Time
  ReopenedBy *uuid.UUID

  CreatedAt, UpdatedAt time.Time
  Employee *Employee
}
```

### 8.3 Monthly Value Repository (`/apps/api/internal/repository/monthlyvalue.go`)

**Available Methods:**
```go
GetByID(ctx, id) (*MonthlyValue, error)
GetByEmployeeMonth(ctx, employeeID, year, month) (*MonthlyValue, error)
GetPreviousMonth(ctx, employeeID, year, month) (*MonthlyValue, error)
Upsert(ctx, mv) error
ListByEmployee(ctx, employeeID) ([]MonthlyValue, error)
ListByEmployeeYear(ctx, employeeID, year) ([]MonthlyValue, error)
IsMonthClosed(ctx, tenantID, employeeID, date) (bool, error)
CloseMonth(ctx, employeeID, year, month, closedBy) error
ReopenMonth(ctx, employeeID, year, month, reopenedBy) error
```

### 8.4 Monthly Calculation (`/apps/api/internal/calculation/monthly.go`)

**Input/Output Types:**
```go
type MonthlyCalcInput struct {
  DailyValues       []DailyValueInput
  PreviousCarryover int
  EvaluationRules   *MonthlyEvaluationInput
  AbsenceSummary    AbsenceSummaryInput
}

type MonthlyCalcOutput struct {
  TotalGrossTime, TotalNetTime, TotalTargetTime int
  TotalOvertime, TotalUndertime, TotalBreakTime int

  FlextimeStart, FlextimeChange, FlextimeRaw int
  FlextimeCredited, FlextimeForfeited, FlextimeEnd int

  WorkDays, DaysWithErrors int

  VacationTaken decimal.Decimal
  SickDays, OtherAbsenceDays int

  Warnings []string
}
```

**Credit Types:**
- `no_evaluation`: Direct 1:1 transfer
- `complete_carryover`: With monthly and balance caps
- `after_threshold`: Only credit excess above threshold
- `no_carryover`: Reset to zero each month

---

## 9. OpenAPI Schema

### 9.1 Monthly Value Endpoints (`/api/paths/monthly-values.yaml`)

**Endpoints:**
```
GET  /monthly-values                    - List with filters
GET  /monthly-values/{id}               - Get by ID
POST /monthly-values/{id}/close         - Close month
POST /monthly-values/{id}/reopen        - Reopen month (requires reason)
POST /monthly-values/close-batch        - Batch close
POST /monthly-values/recalculate        - Trigger recalculation
```

### 9.2 Monthly Value Schema (`/api/schemas/monthly-values.yaml`)

**MonthlyValue Properties:**
- id, tenant_id, employee_id
- year, month
- status: open | calculated | closed | exported
- target_minutes, gross_minutes, break_minutes, net_minutes
- overtime_minutes, undertime_minutes, balance_minutes
- working_days, worked_days, absence_days, holiday_days
- account_balances (object)
- calculated_at, closed_at, closed_by
- created_at, updated_at
- employee (expanded relation)

**CloseMonthRequest:**
```yaml
properties:
  recalculate: boolean (default true)
  notes: string
```

**ReopenMonthRequest:**
```yaml
required:
  - reason
properties:
  reason: string (minLength: 10)
```

---

## 10. UI Components Available

### 10.1 From `/components/ui/`
- `Button` - with variants (default, outline, ghost, destructive)
- `Card`, `CardHeader`, `CardTitle`, `CardContent`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`, `TableFooter`
- `Badge` - with variants (default, secondary, destructive, outline)
- `Tabs`, `TabsList`, `TabsTrigger`
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetFooter`
- `Skeleton`
- `Tooltip`, `TooltipContent`, `TooltipTrigger`
- `ConfirmDialog`
- `Calendar`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `Popover`, `PopoverContent`, `PopoverTrigger`
- `Alert`, `AlertDescription`
- `ScrollArea`
- `Separator`

### 10.2 Icons (lucide-react)
Commonly used: `ChevronLeft`, `ChevronRight`, `Plus`, `AlertCircle`, `AlertTriangle`, `Calendar`, `TrendingUp`, `Lock`, `Unlock`, `Download`, `FileText`, `RefreshCw`, `MoreHorizontal`, `Eye`, `Edit`

---

## 11. Status Patterns

### 11.1 Month Status Display
```tsx
const statusStyles: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  calculated: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  closed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  exported: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}
```

### 11.2 Locked State Indicator Pattern
From flextime balance card - indicator bar with center marker and left/right segments.

---

## Summary

The codebase provides comprehensive patterns for:

1. **Page Structure**: Dashboard/timesheet patterns with auth checks, loading states, and grid layouts
2. **Data Tables**: Week view and employee tables with selection, actions, and totals
3. **API Hooks**: Monthly values hooks (list, get, close, reopen) already exist
4. **Form Sheets**: Standard pattern with validation, mutations, and error handling
5. **Confirm Dialogs**: Reusable component for destructive actions
6. **Calendar/Month Views**: Existing month-view component with daily values
7. **Display Components**: TimeDisplay, ErrorBadge, DailySummary, BalanceBreakdown
8. **Backend Services**: Complete monthly evaluation service with close/reopen functionality
9. **OpenAPI Schema**: Endpoints and schemas defined for monthly values

The monthly evaluation view can be built by composing these existing patterns with minimal new component creation.
