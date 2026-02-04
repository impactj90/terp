# Implementation Plan: ZMI-TICKET-043 Monthly Values Batch UI

Date: 2026-02-03
Ticket: ZMI-TICKET-043
Research: thoughts/shared/research/2026-02-03-ZMI-TICKET-043-monthly-values-batch-ui.md

---

## Overview

Build an admin page at `/admin/monthly-values` for batch viewing, closing, reopening, and recalculating monthly values across all employees. Uses the flat `/monthly-values` API routes (not the employee-nested routes used by the existing monthly-evaluation page).

## Critical Note: Employee Name Resolution

The backend handler `monthlyValueToResponse()` in `apps/api/internal/handler/monthly_value.go` does **not** populate the `employee` field. The `Employee` relation exists on the model but is never Preloaded. This plan uses a **frontend join** approach: fetch the employees list separately and merge client-side by `employee_id`. This matches the pattern used elsewhere in the codebase (e.g., the correction-assistant page fetches departments separately).

A backend fix (adding `Preload("Employee")` to the repository's `ListAll` method and mapping it in `monthlyValueToResponse`) would be preferable long-term but is out of scope for this ticket.

---

## Phase 1: API Hooks

**Goal**: Create new hooks for flat `/monthly-values` routes using `useApiQuery`/`useApiMutation`.

### File: `apps/web/src/hooks/api/use-admin-monthly-values.ts` (NEW)

Create a separate file from the existing `use-monthly-values.ts` (which serves the employee-nested routes). This avoids naming conflicts and keeps concerns separated.

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// --- Interfaces ---

interface UseAdminMonthlyValuesOptions {
  year?: number
  month?: number
  status?: 'open' | 'calculated' | 'closed' | 'exported'
  departmentId?: string
  employeeId?: string
  enabled?: boolean
}

// --- Query Hooks ---

/**
 * List all monthly values with filters (flat route).
 * GET /monthly-values
 */
export function useAdminMonthlyValues(options: UseAdminMonthlyValuesOptions = {}) {
  const { year, month, status, departmentId, employeeId, enabled = true } = options
  return useApiQuery('/monthly-values', {
    params: {
      year,
      month,
      status,
      department_id: departmentId,
      employee_id: employeeId,
    },
    enabled,
  })
}

/**
 * Get a single monthly value by ID.
 * GET /monthly-values/{id}
 */
export function useMonthlyValueById(id: string | undefined) {
  return useApiQuery('/monthly-values/{id}', {
    path: { id: id! },
    enabled: !!id,
  })
}

// --- Mutation Hooks ---

/**
 * Close a single month by monthly value ID.
 * POST /monthly-values/{id}/close
 */
export function useCloseMonthById() {
  return useApiMutation('/monthly-values/{id}/close', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Reopen a single month by monthly value ID.
 * POST /monthly-values/{id}/reopen
 */
export function useReopenMonthById() {
  return useApiMutation('/monthly-values/{id}/reopen', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Batch close monthly values.
 * POST /monthly-values/close-batch
 */
export function useCloseMonthBatch() {
  return useApiMutation('/monthly-values/close-batch', 'post', {
    invalidateKeys: [['/monthly-values']],
  })
}

/**
 * Recalculate monthly values.
 * POST /monthly-values/recalculate
 *
 * NOTE: Returns HTTP 202 (Accepted). The useApiMutation MutationResponse
 * type only infers from 200/201 responses, so the return type resolves
 * to void. We use a custom hook with manual typing instead.
 */
export function useRecalculateMonthlyValues() {
  const queryClient = useQueryClient()
  return useMutation<
    { message?: string; affected_employees?: number },
    Error,
    { body: { year: number; month: number; employee_id?: string } }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/monthly-values/recalculate' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as { message?: string; affected_employees?: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/monthly-values'] })
    },
  })
}
```

**Key decisions**:
- Separate file (`use-admin-monthly-values.ts`) to avoid conflicts with existing `use-monthly-values.ts`
- `useRecalculateMonthlyValues` uses a custom `useMutation` because the `MutationResponse` type helper in `use-api-mutation.ts` only handles 200/201 responses, not the 202 returned by the recalculate endpoint
- All mutations invalidate the `['/monthly-values']` query key to refresh the list

### File: `apps/web/src/hooks/api/index.ts` (MODIFY)

Add exports for the new hooks after the existing Monthly Values section:

```typescript
// Admin Monthly Values (flat routes)
export {
  useAdminMonthlyValues,
  useMonthlyValueById,
  useCloseMonthById,
  useReopenMonthById,
  useCloseMonthBatch,
  useRecalculateMonthlyValues,
} from './use-admin-monthly-values'
```

### Verification
- TypeScript compilation: `cd apps/web && npx tsc --noEmit` should pass
- Ensure no naming conflicts with existing `use-monthly-values.ts` exports

### Dependencies
- None (first phase)

---

## Phase 2: Core Components

**Goal**: Build the data table, skeleton, and shared status badge utility.

### File: `apps/web/src/components/monthly-values/monthly-values-data-table.tsx` (NEW)

Data table component following the `correction-assistant-data-table.tsx` and `year-overview-table.tsx` patterns.

```typescript
'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeDisplay } from '@/components/timesheet'
import { cn } from '@/lib/utils'

// Enriched row type (after frontend join with employees data)
export interface MonthlyValueRow {
  id: string
  employee_id: string
  employee_name: string        // From frontend join
  personnel_number: string     // From frontend join
  year: number
  month: number
  status: 'open' | 'calculated' | 'closed' | 'exported'
  target_minutes: number
  net_minutes: number
  overtime_minutes: number
  balance_minutes: number
  absence_days: number
  working_days: number
  worked_days: number
  closed_at: string | null
}

interface MonthlyValuesDataTableProps {
  items: MonthlyValueRow[]
  isLoading: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onRowClick: (item: MonthlyValueRow) => void
}
```

**Columns**: Checkbox | Employee Name | Personnel # | Status (badge) | Target | Net | Overtime | Balance | Absence Days

**Status badge function** (reuse year-overview pattern):
```typescript
function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    open:       { labelKey: 'status.open',       variant: 'outline' as const,    className: '' },
    calculated: { labelKey: 'status.calculated', variant: 'secondary' as const,  className: '' },
    closed:     { labelKey: 'status.closed',     variant: 'default' as const,    className: 'bg-green-600 hover:bg-green-700' },
    exported:   { labelKey: 'status.exported',   variant: 'default' as const,    className: 'bg-blue-600 hover:bg-blue-700' },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open
  return <Badge variant={config.variant} className={config.className}>{t(config.labelKey)}</Badge>
}
```

**Row rendering**: Each row has a checkbox cell (click stops propagation), employee name, personnel number, status badge, and time values using `<TimeDisplay>` with format "duration" for target/net/overtime and "balance" for balance.

**Include a skeleton sub-component** (`MonthlyValuesDataTableSkeleton`) following the correction-assistant skeleton pattern with 10 skeleton rows.

### File: `apps/web/src/components/monthly-values/monthly-values-skeleton.tsx` (NEW)

Page-level skeleton following `correction-assistant-skeleton.tsx`:

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export function MonthlyValuesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Toolbar area */}
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      {/* Table area */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}
```

### Verification
- Component renders without errors with empty items array
- Status badges display correct variants for each status value
- TimeDisplay renders minutes as hours:minutes format
- Checkbox click does not trigger row click

### Dependencies
- Phase 1 (type reference for MonthlyValueRow enrichment)

---

## Phase 3: Toolbar & Filters

**Goal**: Build the filter toolbar and batch action bar.

### File: `apps/web/src/components/monthly-values/monthly-values-toolbar.tsx` (NEW)

Filter toolbar following `correction-assistant-filters.tsx` pattern with these controls:

**Year/Month selector** (following monthly-evaluation's ChevronLeft/ChevronRight pattern):
```typescript
interface MonthlyValuesToolbarProps {
  year: number
  month: number
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  departmentId: string | null
  onDepartmentChange: (id: string | null) => void
  departments: Array<{ id: string; name: string }>
  isLoadingDepartments: boolean
  status: string
  onStatusChange: (status: string) => void
  search: string
  onSearchChange: (search: string) => void
  onClearFilters: () => void
  hasFilters: boolean
}
```

**Layout** (responsive grid):
```
Row 1: [Month/Year Navigator] [Department Select] [Status Select] [Search Input]
Row 2: [Clear Filters button] (if hasFilters)
```

**Month/Year navigator**: Use a combined navigator with ChevronLeft/ChevronRight buttons. Clicking left decrements month (wrapping year). Clicking right increments. Display label as "January 2026" using `Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })`.

**Department filter**: Select dropdown with "All Departments" default, populated from `useDepartments`.

**Status filter**: Select dropdown with options: All, Open, Calculated, Closed, Exported. Note: backend only distinguishes `closed` vs `not closed` at the filter level. The "Open" and "Calculated" status filters will both send `status=open` or `status=calculated` to the API (both map to `IsClosed=false` on the backend). Client-side post-filtering is NOT needed since the backend already returns the computed status field on each record; frontend filtering can be applied client-side after the query if needed.

**Search input**: Client-side filter on employee name/personnel number (since the API does not support search). Use `Input` component with debounced filtering in the parent page component.

### File: `apps/web/src/components/monthly-values/monthly-values-batch-actions.tsx` (NEW)

Batch action bar following `approval-bulk-actions.tsx` pattern:

```typescript
interface MonthlyValuesBatchActionsProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onBatchClose: () => void
  onBatchReopen: () => void
  onRecalculate: () => void
  isLoading: boolean
  className?: string
}
```

**Layout**:
```
[Checkbox (select all)] ["{N} selected"] | [Close Selected] [Reopen Selected] [Recalculate]
```

- Shows when `totalCount > 0`
- "Close Selected" and "Reopen Selected" buttons disabled when `selectedCount === 0`
- "Recalculate" button always available (operates on entire month, not selection)
- Close/Reopen buttons use appropriate icons (`Lock`/`Unlock` from lucide-react)

### Verification
- Month navigation wraps correctly (Dec -> Jan of next year, Jan -> Dec of previous year)
- Department filter shows all departments from API
- Status filter correctly maps to API values
- Search filters client-side by employee name/personnel number
- Batch action bar appears/disappears based on totalCount
- Select All / Clear Selection toggle works

### Dependencies
- Phase 2 (MonthlyValueRow type)

---

## Phase 4: Dialog Components

**Goal**: Build batch close, batch reopen, and recalculate dialog/sheet components.

### File: `apps/web/src/components/monthly-values/batch-close-dialog.tsx` (NEW)

Batch close confirmation dialog following `close-month-sheet.tsx` pattern but adapted for batch operations.

```typescript
interface BatchCloseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  monthLabel: string
  selectedIds: string[]               // Selected monthly value IDs
  selectedEmployeeIds: string[]       // Corresponding employee IDs
  departmentId: string | null         // Current department filter
  departmentName: string | null       // For display
}
```

**UI structure** (using `Sheet` component, right side):
- Title: "Batch Close Month"
- Description: "{monthLabel}" with count info
- Info panel: "Closing {N} employees" or "Closing all employees in {department}"
- Checkbox: "Recalculate before closing" (default: true)
- Submit calls `useCloseMonthBatch()` with:
  - If specific employees selected: `{ year, month, employee_ids: selectedEmployeeIds, recalculate }`
  - If no specific selection but department filter: `{ year, month, department_id: departmentId, recalculate }`
- **Result display** (after mutation completes): Show summary panel with:
  - "Closed: {closed_count}"
  - "Skipped: {skipped_count}" (already closed)
  - "Errors: {error_count}"
  - Expandable error list with employee ID and reason
- Footer: Cancel + "Close Month" / "Done" (after results shown)

**State machine**: `idle` -> `confirming` -> `processing` -> `results`

### File: `apps/web/src/components/monthly-values/batch-reopen-dialog.tsx` (NEW)

Batch reopen dialog following `reopen-month-sheet.tsx` pattern. Since there is no batch reopen endpoint, this processes individual reopen calls sequentially.

```typescript
interface BatchReopenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  monthLabel: string
  selectedItems: Array<{ id: string; employee_name: string }>
}
```

**UI structure** (using `Sheet` component):
- Title: "Batch Reopen Month"
- Warning alert: reopening consequences (from `reopen-month-sheet.tsx` pattern)
- Reason textarea: required, min 10 chars
- Employee list: shows names of selected employees
- Submit: sequential loop calling `useReopenMonthById()` for each selected ID
- **Progress indicator**: "Reopening {current}/{total}..."
- **Result display**: Success count and any errors
- Uses the approvals-page sequential processing pattern:
  ```typescript
  for (const item of selectedItems) {
    try {
      await reopenMutation.mutateAsync({ path: { id: item.id }, body: { reason } })
      successCount++
    } catch {
      errors.push({ employee_name: item.employee_name, reason: 'Failed to reopen' })
    }
  }
  ```

### File: `apps/web/src/components/monthly-values/recalculate-dialog.tsx` (NEW)

Recalculation trigger dialog.

```typescript
interface RecalculateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  monthLabel: string
}
```

**UI structure** (using `AlertDialog` or `Dialog` component for simplicity):
- Title: "Recalculate Monthly Values"
- Description: "Recalculate all monthly values for {monthLabel}"
- Info text explaining what recalculation does
- Submit: calls `useRecalculateMonthlyValues()` with `{ body: { year, month } }`
- On success (202): show toast "Recalculation started for {affected_employees} employees" and close dialog
- After close: suggest user to refresh (or auto-refresh via query invalidation)

### Verification
- Batch close dialog sends correct request body (with/without employee_ids)
- Batch close result panel shows correct counts
- Batch reopen validates reason >= 10 chars before submitting
- Batch reopen shows progress during sequential processing
- Recalculate dialog shows success toast on 202 response
- All dialogs properly reset state when closed

### Dependencies
- Phase 1 (API hooks)
- Phase 2 (MonthlyValueRow type for employee names)

---

## Phase 5: Detail Sheet

**Goal**: Build the monthly value detail sheet showing all fields for a single employee's month.

### File: `apps/web/src/components/monthly-values/monthly-values-detail-sheet.tsx` (NEW)

Detail sheet following `correction-assistant-detail-sheet.tsx` pattern.

```typescript
import type { MonthlyValueRow } from './monthly-values-data-table'

interface MonthlyValuesDetailSheetProps {
  item: MonthlyValueRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: (id: string) => void       // Trigger close for this monthly value
  onReopen: (id: string) => void      // Trigger reopen for this monthly value
}
```

**UI structure** (Sheet, right side, `sm:max-w-lg`):

**Header**:
- Title: "{Employee Name} - {Month Year}"
- Description: Personnel number

**Content sections** (inside ScrollArea):

1. **Time Summary** (bordered card):
   ```
   Target Hours    | <TimeDisplay value={target_minutes} format="duration" />
   Net Hours       | <TimeDisplay value={net_minutes} format="duration" />
   Overtime        | <TimeDisplay value={overtime_minutes} format="duration" />
   Balance         | <TimeDisplay value={balance_minutes} format="balance" />
   ```

2. **Work Days** (bordered card):
   ```
   Working Days    | {working_days}
   Worked Days     | {worked_days}
   Absence Days    | {absence_days}
   ```

3. **Closing Info** (bordered card):
   ```
   Status          | <StatusBadge />
   Closed At       | {formatted date or "-"}
   ```

**Footer**:
- "Close" button (outline, always visible, navigates away)
- "Close Month" button (conditional: only when status is `open` or `calculated`)
- "Reopen Month" button (conditional: only when status is `closed`, destructive variant)

**Note**: The `useMonthlyValueById(id)` hook can optionally be called here to get the freshest data, but since the list already contains all needed fields, the initial render uses the row data passed as prop. The `onClose`/`onReopen` callbacks are handled by the parent page, which opens the appropriate dialog.

### Verification
- Sheet opens with correct data when a row is clicked
- Time values display in H:MM format
- Close Month button only shows for open/calculated months
- Reopen Month button only shows for closed months
- "Go to Employee" button navigates to `/admin/employees/{employee_id}`

### Dependencies
- Phase 2 (MonthlyValueRow type, status badge utility)

---

## Phase 6: Main Page & Navigation

**Goal**: Wire everything together in the admin page, add sidebar/breadcrumb entries, and add translations.

### File: `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx` (NEW)

Main admin page following `correction-assistant/page.tsx` pattern.

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useAdminMonthlyValues,
  useEmployees,
  useDepartments,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import {
  MonthlyValuesDataTable,
  MonthlyValuesToolbar,
  MonthlyValuesBatchActions,
  MonthlyValuesDetailSheet,
  BatchCloseDialog,
  BatchReopenDialog,
  RecalculateDialog,
  MonthlyValuesSkeleton,
} from '@/components/monthly-values'
import type { MonthlyValueRow } from '@/components/monthly-values/monthly-values-data-table'
```

**State management**:
```typescript
// Auth
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

// Filters
const [year, setYear] = useState(() => new Date().getFullYear())
const [month, setMonth] = useState(() => new Date().getMonth() + 1)
const [departmentId, setDepartmentId] = useState<string | null>(null)
const [statusFilter, setStatusFilter] = useState<string>('all')
const [search, setSearch] = useState('')

// Selection
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

// Detail sheet
const [selectedItem, setSelectedItem] = useState<MonthlyValueRow | null>(null)

// Dialogs
const [batchCloseOpen, setBatchCloseOpen] = useState(false)
const [batchReopenOpen, setBatchReopenOpen] = useState(false)
const [recalculateOpen, setRecalculateOpen] = useState(false)
```

**Data fetching**:
```typescript
const enabled = !authLoading && isAdmin

// Monthly values
const { data: mvData, isLoading: mvLoading } = useAdminMonthlyValues({
  year,
  month,
  departmentId: departmentId ?? undefined,
  // Status filter: only pass to API if "closed" (the only distinct backend filter)
  // For "open" and "calculated", the backend returns IsClosed=false for both
  status: statusFilter !== 'all' ? statusFilter as any : undefined,
  enabled,
})

// Employees (for frontend join)
const { data: employeesData } = useEmployees({ enabled })

// Departments (for filter dropdown)
const { data: departmentsData, isLoading: departmentsLoading } = useDepartments({ enabled })
```

**Frontend join** (enriching monthly values with employee names):
```typescript
const enrichedRows: MonthlyValueRow[] = React.useMemo(() => {
  const monthlyValues = mvData?.data ?? []
  const employees = employeesData?.data ?? []

  // Build employee lookup map
  const employeeMap = new Map<string, { first_name: string; last_name: string; personnel_number: string }>()
  for (const emp of employees) {
    employeeMap.set(emp.id, {
      first_name: emp.first_name ?? '',
      last_name: emp.last_name ?? '',
      personnel_number: emp.personnel_number ?? '',
    })
  }

  return monthlyValues.map((mv) => {
    const emp = employeeMap.get(mv.employee_id ?? '')
    return {
      id: mv.id ?? '',
      employee_id: mv.employee_id ?? '',
      employee_name: emp ? `${emp.last_name}, ${emp.first_name}` : mv.employee_id ?? '',
      personnel_number: emp?.personnel_number ?? '',
      year: mv.year ?? year,
      month: mv.month ?? month,
      status: (mv.status ?? 'open') as MonthlyValueRow['status'],
      target_minutes: mv.target_minutes ?? 0,
      net_minutes: mv.net_minutes ?? 0,
      overtime_minutes: mv.overtime_minutes ?? 0,
      balance_minutes: mv.balance_minutes ?? 0,
      absence_days: mv.absence_days ?? 0,
      working_days: mv.working_days ?? 0,
      worked_days: mv.worked_days ?? 0,
      closed_at: mv.closed_at ?? null,
    }
  })
}, [mvData, employeesData, year, month])
```

**Client-side search filter**:
```typescript
const filteredRows = React.useMemo(() => {
  let rows = enrichedRows

  // Client-side status filter for open vs calculated distinction
  if (statusFilter === 'open') {
    rows = rows.filter((r) => r.status === 'open')
  } else if (statusFilter === 'calculated') {
    rows = rows.filter((r) => r.status === 'calculated')
  }

  // Client-side search
  if (search) {
    const searchLower = search.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.employee_name.toLowerCase().includes(searchLower) ||
        r.personnel_number.toLowerCase().includes(searchLower)
    )
  }

  return rows
}, [enrichedRows, statusFilter, search])
```

**Selection handlers** (following approvals pattern):
```typescript
const handleToggleSelect = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}
const handleSelectAll = () => setSelectedIds(new Set(filteredRows.map((r) => r.id)))
const handleClearSelection = () => setSelectedIds(new Set())
```

**Clear selection when filters change**:
```typescript
React.useEffect(() => {
  setSelectedIds(new Set())
}, [year, month, departmentId, statusFilter])
```

**Month label** (for dialogs):
```typescript
const monthLabel = React.useMemo(() => {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  return formatter.format(new Date(year, month - 1, 1))
}, [year, month, locale])
```

**Selected items for batch reopen**:
```typescript
const selectedItems = React.useMemo(() => {
  return filteredRows.filter((r) => selectedIds.has(r.id))
}, [filteredRows, selectedIds])

const selectedEmployeeIds = React.useMemo(() => {
  return selectedItems.map((r) => r.employee_id)
}, [selectedItems])
```

**JSX structure**:
```tsx
return (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
      <p className="text-muted-foreground">{t('page.subtitle')}</p>
    </div>

    <MonthlyValuesToolbar ... />

    <MonthlyValuesBatchActions
      selectedCount={selectedIds.size}
      totalCount={filteredRows.length}
      onSelectAll={handleSelectAll}
      onClearSelection={handleClearSelection}
      onBatchClose={() => setBatchCloseOpen(true)}
      onBatchReopen={() => setBatchReopenOpen(true)}
      onRecalculate={() => setRecalculateOpen(true)}
      isLoading={false}
    />

    <Card>
      <CardContent className="p-0">
        {mvLoading ? (
          <MonthlyValuesDataTable items={[]} isLoading={true} ... />
        ) : filteredRows.length === 0 ? (
          <EmptyState />
        ) : (
          <MonthlyValuesDataTable
            items={filteredRows}
            isLoading={false}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onRowClick={setSelectedItem}
          />
        )}
      </CardContent>
    </Card>

    <MonthlyValuesDetailSheet
      item={selectedItem}
      open={!!selectedItem}
      onOpenChange={(open) => { if (!open) setSelectedItem(null) }}
      onClose={(id) => { /* open individual close dialog or call mutation */ }}
      onReopen={(id) => { /* open individual reopen dialog or call mutation */ }}
    />

    <BatchCloseDialog
      open={batchCloseOpen}
      onOpenChange={setBatchCloseOpen}
      year={year}
      month={month}
      monthLabel={monthLabel}
      selectedIds={Array.from(selectedIds)}
      selectedEmployeeIds={selectedEmployeeIds}
      departmentId={departmentId}
      departmentName={departments.find(d => d.id === departmentId)?.name ?? null}
    />

    <BatchReopenDialog
      open={batchReopenOpen}
      onOpenChange={setBatchReopenOpen}
      year={year}
      month={month}
      monthLabel={monthLabel}
      selectedItems={selectedItems.map(r => ({ id: r.id, employee_name: r.employee_name }))}
    />

    <RecalculateDialog
      open={recalculateOpen}
      onOpenChange={setRecalculateOpen}
      year={year}
      month={month}
      monthLabel={monthLabel}
    />
  </div>
)
```

### File: `apps/web/src/components/monthly-values/index.ts` (NEW)

Barrel export:
```typescript
export { MonthlyValuesDataTable } from './monthly-values-data-table'
export type { MonthlyValueRow } from './monthly-values-data-table'
export { MonthlyValuesToolbar } from './monthly-values-toolbar'
export { MonthlyValuesBatchActions } from './monthly-values-batch-actions'
export { MonthlyValuesDetailSheet } from './monthly-values-detail-sheet'
export { BatchCloseDialog } from './batch-close-dialog'
export { BatchReopenDialog } from './batch-reopen-dialog'
export { RecalculateDialog } from './recalculate-dialog'
export { MonthlyValuesSkeleton } from './monthly-values-skeleton'
```

### File: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)

Add import for `CalendarCheck` icon and add nav item in the "management" section after "correctionAssistant":

```typescript
// Add to imports:
import { ..., CalendarCheck } from 'lucide-react'

// Add in management items array, after correctionAssistant entry:
{
  titleKey: 'monthlyValues',
  href: '/admin/monthly-values',
  icon: CalendarCheck,
  roles: ['admin'],
},
```

### File: `apps/web/src/components/layout/breadcrumbs.tsx` (MODIFY)

Add to `segmentToKey` mapping:

```typescript
'monthly-values': 'monthlyValues',
```

### File: `apps/web/messages/en.json` (MODIFY)

Add entries in three locations:

1. **nav section** (after `"correctionAssistant": "Correction Assistant"`):
```json
"monthlyValues": "Monthly Values"
```

2. **breadcrumbs section** (after `"correctionAssistant": "Correction Assistant"`):
```json
"monthlyValues": "Monthly Values"
```

3. **New top-level namespace** `"monthlyValues"`:
```json
"monthlyValues": {
  "page": {
    "title": "Monthly Values",
    "subtitle": "View and manage monthly values for all employees"
  },
  "toolbar": {
    "allDepartments": "All Departments",
    "allStatuses": "All Statuses",
    "searchPlaceholder": "Search employee...",
    "clearFilters": "Clear filters"
  },
  "status": {
    "open": "Open",
    "calculated": "Calculated",
    "closed": "Closed",
    "exported": "Exported"
  },
  "table": {
    "employee": "Employee",
    "personnelNumber": "Pers. No.",
    "status": "Status",
    "target": "Target",
    "net": "Net",
    "overtime": "Overtime",
    "balance": "Balance",
    "absenceDays": "Absence Days",
    "workingDays": "Work Days"
  },
  "batch": {
    "selectAll": "Select all",
    "selectedCount": "{count} selected",
    "closeSelected": "Close Selected",
    "reopenSelected": "Reopen Selected",
    "recalculate": "Recalculate"
  },
  "batchClose": {
    "title": "Batch Close Month",
    "description": "Close monthly values for {monthLabel}",
    "closingEmployees": "Closing {count} employees",
    "closingDepartment": "Closing all employees in {department}",
    "closingAll": "Closing all employees",
    "recalculateBeforeClosing": "Recalculate before closing",
    "recalculateDescription": "Ensures all values are up-to-date before finalizing. Recommended.",
    "confirm": "Close Month",
    "processing": "Processing...",
    "resultTitle": "Batch Close Results",
    "closed": "Closed",
    "skipped": "Skipped (already closed)",
    "errors": "Errors",
    "errorDetail": "Error details",
    "done": "Done"
  },
  "batchReopen": {
    "title": "Batch Reopen Month",
    "description": "Reopen monthly values for {monthLabel}",
    "warning": "Reopening closed months will unlock all time entries. Any changes will require recalculation before closing again.",
    "reopeningEmployees": "Reopening {count} employees",
    "reasonLabel": "Reason for reopening",
    "reasonPlaceholder": "Explain why these months need to be reopened...",
    "minCharacters": "Minimum 10 characters. {count}/10",
    "reasonTooShort": "Please provide a reason with at least 10 characters",
    "confirm": "Reopen Months",
    "progress": "Reopening {current} of {total}...",
    "resultTitle": "Batch Reopen Results",
    "reopened": "Reopened",
    "errors": "Errors",
    "done": "Done"
  },
  "recalculate": {
    "title": "Recalculate Monthly Values",
    "description": "Recalculate all monthly values for {monthLabel}",
    "info": "This will recalculate time totals, overtime, and balance for all employees. Closed months will be skipped.",
    "confirm": "Recalculate",
    "success": "Recalculation started for {count} employees",
    "refreshHint": "Values will be updated shortly. Refresh to see changes."
  },
  "detail": {
    "timeSummary": "Time Summary",
    "target": "Target Hours",
    "net": "Net Hours",
    "overtime": "Overtime",
    "balance": "Balance",
    "workDays": "Work Days",
    "workingDays": "Working Days",
    "workedDays": "Worked Days",
    "absenceDays": "Absence Days",
    "closingInfo": "Closing Info",
    "status": "Status",
    "closedAt": "Closed At",
    "close": "Close",
    "closeMonth": "Close Month",
    "reopenMonth": "Reopen Month",
    "goToEmployee": "Go to Employee"
  },
  "empty": {
    "title": "No monthly values found",
    "description": "No monthly values exist for this period. You may need to run a recalculation first."
  },
  "count": {
    "item": "{count} employee",
    "items": "{count} employees"
  }
}
```

### File: `apps/web/messages/de.json` (MODIFY)

Add corresponding German translations in all three locations:

1. **nav section**: `"monthlyValues": "Monatswerte"`
2. **breadcrumbs section**: `"monthlyValues": "Monatswerte"`
3. **New top-level namespace** `"monthlyValues"`:

```json
"monthlyValues": {
  "page": {
    "title": "Monatswerte",
    "subtitle": "Monatswerte aller Mitarbeiter anzeigen und verwalten"
  },
  "toolbar": {
    "allDepartments": "Alle Abteilungen",
    "allStatuses": "Alle Status",
    "searchPlaceholder": "Mitarbeiter suchen...",
    "clearFilters": "Filter zurücksetzen"
  },
  "status": {
    "open": "Offen",
    "calculated": "Berechnet",
    "closed": "Geschlossen",
    "exported": "Exportiert"
  },
  "table": {
    "employee": "Mitarbeiter",
    "personnelNumber": "Pers. Nr.",
    "status": "Status",
    "target": "Soll",
    "net": "Netto",
    "overtime": "Überstunden",
    "balance": "Saldo",
    "absenceDays": "Abwesenheitstage",
    "workingDays": "Arbeitstage"
  },
  "batch": {
    "selectAll": "Alle auswählen",
    "selectedCount": "{count} ausgewählt",
    "closeSelected": "Ausgewählte schließen",
    "reopenSelected": "Ausgewählte öffnen",
    "recalculate": "Neuberechnen"
  },
  "batchClose": {
    "title": "Monat stapelweise schließen",
    "description": "Monatswerte für {monthLabel} schließen",
    "closingEmployees": "{count} Mitarbeiter schließen",
    "closingDepartment": "Alle Mitarbeiter in {department} schließen",
    "closingAll": "Alle Mitarbeiter schließen",
    "recalculateBeforeClosing": "Vor dem Schließen neuberechnen",
    "recalculateDescription": "Stellt sicher, dass alle Werte aktuell sind. Empfohlen.",
    "confirm": "Monat schließen",
    "processing": "Verarbeitung...",
    "resultTitle": "Ergebnisse",
    "closed": "Geschlossen",
    "skipped": "Übersprungen (bereits geschlossen)",
    "errors": "Fehler",
    "errorDetail": "Fehlerdetails",
    "done": "Fertig"
  },
  "batchReopen": {
    "title": "Monat stapelweise öffnen",
    "description": "Monatswerte für {monthLabel} wieder öffnen",
    "warning": "Das Öffnen geschlossener Monate entsperrt alle Zeiteinträge. Änderungen erfordern eine Neuberechnung vor dem erneuten Schließen.",
    "reopeningEmployees": "{count} Mitarbeiter wieder öffnen",
    "reasonLabel": "Grund für das Öffnen",
    "reasonPlaceholder": "Erklären Sie, warum diese Monate geöffnet werden müssen...",
    "minCharacters": "Mindestens 10 Zeichen. {count}/10",
    "reasonTooShort": "Bitte geben Sie einen Grund mit mindestens 10 Zeichen an",
    "confirm": "Monate öffnen",
    "progress": "Öffne {current} von {total}...",
    "resultTitle": "Ergebnisse",
    "reopened": "Geöffnet",
    "errors": "Fehler",
    "done": "Fertig"
  },
  "recalculate": {
    "title": "Monatswerte neuberechnen",
    "description": "Alle Monatswerte für {monthLabel} neuberechnen",
    "info": "Dies berechnet Zeitsummen, Überstunden und Saldo für alle Mitarbeiter neu. Geschlossene Monate werden übersprungen.",
    "confirm": "Neuberechnen",
    "success": "Neuberechnung für {count} Mitarbeiter gestartet",
    "refreshHint": "Die Werte werden in Kürze aktualisiert. Aktualisieren Sie die Seite, um Änderungen zu sehen."
  },
  "detail": {
    "timeSummary": "Zeitübersicht",
    "target": "Soll-Stunden",
    "net": "Netto-Stunden",
    "overtime": "Überstunden",
    "balance": "Saldo",
    "workDays": "Arbeitstage",
    "workingDays": "Arbeitstage (Soll)",
    "workedDays": "Gearbeitete Tage",
    "absenceDays": "Abwesenheitstage",
    "closingInfo": "Abschlussinfo",
    "status": "Status",
    "closedAt": "Geschlossen am",
    "close": "Schließen",
    "closeMonth": "Monat schließen",
    "reopenMonth": "Monat öffnen",
    "goToEmployee": "Zum Mitarbeiter"
  },
  "empty": {
    "title": "Keine Monatswerte gefunden",
    "description": "Für diesen Zeitraum existieren keine Monatswerte. Möglicherweise muss zuerst eine Neuberechnung durchgeführt werden."
  },
  "count": {
    "item": "{count} Mitarbeiter",
    "items": "{count} Mitarbeiter"
  }
}
```

### Verification
- Page loads at `/admin/monthly-values` for admin users
- Non-admin users are redirected to dashboard
- Skeleton shows while loading
- Data table shows enriched rows with employee names
- All filters work (department, status, search)
- Selection works (individual + select all)
- All dialogs open and function correctly
- Navigation shows "Monthly Values" in sidebar management section
- Breadcrumb shows "Administration > Monthly Values"
- All translations render correctly in both en and de

### Dependencies
- Phase 1 (API hooks)
- Phase 2 (Data table, skeleton)
- Phase 3 (Toolbar, batch actions)
- Phase 4 (Dialogs)
- Phase 5 (Detail sheet)

---

## Phase 7: Verification & Testing

### Manual Testing Checklist

1. **Page access**:
   - [ ] Navigate to `/admin/monthly-values` as admin
   - [ ] Verify redirect to `/dashboard` for non-admin users
   - [ ] Verify page skeleton appears while loading

2. **Data display**:
   - [ ] Table shows all employees for current month
   - [ ] Employee names display correctly (from frontend join)
   - [ ] Time values show in H:MM format (e.g., "168:00")
   - [ ] Status badges show correct colors for each status
   - [ ] Empty state message appears when no data exists

3. **Filters**:
   - [ ] Month/year navigation increments/decrements correctly
   - [ ] Department filter limits results to department employees
   - [ ] Status filter shows correct subset
   - [ ] Search filters by employee name and personnel number
   - [ ] Clear filters resets all filters
   - [ ] Selection clears when filters change

4. **Selection & batch actions**:
   - [ ] Individual row checkbox toggles selection
   - [ ] Select all selects all visible rows
   - [ ] Selection count displays correctly
   - [ ] Batch action bar appears when rows exist

5. **Batch close**:
   - [ ] Dialog opens with correct month/year and employee count
   - [ ] Recalculate checkbox defaults to checked
   - [ ] Submit sends correct request body
   - [ ] Result shows closed/skipped/error counts
   - [ ] Error details are expandable
   - [ ] Table refreshes after closing dialog

6. **Batch reopen**:
   - [ ] Dialog opens with selected employee names
   - [ ] Reason validation requires 10+ characters
   - [ ] Sequential processing shows progress
   - [ ] Result shows reopened count and any errors
   - [ ] Table refreshes after completion

7. **Recalculate**:
   - [ ] Dialog opens with current month/year
   - [ ] Submit triggers recalculation
   - [ ] Success toast shows affected employee count
   - [ ] Table data refreshes

8. **Detail sheet**:
   - [ ] Opens when clicking a table row
   - [ ] Shows correct time summary
   - [ ] Shows correct work days
   - [ ] Shows closing info
   - [ ] Close Month button only visible for open/calculated months
   - [ ] Reopen Month button only visible for closed months
   - [ ] "Go to Employee" button navigates correctly

9. **Navigation**:
   - [ ] Sidebar shows "Monthly Values" in Management section
   - [ ] Breadcrumb shows correct path
   - [ ] Both English and German translations display correctly

### Known Limitations

1. **Employee field not populated by backend**: The `employee` field in MonthlyValue responses is always `null`. The frontend join approach adds a dependency on the employees list query. For tenants with very large employee counts, this could cause performance issues. A backend fix to preload the Employee relation would eliminate this limitation.

2. **Status filter limitation**: The backend only distinguishes `closed` vs `not closed`. Filtering between "open" and "calculated" is done client-side after fetching `IsClosed=false` results. This means the full dataset for non-closed months is always fetched.

3. **No server-side pagination**: The `GET /monthly-values` endpoint returns all matching records without pagination. For very large tenants, client-side rendering of all rows may be slow. Consider adding virtual scrolling or server-side pagination in a follow-up ticket.

4. **Recalculate is synchronous despite 202**: The backend's recalculate endpoint runs the calculation synchronously and returns results, despite returning HTTP 202. The query invalidation after mutation completion should show updated data immediately.

5. **No batch reopen endpoint**: Batch reopen processes individual API calls sequentially. For large selections, this could be slow. A backend batch reopen endpoint would improve performance.

---

## File Summary

### New Files (10)
1. `apps/web/src/hooks/api/use-admin-monthly-values.ts`
2. `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`
3. `apps/web/src/components/monthly-values/index.ts`
4. `apps/web/src/components/monthly-values/monthly-values-data-table.tsx`
5. `apps/web/src/components/monthly-values/monthly-values-skeleton.tsx`
6. `apps/web/src/components/monthly-values/monthly-values-toolbar.tsx`
7. `apps/web/src/components/monthly-values/monthly-values-batch-actions.tsx`
8. `apps/web/src/components/monthly-values/monthly-values-detail-sheet.tsx`
9. `apps/web/src/components/monthly-values/batch-close-dialog.tsx`
10. `apps/web/src/components/monthly-values/batch-reopen-dialog.tsx`
11. `apps/web/src/components/monthly-values/recalculate-dialog.tsx`

### Modified Files (6)
1. `apps/web/src/hooks/api/index.ts` - Add admin monthly value hook exports
2. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add nav entry + CalendarCheck import
3. `apps/web/src/components/layout/breadcrumbs.tsx` - Add `monthly-values` segment mapping
4. `apps/web/messages/en.json` - Add nav, breadcrumb, and monthlyValues namespace translations
5. `apps/web/messages/de.json` - Add German translations

### Implementation Order
Phase 1 (hooks) -> Phase 2 (table + skeleton) -> Phase 3 (toolbar + batch bar) -> Phase 4 (dialogs) -> Phase 5 (detail sheet) -> Phase 6 (page + nav + translations) -> Phase 7 (verification)

Each phase can be verified independently before proceeding to the next.
