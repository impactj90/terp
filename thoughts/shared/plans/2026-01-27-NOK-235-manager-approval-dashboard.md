# Implementation Plan: NOK-235 Manager Approval Dashboard

**Date:** 2026-01-27
**Ticket:** NOK-235 - Create manager approval dashboard for timesheets and absences
**Status:** Plan ready

---

## Overview

Build an admin-only approval dashboard at `/admin/approvals` with two tabs: **Absences** (pending absence requests) and **Timesheets** (daily values with errors/pending status). Each tab displays a filterable data table with checkbox selection, individual approve/reject actions, and bulk approve functionality. A rejection reason modal is shown when rejecting absences.

### Key Design Decisions

1. **Access control**: Admin-only (using existing `useHasRole(['admin'])` pattern). There is no "manager" role in the system; only `user` and `admin` exist. The dashboard will be restricted to admins.

2. **Backend gaps**: The backend does NOT currently implement `POST /absences/{id}/approve`, `POST /absences/{id}/reject`, or `GET /absences` (global list). These must be implemented first. The `POST /daily-values/{id}/approve` endpoint is defined in the OpenAPI spec but may also be unimplemented. Frontend hooks `useApproveAbsence()` and `useRejectAbsence()` already exist.

3. **No bulk approve endpoint**: Each item must be approved individually via sequential API calls. The frontend will loop through selected IDs calling the approve endpoint for each one, with progress indication.

4. **Tabs**: Use the existing Radix Tabs component (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) already used in the timesheet page.

5. **Component reuse**: Leverage existing `Checkbox`, `Table`, `Badge`, `ConfirmDialog`, `Dialog`, `Select`, `DateRangePicker`, `SearchInput`, `Skeleton`, `Card`, `Button` components.

---

## Phase 1: Backend - Implement Absence Approval Endpoints

### Files to Create/Modify

1. **`apps/api/internal/service/absence.go`** - Add `Approve` and `Reject` methods
2. **`apps/api/internal/handler/absence.go`** - Add `ListAll`, `Approve`, `Reject` handlers
3. **`apps/api/internal/handler/routes.go`** - Register new routes
4. **`apps/api/internal/repository/absenceday.go`** - Add `Update` and `ListAll` methods (if not present)

### Implementation Details

#### 1.1 Repository: Add `Update` and `ListAll` to AbsenceDay repository

Add to the absenceday repository interface and implementation:

```go
// ListAll returns absences matching optional filters (status, from, to, employeeID)
func (r *AbsenceDayRepository) ListAll(ctx context.Context, tenantID uuid.UUID, opts AbsenceListOptions) ([]model.AbsenceDay, error)

// Update persists changes to an existing absence day record
func (r *AbsenceDayRepository) Update(ctx context.Context, ad *model.AbsenceDay) error
```

`AbsenceListOptions` struct:
```go
type AbsenceListOptions struct {
    EmployeeID    *uuid.UUID
    AbsenceTypeID *uuid.UUID
    Status        *model.AbsenceStatus
    From          *time.Time
    To            *time.Time
}
```

The `ListAll` query should preload `Employee` and `AbsenceType` relations so the response includes employee names and type names for the table display.

#### 1.2 Service: Add `ListAll`, `Approve`, and `Reject`

```go
// ListAll returns filtered absences for a tenant
func (s *AbsenceService) ListAll(ctx context.Context, tenantID uuid.UUID, opts AbsenceListOptions) ([]model.AbsenceDay, error)

// Approve transitions an absence from pending to approved
func (s *AbsenceService) Approve(ctx context.Context, id, approvedBy uuid.UUID) (*model.AbsenceDay, error)
// - Validates absence exists and is in "pending" status
// - Sets status=approved, approved_by, approved_at=now
// - Triggers recalculation for the affected date
// - Returns ErrAbsenceNotPending if not in pending state

// Reject transitions an absence from pending to rejected
func (s *AbsenceService) Reject(ctx context.Context, id uuid.UUID, reason string) (*model.AbsenceDay, error)
// - Validates absence exists and is in "pending" status
// - Sets status=rejected, rejection_reason=reason
// - Triggers recalculation for the affected date
// - Returns ErrAbsenceNotPending if not in pending state
```

Add new error:
```go
var ErrAbsenceNotPending = errors.New("absence is not in pending status")
```

#### 1.3 Handler: Add `ListAll`, `Approve`, `Reject`

```go
// ListAll handles GET /absences (with query filters)
func (h *AbsenceHandler) ListAll(w http.ResponseWriter, r *http.Request)
// Query params: employee_id, absence_type_id, from, to, status

// Approve handles POST /absences/{id}/approve
func (h *AbsenceHandler) Approve(w http.ResponseWriter, r *http.Request)
// Returns 200 with approved absence, or 400 if not pending

// Reject handles POST /absences/{id}/reject
func (h *AbsenceHandler) Reject(w http.ResponseWriter, r *http.Request)
// Body: { "reason": "string" }
// Returns 200 with rejected absence, or 400 if not pending
```

#### 1.4 Routes: Register new endpoints

In `RegisterAbsenceRoutes`:
```go
r.Get("/absences", h.ListAll)
r.Post("/absences/{id}/approve", h.Approve)
r.Post("/absences/{id}/reject", h.Reject)
```

### Verification

- Run `make test` to ensure no regressions
- Test `GET /absences?status=pending` returns pending absences with employee and type details
- Test `POST /absences/{id}/approve` transitions status correctly
- Test `POST /absences/{id}/reject` with reason body
- Test error cases (approving already-approved, rejecting non-pending)
- Run `make lint`

---

## Phase 2: Backend - Implement Daily Value Approval Endpoint (if needed)

### Check First

Verify whether `POST /daily-values/{id}/approve` is already implemented. Check for a handler method in the daily values handler.

### Files to Create/Modify (if not implemented)

1. **`apps/api/internal/handler/daily_value.go`** (or equivalent) - Add `Approve` handler
2. **`apps/api/internal/service/daily_calc.go`** (or equivalent) - Add `Approve` method
3. **`apps/api/internal/handler/routes.go`** - Register route if not present

### Implementation Details

The daily values approve endpoint marks a daily value as "approved" (from "calculated" status). It should reject approval if the daily value has errors (`has_errors = true`).

### Verification

- Test `POST /daily-values/{id}/approve` transitions status
- Test it rejects approval when `has_errors = true`

---

## Phase 3: Frontend - Sidebar Navigation Update

### Files to Modify

1. **`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`**

### Implementation Details

Add an "Approvals" item to the **Management** section in `navConfig`:

```typescript
{
  title: 'Approvals',
  href: '/admin/approvals',
  icon: ClipboardCheck,  // from lucide-react
  roles: ['admin'],
  description: 'Approve timesheets and absence requests',
}
```

Add the `ClipboardCheck` import from `lucide-react` at the top of the file.

Place it as the **first item** in the Management section (before Employees), since approvals are a high-priority daily action.

### Verification

- The sidebar shows "Approvals" for admin users
- Non-admin users do not see the item
- Clicking navigates to `/admin/approvals`

---

## Phase 4: Frontend - Create Approval Components

### Files to Create

```
apps/web/src/components/approvals/
  index.ts                    -- Barrel exports
  absence-approval-table.tsx  -- Table of pending absences with selection
  timesheet-approval-table.tsx -- Table of daily values needing approval
  approval-bulk-actions.tsx   -- Bulk action bar (approve selected, clear)
  rejection-reason-dialog.tsx -- Modal for entering rejection reason
  approval-status-badge.tsx   -- Badge for approval status display
  approval-filters.tsx        -- Filter bar (team, date range, status)
```

### 4.1 `approval-status-badge.tsx`

A simple badge component mapping statuses to badge variants. Reuse the existing pattern from `pending-requests.tsx`:

```typescript
interface ApprovalStatusBadgeProps {
  status: string
}

const STATUS_CONFIG: Record<string, { variant: BadgeVariant; label: string }> = {
  pending: { variant: 'secondary', label: 'Pending' },
  approved: { variant: 'default', label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  cancelled: { variant: 'outline', label: 'Cancelled' },
  calculated: { variant: 'secondary', label: 'Calculated' },
  error: { variant: 'destructive', label: 'Error' },
}
```

### 4.2 `approval-filters.tsx`

A horizontal filter bar with:
- **Team selector**: `Select` dropdown using `useTeams()` hook to list teams. When a team is selected, filter absences/daily values by team member employee IDs.
- **Date range picker**: `DateRangePicker` for filtering by date range.
- **Status filter** (absences tab): `Select` with options: All, Pending, Approved, Rejected.
- **Status filter** (timesheets tab): `Select` with options: All, Pending, Calculated, Error, Approved.
- **Clear filters** button (shown when any filter is active).

Props:
```typescript
interface ApprovalFiltersProps {
  mode: 'absences' | 'timesheets'
  teamFilter?: string
  onTeamChange: (teamId: string | undefined) => void
  dateRange?: DateRange
  onDateRangeChange: (range: DateRange | undefined) => void
  statusFilter?: string
  onStatusChange: (status: string | undefined) => void
  onClear: () => void
}
```

### 4.3 `absence-approval-table.tsx`

Data table showing pending absences with:
- **Columns**: Checkbox | Employee Name | Absence Type (with color dot) | Date | Duration | Notes | Status Badge | Actions
- **Selection**: Checkbox per row + select all header (follow `EmployeeDataTable` pattern using `Set<string>`)
- **Actions column**: `DropdownMenu` with "Approve" and "Reject" options
- **Sorting**: Default sort by `absence_date` ascending (oldest first = highest priority)
- **Row click**: No action (selection is via checkbox only)

Props:
```typescript
interface AbsenceApprovalTableProps {
  absences: Absence[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onApprove: (absence: Absence) => void
  onReject: (absence: Absence) => void
}
```

Follow the `EmployeeDataTable` pattern for structure, checkbox logic, and skeleton loading.

### 4.4 `timesheet-approval-table.tsx`

Data table showing daily values needing review/approval:
- **Columns**: Checkbox | Employee Name | Date | Target Time | Net Time | Balance | Status Badge | Errors | Actions
- **Selection**: Same checkbox pattern
- **Actions column**: "Approve" button (only for non-error entries)
- **Error display**: Show error count or error icons
- **Sorting**: Default sort by `value_date` ascending

Props:
```typescript
interface TimesheetApprovalTableProps {
  dailyValues: DailyValue[]  // from generated types
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onApprove: (dailyValue: DailyValue) => void
}
```

Note: Timesheets don't have a "reject" action -- they can only be approved or left for review.

### 4.5 `approval-bulk-actions.tsx`

Bulk action bar that appears when items are selected. Follow the existing `BulkActions` pattern from employees.

```typescript
interface ApprovalBulkActionsProps {
  selectedCount: number
  onBulkApprove: () => void
  onClear: () => void
  isApproving?: boolean  // Show loading state during bulk operation
  mode: 'absences' | 'timesheets'
}
```

Display:
- `"{count} selected"` text
- "Approve All" button with `Check` icon
- "Clear" button with `X` icon
- When `isApproving`, show `Loader2` spinner on the approve button

### 4.6 `rejection-reason-dialog.tsx`

A centered `Dialog` (not Sheet/ConfirmDialog) for entering rejection reason:

```typescript
interface RejectionReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  absenceName: string  // For display: "Vacation for John Smith on Jan 15"
  isLoading: boolean
  onConfirm: (reason: string) => void
}
```

Layout:
- `DialogHeader` with title "Reject Absence Request"
- `DialogDescription` with the absence name info
- `Textarea` for reason (required, min 1 character)
- `DialogFooter` with Cancel and "Reject" (destructive) buttons
- "Reject" button disabled when textarea is empty or during loading

### 4.7 `index.ts`

Barrel export all components:
```typescript
export { AbsenceApprovalTable } from './absence-approval-table'
export { TimesheetApprovalTable } from './timesheet-approval-table'
export { ApprovalBulkActions } from './approval-bulk-actions'
export { RejectionReasonDialog } from './rejection-reason-dialog'
export { ApprovalStatusBadge } from './approval-status-badge'
export { ApprovalFilters } from './approval-filters'
```

### Verification

- Components render without errors in isolation
- Table displays loading skeleton
- Checkbox selection works (select one, select all, indeterminate state)
- Rejection dialog validates non-empty reason

---

## Phase 5: Frontend - Create Approval Hooks

### Files to Create/Modify

1. **`apps/web/src/hooks/api/use-daily-values.ts`** - Add `useApproveDailyValue()` mutation hook

### Implementation Details

#### 5.1 Verify existing hooks

The `useAbsences()` hook already supports `status` filter, `useApproveAbsence()` and `useRejectAbsence()` hooks already exist. These will be used directly.

#### 5.2 Add `useApproveDailyValue` hook

In `use-daily-values.ts`, add:

```typescript
export function useApproveDailyValue() {
  return useApiMutation('/daily-values/{id}/approve', 'post', {
    invalidateKeys: [
      ['/daily-values'],
    ],
  })
}
```

Also check if `useDailyValues` uses `useApiQuery` or the custom `apiRequest` approach. Currently it uses a custom `useQuery` approach with manual fetch. For the approval dashboard, we may need a hook that calls `GET /daily-values` (the global endpoint) with filters rather than the employee-scoped endpoint. Check if this path exists in the generated types.

If `GET /daily-values` exists in generated types:
```typescript
export function useAllDailyValues(options: {
  from?: string
  to?: string
  status?: string
  hasErrors?: boolean
  enabled?: boolean
}) {
  return useApiQuery('/daily-values', {
    params: {
      from: options.from,
      to: options.to,
      status: options.status as any,
      has_errors: options.hasErrors,
    },
    enabled: options.enabled ?? true,
  })
}
```

If `GET /daily-values` is NOT registered as a backend route, we need to add it in Phase 2.

#### 5.3 Update hooks barrel export

In `apps/web/src/hooks/api/index.ts`, add exports for new hooks:

```typescript
export { useApproveDailyValue, useAllDailyValues } from './use-daily-values'
```

### Verification

- Hooks compile without TypeScript errors
- `useAbsences({ status: 'pending' })` returns pending absences
- `useApproveAbsence()` mutation can be called with path `{ id: absenceId }`
- `useRejectAbsence()` mutation can be called with path and body

---

## Phase 6: Frontend - Create Approvals Page

### Files to Create

1. **`apps/web/src/app/(dashboard)/admin/approvals/page.tsx`**

### Implementation Details

The page follows the admin page pattern (teams page) with tab-based navigation.

#### Page Structure

```tsx
'use client'

export default function ApprovalsPage() {
  // Auth check
  const isAdmin = useHasRole(['admin'])
  // Redirect if not admin (same pattern as teams page)

  // Tab state
  const [activeTab, setActiveTab] = useState<'absences' | 'timesheets'>('absences')

  // Shared filter state
  const [teamFilter, setTeamFilter] = useState<string | undefined>()
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()

  // Absence-specific state
  const [absenceSelectedIds, setAbsenceSelectedIds] = useState<Set<string>>(new Set())
  const [rejectingAbsence, setRejectingAbsence] = useState<Absence | null>(null)

  // Timesheet-specific state
  const [timesheetSelectedIds, setTimesheetSelectedIds] = useState<Set<string>>(new Set())

  // Data fetching
  const { data: absencesData, isLoading: absencesLoading } = useAbsences({
    status: (statusFilter as any) ?? 'pending',
    from: dateRange?.from ? formatDate(dateRange.from) : undefined,
    to: dateRange?.to ? formatDate(dateRange.to) : undefined,
    enabled: isAdmin && activeTab === 'absences',
  })

  // Mutations
  const approveMutation = useApproveAbsence()
  const rejectMutation = useRejectAbsence()

  // Handlers
  const handleApproveAbsence = async (absence: Absence) => { ... }
  const handleRejectAbsence = (absence: Absence) => { setRejectingAbsence(absence) }
  const handleConfirmReject = async (reason: string) => { ... }
  const handleBulkApproveAbsences = async () => {
    // Sequential approval of all selected IDs
    for (const id of absenceSelectedIds) {
      await approveMutation.mutateAsync({ path: { id } })
    }
    setAbsenceSelectedIds(new Set())
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1>Approvals</h1>
        <p>Review and approve timesheets and absence requests</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="absences">
              Absences {pendingAbsenceCount > 0 && `(${pendingAbsenceCount})`}
            </TabsTrigger>
            <TabsTrigger value="timesheets">
              Timesheets {pendingTimesheetCount > 0 && `(${pendingTimesheetCount})`}
            </TabsTrigger>
          </TabsList>

          {/* Bulk actions */}
          {selectedCount > 0 && (
            <ApprovalBulkActions ... />
          )}
        </div>

        {/* Filters */}
        <ApprovalFilters
          mode={activeTab}
          teamFilter={teamFilter}
          onTeamChange={setTeamFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onClear={clearFilters}
        />

        {/* Absences tab content */}
        <TabsContent value="absences">
          <Card>
            <CardContent className="p-0">
              {absencesLoading ? (
                <Skeleton />
              ) : filteredAbsences.length === 0 ? (
                <EmptyState />
              ) : (
                <AbsenceApprovalTable ... />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timesheets tab content */}
        <TabsContent value="timesheets">
          <Card>
            <CardContent className="p-0">
              <TimesheetApprovalTable ... />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rejection reason dialog */}
      <RejectionReasonDialog
        open={!!rejectingAbsence}
        onOpenChange={(open) => !open && setRejectingAbsence(null)}
        absenceName={...}
        isLoading={rejectMutation.isPending}
        onConfirm={handleConfirmReject}
      />
    </div>
  )
}
```

#### Team Filtering Logic

When a team is selected, fetch team members via `useTeamMembers(teamId)` and filter the absences/daily values client-side by checking if the item's `employee_id` is in the team members list. This avoids needing a backend team filter parameter.

#### Empty State

Show different empty states:
- **All caught up**: When `status=pending` and no results. "No pending items to review" with a green checkmark icon.
- **No results**: When filters are active but no matches. "No results found. Try adjusting your filters."

#### Skeleton Loading

Follow the `TeamsPageSkeleton` pattern - skeleton for header, filters, and table area.

#### Tab Counts

Show pending count in tab labels. Fetch absences with `status=pending` count and daily values with `status=pending` or `status=calculated` count. These can be derived from the fetched data length.

### Verification

- Page loads at `/admin/approvals`
- Non-admin users are redirected to `/dashboard`
- Tabs switch between absences and timesheets
- Pending absences are displayed in the table
- Filters work (team, date range, status)
- Individual approve/reject actions work
- Rejection dialog opens, requires reason, submits correctly
- Bulk approve processes all selected items
- Loading states and skeletons display correctly
- Empty states show appropriate messages
- Error states are handled (network errors, 400 responses)
- Clear selection when switching tabs

---

## Phase 7: Frontend - History View

### Implementation Details

The status filter on the absences tab already supports showing approved/rejected items. When the user changes the status filter to "Approved" or "Rejected" or "All", they see historical records. This is the "history view" -- no separate page needed.

For the history rows:
- **Approved items**: Show approved_by and approved_at in an additional info row or tooltip
- **Rejected items**: Show rejection_reason in an expandable row or tooltip
- **Action column**: No approve/reject buttons for already-processed items
- **Checkbox**: Hidden for non-pending items (cannot re-approve)

### Verification

- Changing status filter to "All" shows all absences
- Approved/rejected items display their metadata
- No action buttons on historical items

---

## Component Hierarchy

```
ApprovalsPage
  +-- PageHeader (title + description)
  +-- Tabs
  |   +-- TabsList
  |   |   +-- TabsTrigger("absences")
  |   |   +-- TabsTrigger("timesheets")
  |   +-- ApprovalBulkActions (shown when items selected)
  |   +-- ApprovalFilters
  |   |   +-- Select (team)
  |   |   +-- DateRangePicker
  |   |   +-- Select (status)
  |   |   +-- Button (clear)
  |   +-- TabsContent("absences")
  |   |   +-- Card
  |   |       +-- AbsenceApprovalTable
  |   |           +-- Checkbox (select all)
  |   |           +-- TableRow * N
  |   |               +-- Checkbox
  |   |               +-- Employee name
  |   |               +-- Absence type (with color dot)
  |   |               +-- Date
  |   |               +-- Duration
  |   |               +-- ApprovalStatusBadge
  |   |               +-- DropdownMenu (Approve | Reject)
  |   +-- TabsContent("timesheets")
  |       +-- Card
  |           +-- TimesheetApprovalTable
  |               +-- (similar structure)
  +-- RejectionReasonDialog
  |   +-- Dialog
  |       +-- Textarea (reason)
  |       +-- Button (Cancel) + Button (Reject)
  +-- ConfirmDialog (for individual approve confirmation)
```

---

## State Management Summary

All state is local to the `ApprovalsPage` component using `useState`:

| State | Type | Purpose |
|-------|------|---------|
| `activeTab` | `'absences' \| 'timesheets'` | Active tab |
| `teamFilter` | `string \| undefined` | Selected team ID |
| `dateRange` | `DateRange \| undefined` | Date range filter |
| `statusFilter` | `string \| undefined` | Status filter |
| `absenceSelectedIds` | `Set<string>` | Selected absence IDs |
| `timesheetSelectedIds` | `Set<string>` | Selected daily value IDs |
| `rejectingAbsence` | `Absence \| null` | Absence being rejected (opens dialog) |
| `isBulkApproving` | `boolean` | Whether bulk operation is in progress |

Data is fetched via TanStack Query hooks. Query invalidation after mutations ensures the table refreshes automatically.

---

## Implementation Order Summary

| Phase | Description | Dependencies | Estimated Complexity |
|-------|-------------|--------------|---------------------|
| 1 | Backend: Absence approval endpoints | None | Medium |
| 2 | Backend: Daily value approval (check first) | None | Low |
| 3 | Frontend: Sidebar nav update | None | Trivial |
| 4 | Frontend: Approval components | Phase 1 (for types) | Medium |
| 5 | Frontend: Approval hooks | Phase 1 backend | Low |
| 6 | Frontend: Approvals page | Phases 3, 4, 5 | High |
| 7 | Frontend: History view | Phase 6 | Low |

Phases 1-2 can run in parallel with Phase 3.
Phases 4-5 can run in parallel.
Phase 6 requires all previous phases.
Phase 7 is incremental on Phase 6.

---

## Files Summary

### New Files (Backend)
- No new files; modifications to existing handler, service, repository, and routes files

### New Files (Frontend)
- `apps/web/src/app/(dashboard)/admin/approvals/page.tsx`
- `apps/web/src/components/approvals/index.ts`
- `apps/web/src/components/approvals/absence-approval-table.tsx`
- `apps/web/src/components/approvals/timesheet-approval-table.tsx`
- `apps/web/src/components/approvals/approval-bulk-actions.tsx`
- `apps/web/src/components/approvals/rejection-reason-dialog.tsx`
- `apps/web/src/components/approvals/approval-status-badge.tsx`
- `apps/web/src/components/approvals/approval-filters.tsx`

### Modified Files (Backend)
- `apps/api/internal/handler/absence.go` - Add `ListAll`, `Approve`, `Reject`
- `apps/api/internal/handler/routes.go` - Register new routes
- `apps/api/internal/service/absence.go` - Add `ListAll`, `Approve`, `Reject`
- `apps/api/internal/repository/absenceday.go` - Add `Update`, `ListAll`

### Modified Files (Frontend)
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add Approvals nav item
- `apps/web/src/hooks/api/use-daily-values.ts` - Add `useApproveDailyValue`, `useAllDailyValues`
- `apps/web/src/hooks/api/index.ts` - Export new hooks

---

## Risk Items

1. **Backend `/absences` endpoint not implemented**: The `GET /absences` and `POST /absences/{id}/approve|reject` endpoints are defined in OpenAPI but not implemented. Phase 1 addresses this.

2. **`GET /daily-values` endpoint**: Verify this is registered as a backend route. If not, it needs to be added for the timesheets tab to fetch daily values across all employees.

3. **Bulk approve performance**: With no bulk endpoint, approving 50 items means 50 sequential API calls. Implement with `Promise.allSettled` or sequential loop with progress feedback. Consider adding a bulk endpoint later if needed.

4. **Team-based filtering**: Currently done client-side after fetching all data. If the dataset is large, consider adding backend team/department filter parameters to the `GET /absences` and `GET /daily-values` endpoints.

5. **No toast library**: Success/error feedback after approve/reject actions has no toast system. Consider adding `sonner` or using inline status messages within the table row.
