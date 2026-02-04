# Research: ZMI-TICKET-043 Monthly Values Batch UI

Date: 2026-02-03
Ticket: ZMI-TICKET-043

## 1. Backend API (Monthly Values)

### 1.1 Two Handler Systems

The backend has TWO separate handler systems for monthly values:

**1. Flat routes (MonthlyValueHandler)** - `apps/api/internal/handler/monthly_value.go`
- `GET /monthly-values` - List with filters (employee_id, year, month, status, department_id)
- `GET /monthly-values/{id}` - Get by ID
- `POST /monthly-values/{id}/close` - Close individual month
- `POST /monthly-values/{id}/reopen` - Reopen individual month
- `POST /monthly-values/close-batch` - Batch close
- `POST /monthly-values/recalculate` - Batch recalculate

**2. Employee-nested routes (MonthlyEvalHandler)** - `apps/api/internal/handler/monthlyeval.go`
- `GET /employees/{id}/months/{year}` - Year overview
- `GET /employees/{id}/months/{year}/{month}` - Month summary
- `GET /employees/{id}/months/{year}/{month}/days` - Daily breakdown
- `POST /employees/{id}/months/{year}/{month}/close` - Close month
- `POST /employees/{id}/months/{year}/{month}/reopen` - Reopen month
- `POST /employees/{id}/months/{year}/{month}/recalculate` - Recalculate month

**Key difference**: The flat routes (`/monthly-values/*`) use the `MonthlyValue` response model (from `gen/models`), while the employee-nested routes use the `MonthSummaryResponse` model with more detailed fields (flextime tracking, absence breakdowns, warnings).

For the admin batch UI, we should use the **flat routes** (`/monthly-values/*`) since they support:
- Listing all employees' monthly values at once
- Department filtering
- Batch close operations
- Batch recalculation

### 1.2 Route Registration

File: `apps/api/internal/handler/routes.go` (lines 1659-1678)

```go
func RegisterMonthlyValueRoutes(r chi.Router, h *MonthlyValueHandler, authz *middleware.AuthorizationMiddleware) {
    permViewReports := permissions.ID("reports.view").String()
    permCalculateMonth := permissions.ID("booking_overview.calculate_month").String()
    // ...
    r.With(authz.RequirePermission(permViewReports)).Get("/monthly-values", h.List)
    r.With(authz.RequirePermission(permViewReports)).Post("/monthly-values/close-batch", h.CloseBatch)
    r.With(authz.RequirePermission(permCalculateMonth)).Post("/monthly-values/recalculate", h.Recalculate)
    r.With(authz.RequirePermission(permViewReports)).Get("/monthly-values/{id}", h.Get)
    r.With(authz.RequirePermission(permViewReports)).Post("/monthly-values/{id}/close", h.Close)
    r.With(authz.RequirePermission(permViewReports)).Post("/monthly-values/{id}/reopen", h.Reopen)
}
```

Permissions required: `reports.view` for most operations, `booking_overview.calculate_month` for recalculate.

### 1.3 Service Layer

File: `apps/api/internal/service/monthlyvalue.go`

```go
type MonthlyValueService struct {
    repo monthlyValueRepoForService
}

func (s *MonthlyValueService) List(ctx, filter) ([]model.MonthlyValue, error)
func (s *MonthlyValueService) GetByID(ctx, id) (*model.MonthlyValue, error)
func (s *MonthlyValueService) Close(ctx, id, closedBy) (*model.MonthlyValue, error)
func (s *MonthlyValueService) Reopen(ctx, id, reopenedBy) (*model.MonthlyValue, error)
```

Errors: `ErrMonthlyValueAlreadyClosed`, `ErrMonthlyValueNotClosed`, `ErrMonthlyValueNotFound`

### 1.4 Monthly Calc Service (Batch Operations)

File: `apps/api/internal/service/monthlycalc.go`

```go
type MonthlyCalcResult struct {
    ProcessedMonths int
    SkippedMonths   int // Months skipped due to being closed
    FailedMonths    int
    Errors          []MonthlyCalcError
}

func (s *MonthlyCalcService) CalculateMonth(ctx, employeeID, year, month) (*model.MonthlyValue, error)
func (s *MonthlyCalcService) CalculateMonthBatch(ctx, employeeIDs, year, month) MonthlyCalcResult
```

### 1.5 Repository Layer

File: `apps/api/internal/repository/monthlyvalue.go`

```go
type MonthlyValueFilter struct {
    TenantID     uuid.UUID
    EmployeeID   *uuid.UUID
    Year         *int
    Month        *int
    IsClosed     *bool
    DepartmentID *uuid.UUID
}

func (r *MonthlyValueRepository) ListAll(ctx, filter) ([]model.MonthlyValue, error)
func (r *MonthlyValueRepository) GetByID(ctx, id) (*model.MonthlyValue, error)
func (r *MonthlyValueRepository) CloseMonth(ctx, employeeID, year, month, closedBy) error
func (r *MonthlyValueRepository) ReopenMonth(ctx, employeeID, year, month, reopenedBy) error
func (r *MonthlyValueRepository) Upsert(ctx, mv) error
```

The `ListAll` method joins employees table when DepartmentID filter is set.

### 1.6 Domain Model

File: `apps/api/internal/model/monthlyvalue.go`

```go
type MonthlyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    Year       int
    Month      int
    // Time totals (minutes)
    TotalGrossTime, TotalNetTime, TotalTargetTime int
    TotalOvertime, TotalUndertime, TotalBreakTime int
    // Flextime
    FlextimeStart, FlextimeChange, FlextimeEnd, FlextimeCarryover int
    // Absences
    VacationTaken decimal.Decimal
    SickDays, OtherAbsenceDays int
    // Work summary
    WorkDays, DaysWithErrors int
    // Closing
    IsClosed bool
    ClosedAt, ReopenedAt *time.Time
    ClosedBy, ReopenedBy *uuid.UUID
    // Relations
    Employee *Employee
}
```

### 1.7 Batch Close Handler Details

File: `apps/api/internal/handler/monthly_value.go` (lines 198-303)

The `CloseBatch` handler:
1. Parses request body: `{ year, month, employee_ids?, department_id?, recalculate? }`
2. If no `employee_ids`, fetches active employees (optionally filtered by department)
3. If `recalculate=true` (default), calls `CalculateMonthBatch` first
4. Iterates employees, closes each individually
5. Returns: `{ closed_count, skipped_count, error_count, errors: [{employee_id, reason}] }`

### 1.8 Recalculate Handler Details

File: `apps/api/internal/handler/monthly_value.go` (lines 306-360)

The `Recalculate` handler:
1. Parses: `{ year, month, employee_id? }`
2. If no `employee_id`, fetches all active employees
3. Calls `CalculateMonthBatch`
4. Returns HTTP 202: `{ message, affected_employees }`

---

## 2. OpenAPI Spec

### 2.1 Flat Monthly Value Paths

File: `api/paths/monthly-values.yaml`

Endpoints defined:
- `GET /monthly-values` - operationId: `listMonthlyValues`
  - Query params: `employee_id`, `year`, `month`, `status` (enum: open/calculated/closed/exported), `department_id`
  - Response: `MonthlyValueList`
- `GET /monthly-values/{id}` - operationId: `getMonthlyValue`
  - Response: `MonthlyValue`
- `POST /monthly-values/{id}/close` - operationId: `closeMonth`
  - Body: `CloseMonthRequest` { recalculate?, notes? }
  - Response: `MonthlyValue`
- `POST /monthly-values/{id}/reopen` - operationId: `reopenMonth`
  - Body: `ReopenMonthRequest` { reason (required, minLength: 10) }
  - Response: `MonthlyValue`
- `POST /monthly-values/close-batch` - operationId: `closeMonthBatch`
  - Body: { year, month, employee_ids?, department_id?, recalculate? (default: true) }
  - Response: { closed_count, skipped_count, error_count, errors: [{employee_id, reason}] }
- `POST /monthly-values/recalculate` - operationId: `recalculateMonthlyValues`
  - Body: { year, month, employee_id? }
  - Response 202: { message, affected_employees }

### 2.2 Employee-Nested Monthly Paths

File: `api/paths/employee-monthly.yaml`

- `GET /employees/{id}/months/{year}` - Year overview
- `GET /employees/{id}/months/{year}/{month}` - Month summary
- `GET /employees/{id}/months/{year}/{month}/days` - Daily breakdown
- `POST /employees/{id}/months/{year}/{month}/close` - Close
- `POST /employees/{id}/months/{year}/{month}/reopen` - Reopen
- `POST /employees/{id}/months/{year}/{month}/recalculate` - Recalculate

### 2.3 Schemas

File: `api/schemas/monthly-values.yaml`

Key schemas:
- **MonthlyValue**: id, tenant_id, employee_id, year, month, status (open/calculated/closed/exported), target_minutes, gross_minutes, break_minutes, net_minutes, overtime_minutes, undertime_minutes, balance_minutes, working_days, worked_days, absence_days, holiday_days, account_balances, calculated_at, closed_at, closed_by, employee (EmployeeSummary)
- **MonthlyValueList**: { data: MonthlyValue[] }
- **MonthSummaryResponse**: More detailed with flextime fields, absence breakdowns, warnings
- **CloseMonthRequest**: { recalculate? (default true), notes? }
- **ReopenMonthRequest**: { reason (required, minLength: 10) }

---

## 3. Generated TypeScript Types

File: `apps/web/src/lib/api/types.ts`

### 3.1 MonthlyValue Schema (lines 7740-7827)

```typescript
MonthlyValue: {
    id: string;           // uuid
    tenant_id: string;    // uuid
    employee_id: string;  // uuid
    year: number;
    month: number;        // 1-12
    status?: "open" | "calculated" | "closed" | "exported";
    target_minutes?: number;
    gross_minutes?: number;
    break_minutes?: number;
    net_minutes?: number;
    overtime_minutes?: number;
    undertime_minutes?: number;
    balance_minutes?: number;
    working_days?: number;
    worked_days?: number;
    absence_days?: number;
    holiday_days?: number;
    account_balances?: { [key: string]: number };
    calculated_at?: string | null;
    closed_at?: string | null;
    closed_by?: string | null;
    created_at?: string;
    updated_at?: string;
    employee?: components["schemas"]["EmployeeSummary"] | null;
}
```

### 3.2 EmployeeSummary Schema (lines 5432-5442)

```typescript
EmployeeSummary: {
    id: string;
    personnel_number: string;
    first_name: string;
    last_name: string;
    department_id?: string | null;
    tariff_id?: string | null;
    is_active?: boolean;
}
```

### 3.3 Batch Operations (lines 14556-14635)

```typescript
// closeMonthBatch
requestBody: {
    year: number;
    month: number;
    employee_ids?: string[];
    department_id?: string;
    recalculate?: boolean;  // default true
}
response 200: {
    closed_count?: number;
    skipped_count?: number;
    error_count?: number;
    errors?: { employee_id?: string; reason?: string }[];
}

// recalculateMonthlyValues
requestBody: {
    year: number;
    month: number;
    employee_id?: string;
}
response 202: {
    message?: string;
    affected_employees?: number;
}
```

### 3.4 Generated Go Models

File: `apps/api/gen/models/monthly_value.go`
- `MonthlyValue` struct with all fields, validation, and status enum constants
- Status constants: `MonthlyValueStatusOpen`, `MonthlyValueStatusCalculated`, `MonthlyValueStatusClosed`, `MonthlyValueStatusExported`

File: `apps/api/gen/models/monthly_value_list.go`
- `MonthlyValueList` with `Data []*MonthlyValue`

---

## 4. Existing Frontend Hooks

### 4.1 Current use-monthly-values.ts

File: `apps/web/src/hooks/api/use-monthly-values.ts`

This file currently contains hooks for the **employee-nested** routes only (not the flat `/monthly-values` routes):

```typescript
// Uses custom apiRequest() function (not useApiQuery/useApiMutation)
useMonthlyValues({ employeeId, year, month })  // GET /employees/{id}/months/{year}/{month}
useYearOverview({ employeeId, year })           // GET /employees/{id}/months/{year}
useCloseMonth()                                  // POST /employees/{id}/months/{year}/{month}/close
useReopenMonth()                                 // POST /employees/{id}/months/{year}/{month}/reopen
useRecalculateMonth()                            // POST /employees/{id}/months/{year}/{month}/recalculate
```

The MonthSummary type is defined locally in this file with both new-style and legacy field aliases.

**IMPORTANT**: The existing hooks do NOT use the type-safe `useApiQuery`/`useApiMutation` pattern. They use a local `apiRequest()` function with manual `useQuery`/`useMutation`. New hooks for the flat routes should use the proper `useApiQuery`/`useApiMutation` pattern instead.

### 4.2 Hook Pattern: useApiQuery

File: `apps/web/src/hooks/use-api-query.ts`

```typescript
function useApiQuery<Path extends GetPaths>(
    path: Path,
    options?: { params?: QueryParams<Path>; path?: PathParams<Path>; ...queryOptions }
)
```

Usage example from `use-employee-day-plans.ts`:
```typescript
export function useEmployeeDayPlans(options) {
    return useApiQuery('/employee-day-plans', {
        params: { employee_id, from, to, source, limit, cursor },
        enabled,
    })
}
```

### 4.3 Hook Pattern: useApiMutation

File: `apps/web/src/hooks/use-api-mutation.ts`

```typescript
function useApiMutation<Path extends MutationPaths, Method extends MutationMethod>(
    path: Path,
    method: Method,
    options?: { invalidateKeys?: unknown[][]; onSuccess?: callback }
)
```

Usage example:
```typescript
export function useCreateEmployeeDayPlan() {
    return useApiMutation('/employee-day-plans', 'post', {
        invalidateKeys: [['/employee-day-plans'], ['/employees']],
    })
}
```

### 4.4 Hooks Index

File: `apps/web/src/hooks/api/index.ts`

Currently exports from `use-monthly-values.ts`:
```typescript
export {
    useMonthlyValues,
    useYearOverview,
    useCloseMonth,
    useReopenMonth,
    useRecalculateMonth,
    type MonthSummary,
} from './use-monthly-values'
```

For the new admin page, we need ADDITIONAL hooks for the flat routes. These should be in a separate file or added to the existing file with different names (e.g., `useAdminMonthlyValues`, `useMonthlyValue`, `useCloseMonthById`, `useReopenMonthById`, `useCloseMonthBatch`, `useRecalculateMonthlyValues`).

---

## 5. Frontend Patterns

### 5.1 Admin Page Structure

All admin pages follow this pattern (from correction-assistant, approvals, employee-day-plans):

```tsx
'use client'

export default function AdminPage() {
    const router = useRouter()
    const t = useTranslations('namespace')
    const { isLoading: authLoading } = useAuth()
    const isAdmin = useHasRole(['admin'])

    // Auth guard
    React.useEffect(() => {
        if (!authLoading && !isAdmin) router.push('/dashboard')
    }, [authLoading, isAdmin, router])

    // Filter state
    const [filters, setFilters] = useState(...)

    // Data fetching
    const { data, isLoading } = useHook({ ...filters, enabled: !authLoading && isAdmin })

    if (authLoading) return <PageSkeleton />
    if (!isAdmin) return null

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
                <p className="text-muted-foreground">{t('subtitle')}</p>
            </div>
            {/* Filters */}
            {/* Data table in Card */}
            {/* Dialogs/Sheets */}
        </div>
    )
}
```

### 5.2 Data Tables

Data tables use the basic `Table` component from `@/components/ui/table`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
```

Pattern from `correction-assistant-data-table.tsx` and `year-overview-table.tsx`:
- Define interface for row data
- Table with header and body
- Clickable rows with `cursor-pointer` class
- Skeleton component for loading state
- Optional `TableFooter` for totals

### 5.3 Status Badges

Two patterns used in the codebase:

**Pattern 1** - Inline styles (monthly-evaluation page):
```tsx
const statusStyles = {
    open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    closed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}
<Badge className={statusStyles[status]}>{label}</Badge>
```

**Pattern 2** - Badge variants (year-overview-table):
```tsx
function getStatusBadge(status, t) {
    const statusConfig = {
        open:       { labelKey: 'statusOpen',       variant: 'outline',    className: '' },
        calculated: { labelKey: 'statusCalculated', variant: 'secondary',  className: '' },
        closed:     { labelKey: 'statusClosed',     variant: 'default',    className: 'bg-green-600 hover:bg-green-700' },
        exported:   { labelKey: 'statusExported',   variant: 'default',    className: 'bg-blue-600 hover:bg-blue-700' },
    }
    return <Badge variant={config.variant} className={config.className}>{t(config.labelKey)}</Badge>
}
```

The year-overview pattern is more appropriate for our four-status system.

### 5.4 Time Formatting

File: `apps/web/src/lib/time-utils.ts`

Key functions:
- `formatMinutes(510)` returns `"8:30"` - Duration in H:MM
- `formatBalance(30)` returns `"+0:30"` - With sign indicator
- `formatDuration(510)` returns `"8h 30m"` - Human readable
- `formatTime(510)` returns `"08:30"` - Time of day (zero-padded)

**TimeDisplay component** (`apps/web/src/components/timesheet/time-display.tsx`):
```tsx
<TimeDisplay value={minutes} format="duration" />   // "8:30"
<TimeDisplay value={minutes} format="balance" />     // "+0:30" (green/red colored)
<TimeDisplay value={minutes} format="time" />        // "08:30"
```

TimeDisplay has `font-mono tabular-nums` class and auto-colors balance values (green for positive, red for negative).

### 5.5 Detail Sheet Pattern

File: `apps/web/src/components/correction-assistant/correction-assistant-detail-sheet.tsx`

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
            <SheetTitle>...</SheetTitle>
            <SheetDescription>...</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
                {/* Content sections */}
                <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex justify-between py-1">
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <span className="text-sm font-medium">{value}</span>
                    </div>
                </div>
            </div>
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button variant="outline" className="flex-1">Close</Button>
            <Button className="flex-1">Action</Button>
        </SheetFooter>
    </SheetContent>
</Sheet>
```

### 5.6 Batch Operation Patterns

**Pattern A - Bulk actions bar** (approvals page):

File: `apps/web/src/components/approvals/approval-bulk-actions.tsx`

```tsx
<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
    <div className="flex items-center gap-2">
        <Checkbox checked={...} onCheckedChange={...} />
        <span className="text-sm text-muted-foreground">{t('selectAll')}</span>
    </div>
    <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{t('selectedCount', { count })}</span>
        <Button size="sm" onClick={onBulkAction}>{t('bulkAction')}</Button>
    </div>
</div>
```

**Pattern B - Sequential processing** (approvals page bulk approve):
```tsx
const handleBulkApprove = async () => {
    setBulkProcessing(true)
    let successCount = 0
    for (const id of selectedIds) {
        try {
            await mutation.mutateAsync({ path: { id } })
            successCount++
        } catch {
            // Continue processing
        }
    }
    setBulkProcessing(false)
    setSelectedIds(new Set())
    showToast(t('bulkResult', { count: successCount }))
}
```

**Pattern C - Batch endpoint** (employee-day-plans bulk create):
```tsx
const bulkCreate = useBulkCreateEmployeeDayPlans()
bulkCreate.mutate({ body: { plans: [...] } })
```

For monthly values:
- **Batch close** uses Pattern C (dedicated batch endpoint `POST /monthly-values/close-batch`)
- **Batch reopen** requires Pattern B (sequential individual calls since no batch endpoint)

### 5.7 Filter Components

**Department filter** (correction-assistant-filters):
```tsx
<Select value={selectedDepartmentId ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
        <SelectItem value="all">{t('allDepartments')}</SelectItem>
        {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
    </SelectContent>
</Select>
```

**Year/month selector** (monthly-evaluation page):
```tsx
<div className="flex items-center rounded-md border">
    <Button variant="ghost" size="icon-sm" onClick={navigatePrevious}>
        <ChevronLeft />
    </Button>
    <span className="px-3 text-sm font-medium min-w-[160px] text-center">{monthLabel}</span>
    <Button variant="ghost" size="icon-sm" onClick={navigateNext}>
        <ChevronRight />
    </Button>
</div>
```

### 5.8 Checkbox Selection Pattern

From approvals page:
```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

// Toggle single
const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })
}

// Select all
const handleSelectAll = () => setSelectedIds(new Set(allIds))
const handleClearSelection = () => setSelectedIds(new Set())
```

### 5.9 Confirmation Dialogs

Close month sheet from `monthly-evaluation/close-month-sheet.tsx`:
- Uses `Sheet` component (right-side drawer)
- Has recalculate checkbox, notes textarea
- Shows "What happens when you close" info panel
- Submit with loading state

Reopen month sheet from `monthly-evaluation/reopen-month-sheet.tsx`:
- Uses `Sheet` component
- Has required reason textarea with min 10 chars validation
- Warning alert about consequences
- Destructive button variant

### 5.10 Sidebar Navigation

File: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Navigation items are structured as:
```typescript
{
    titleKey: string,     // Translation key
    href: string,         // Route path
    icon: LucideIcon,     // Icon component
    roles?: string[],     // Required roles
}
```

Grouped into sections (e.g., "time", "management"). Monthly values would go in the "management" section alongside existing entries like "correctionAssistant" and "employeeDayPlans".

### 5.11 Breadcrumbs

File: `apps/web/src/components/layout/breadcrumbs.tsx`

Uses a `segmentToKey` mapping:
```typescript
const segmentToKey: Record<string, string> = {
    'admin': 'admin',
    'employees': 'employees',
    'monthly-values': 'monthly-values',  // needs to be added
    // ...
}
```

### 5.12 Translations

Files: `apps/web/messages/en.json`, `apps/web/messages/de.json`

Pattern: Each feature has a top-level namespace key (e.g., `"correctionAssistant"`, `"monthlyEvaluation"`, `"employeeDayPlans"`).

Sidebar/breadcrumb translations are under `"sidebar"` and `"breadcrumbs"` keys.

Existing monthly-evaluation translations (lines 479-555 in en.json) provide reference for status labels and time-related terms.

---

## 6. Existing Monthly Evaluation Page (Reference)

File: `apps/web/src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx`

This is a **single-employee** view (not admin batch), but provides useful patterns:
- Employee selector for admins
- Year/month navigation with ChevronLeft/ChevronRight
- Status badge: `is_closed ? statusStyles.closed : statusStyles.open`
- Close/Reopen buttons conditional on status
- MonthlySummaryCards component for time summary
- DailyBreakdownTable for daily values
- CloseMonthSheet and ReopenMonthSheet dialogs
- MonthlyExportButtons for CSV/PDF export

### 6.1 Monthly Summary Cards

File: `apps/web/src/components/monthly-evaluation/monthly-summary-cards.tsx`

Displays 4 cards:
1. **Time Summary**: Target, Worked, Balance (using TimeDisplay)
2. **Flextime Balance**: Large balance display with indicator bar
3. **Working Days**: Count with errors indicator
4. **Absences**: Vacation, Sick, Other with total

Uses the `MonthSummary` type from `use-monthly-values.ts`.

---

## 7. Year Overview Table (Reference for Status Badges)

File: `apps/web/src/components/year-overview/year-overview-table.tsx`

Has the most complete status badge implementation with all four statuses:
```typescript
const statusConfig = {
    open:       { labelKey: 'statusOpen',       variant: 'outline',    className: '' },
    calculated: { labelKey: 'statusCalculated', variant: 'secondary',  className: '' },
    closed:     { labelKey: 'statusClosed',     variant: 'default',    className: 'bg-green-600 hover:bg-green-700' },
    exported:   { labelKey: 'statusExported',   variant: 'default',    className: 'bg-blue-600 hover:bg-blue-700' },
}
```

Uses TimeDisplay for duration and balance formatting, with footer row for totals.

---

## 8. Component Files to Create

Based on the ticket and codebase patterns:

### New files needed:
1. `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx` - Admin page
2. `apps/web/src/components/monthly-values/monthly-values-data-table.tsx` - Data table
3. `apps/web/src/components/monthly-values/monthly-values-detail-sheet.tsx` - Detail sheet
4. `apps/web/src/components/monthly-values/monthly-values-toolbar.tsx` - Toolbar with filters
5. `apps/web/src/components/monthly-values/batch-close-dialog.tsx` - Batch close dialog
6. `apps/web/src/components/monthly-values/batch-reopen-dialog.tsx` - Batch reopen dialog
7. `apps/web/src/components/monthly-values/recalculate-dialog.tsx` - Recalculate dialog
8. `apps/web/src/components/monthly-values/monthly-values-skeleton.tsx` - Page skeleton
9. `apps/web/src/components/monthly-values/index.ts` - Barrel export

### Files to modify:
1. `apps/web/src/hooks/api/use-monthly-values.ts` - Add new hooks for flat routes
2. `apps/web/src/hooks/api/index.ts` - Export new hooks
3. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add nav entry
4. `apps/web/src/components/layout/breadcrumbs.tsx` - Add breadcrumb segment
5. `apps/web/messages/en.json` - Add translations
6. `apps/web/messages/de.json` - Add German translations

---

## 9. API Hooks Needed

New hooks for the flat `/monthly-values` routes using `useApiQuery`/`useApiMutation`:

```typescript
// GET /monthly-values - List all monthly values with filters
useAdminMonthlyValues({ year, month, status, departmentId, employeeId })

// GET /monthly-values/{id} - Get single monthly value
useMonthlyValueById(id)

// POST /monthly-values/{id}/close - Close individual month
useCloseMonthById()
// invalidateKeys: [['/monthly-values']]

// POST /monthly-values/{id}/reopen - Reopen individual month
useReopenMonthById()
// invalidateKeys: [['/monthly-values']]

// POST /monthly-values/close-batch - Batch close
useCloseMonthBatch()
// invalidateKeys: [['/monthly-values']]

// POST /monthly-values/recalculate - Batch recalculate
useRecalculateMonthlyValues()
// invalidateKeys: [['/monthly-values']]
```

Note: The existing `useCloseMonth`/`useReopenMonth` in `use-monthly-values.ts` use the employee-nested routes and custom `apiRequest()`. The new admin hooks should use the flat routes with the standard `useApiQuery`/`useApiMutation` pattern.

---

## 10. Key TypeScript Type References

From `apps/web/src/lib/api/types.ts`, the operations type paths available:

```typescript
// GET endpoints (for useApiQuery)
"/monthly-values"      -> operations["listMonthlyValues"]
"/monthly-values/{id}" -> operations["getMonthlyValue"]

// POST endpoints (for useApiMutation)
"/monthly-values/{id}/close"   -> operations["closeMonth"]
"/monthly-values/{id}/reopen"  -> operations["reopenMonth"]
"/monthly-values/close-batch"  -> operations["closeMonthBatch"]
"/monthly-values/recalculate"  -> operations["recalculateMonthlyValues"]
```

Response type for list: `components["schemas"]["MonthlyValueList"]` -> `{ data: MonthlyValue[] }`

Note: The `MonthlyValue` type includes an `employee` field of type `EmployeeSummary` (with `first_name`, `last_name`, `personnel_number`, `department_id`).

**IMPORTANT**: The backend handler's `monthlyValueToResponse` currently does NOT populate the `employee` field. The `Employee` relation on the model exists but is not being Preloaded in the repository queries. This means the employee name will need to come from a separate data source or the backend needs a small fix to preload the employee relation.

The `ListAll` repository method does join employees when filtering by department, but does not preload the employee relation for the response. The handler's `monthlyValueToResponse` function maps fields but does NOT set `resp.Employee`.

---

## 11. Response Format Notes

The `/monthly-values` list endpoint returns:
```json
{
    "data": [
        {
            "id": "uuid",
            "employee_id": "uuid",
            "year": 2026,
            "month": 1,
            "status": "calculated",
            "target_minutes": 10080,
            "net_minutes": 9900,
            "overtime_minutes": 420,
            "balance_minutes": 420,
            "working_days": 21,
            "worked_days": 20,
            "absence_days": 1.0,
            "closed_at": null,
            "employee": null  // Currently NOT populated
        }
    ]
}
```

The batch close response:
```json
{
    "closed_count": 15,
    "skipped_count": 2,
    "error_count": 1,
    "errors": [
        { "employee_id": "uuid", "reason": "monthly value is already closed" }
    ]
}
```

The recalculate response (HTTP 202):
```json
{
    "message": "Recalculation started",
    "affected_employees": 25
}
```

---

## 12. Implementation Considerations

### 12.1 Employee Name Resolution
Since the backend does not currently populate the `employee` field in the MonthlyValue response, there are two approaches:
1. **Frontend join**: Fetch employees separately and join client-side (existing pattern in approvals page)
2. **Backend fix**: Add `Preload("Employee")` to the repository's `ListAll` method (preferred)

### 12.2 Pagination
The current `GET /monthly-values` endpoint returns all matching records without pagination. For large tenants, this could be an issue. The ticket should handle this gracefully (possibly using client-side pagination like the correction-assistant page).

### 12.3 Department Filter on Batch Close
The batch close API supports `department_id` as a filter. The UI can either:
- Use selected rows' IDs (explicit employee_ids)
- Or use department_id to close all in department (when no specific selection)

### 12.4 Status Filter Mapping
The OpenAPI spec defines status as enum: `open | calculated | closed | exported`. However, the backend handler maps:
- `closed` -> `IsClosed = true`
- `open` or `calculated` -> `IsClosed = false`

The actual `status` field on the model is computed in the response (not stored), and `calculated` vs `open` is not distinguished at the filter level.

### 12.5 Recalculate Response Code
The recalculate endpoint returns HTTP 202 (Accepted), not 200. The `useApiMutation` hook may need to handle this differently since it checks for 200/201 responses by default.
