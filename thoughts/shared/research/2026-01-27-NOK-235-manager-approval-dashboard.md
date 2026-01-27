# Research: NOK-235 Manager Approval Dashboard

**Date:** 2026-01-27
**Ticket:** NOK-235 - Create manager approval dashboard for timesheets and absences
**Status:** Research complete

---

## 1. Frontend Page Structure (apps/web/)

### Existing Route Layout
The frontend uses Next.js App Router with a `(dashboard)` route group:

```
apps/web/src/app/(dashboard)/
  layout.tsx              -- Dashboard layout with sidebar + header
  dashboard/page.tsx      -- Employee dashboard
  time-clock/page.tsx     -- Clock in/out
  timesheet/page.tsx      -- Timesheet view (day/week/month)
  absences/page.tsx       -- Absence requests
  vacation/page.tsx       -- Vacation balance
  monthly-evaluation/page.tsx -- Monthly evaluation view
  year-overview/page.tsx  -- Year overview
  profile/page.tsx        -- Employee profile
  admin/
    employees/page.tsx    -- Employee management
    teams/page.tsx        -- Team management
    departments/page.tsx  -- Department management
    day-plans/page.tsx    -- Day plan management
    week-plans/page.tsx   -- Week plan management
    tariffs/page.tsx      -- Tariff management
    holidays/page.tsx     -- Holiday management
    absence-types/page.tsx -- Absence type config
```

There is **no existing approvals page** or manager-specific route.

### Dashboard Layout
File: `/apps/web/src/app/(dashboard)/layout.tsx`
- Wraps content in `ProtectedRoute` + `AppShell` (sidebar + header)
- All authenticated pages share this layout

### Sidebar Navigation Config
File: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

The sidebar has three sections:
1. **Main** -- Visible to all users (Dashboard, Time Clock, Timesheet, Absences, Vacation, Monthly Evaluation, Year Overview)
2. **Management** -- `roles: ['admin']` (Employees, Teams, Departments, Employment Types, Day Plans, Week Plans, Tariffs, Holidays, Absence Types)
3. **Administration** -- `roles: ['admin']` (Users, Reports, Settings, Tenants)

Navigation items have:
- `title`, `href`, `icon` (LucideIcon), `roles?: UserRole[]`, `badge?: number`, `description?`

There is **no "manager" role** in the current navigation. Only `'user'` and `'admin'` roles exist.

---

## 2. Authentication and Role-Based Access

### Auth Provider
File: `/apps/web/src/providers/auth-provider.tsx`
- Uses `AuthContext` with `user`, `isLoading`, `isAuthenticated`, `logout`, `refetch`
- `user` is fetched via `useCurrentUser` hook (GET `/auth/me`)

### Protected Route
File: `/apps/web/src/components/auth/protected-route.tsx`
- Redirects unauthenticated users to `/login`
- Only checks authentication, **not roles** -- role checking is done by individual pages

### Role Checking Hooks
File: `/apps/web/src/hooks/use-has-role.ts`

```typescript
type UserRole = components['schemas']['User']['role']  // 'user' | 'admin'

const ROLE_HIERARCHY: UserRole[] = ['user', 'admin']

useHasRole(roles: UserRole[]): boolean  -- Check if user has any of the specified roles
useHasMinRole(minRole: UserRole): boolean  -- Check if role >= minRole in hierarchy
useUserRole(): UserRole | null  -- Get current role
```

**Only two roles exist**: `'user'` and `'admin'`. There is no `'manager'` role.

### Page-Level Role Enforcement Pattern
Admin pages (e.g., `admin/teams/page.tsx`) use this pattern:
```typescript
const isAdmin = useHasRole(['admin'])
React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])
```

---

## 3. Existing API Hooks for Absences

### Absence Hooks
File: `/apps/web/src/hooks/api/use-absences.ts`

**Query hooks:**
- `useAbsenceTypes(enabled?)` -- GET `/absence-types`
- `useAbsenceType(id, enabled?)` -- GET `/absence-types/{id}`
- `useAbsences(options?)` -- GET `/absences` with `employeeId`, `from`, `to`, `status` filters
- `useEmployeeAbsences(employeeId, options?)` -- GET `/employees/{id}/absences` with `from`, `to`
- `useAbsence(id, enabled?)` -- GET `/absences/{id}`

**Mutation hooks:**
- `useCreateAbsenceRange()` -- POST `/employees/{id}/absences`
- `useDeleteAbsence()` -- DELETE `/absences/{id}`
- `useApproveAbsence()` -- POST `/absences/{id}/approve` (invalidates `/absences`, `/employees/{id}/absences`)
- `useRejectAbsence()` -- POST `/absences/{id}/reject` (invalidates `/absences`, `/employees/{id}/absences`)
- `useCreateAbsenceType()` -- POST `/absence-types`
- `useUpdateAbsenceType()` -- PATCH `/absence-types/{id}`
- `useDeleteAbsenceType()` -- DELETE `/absence-types/{id}`

The `useApproveAbsence()` and `useRejectAbsence()` hooks **already exist** and are ready to use.

### Daily Values Hooks
File: `/apps/web/src/hooks/api/use-daily-values.ts`
- `useDailyValues(options)` -- GET `/daily-values` with `employeeId`, `from`, `to`, `status`, `hasErrors`

### Monthly Values Hooks
File: `/apps/web/src/hooks/api/use-monthly-values.ts`
- `useMonthlyValues(options)` -- GET `/monthly-values` with `employeeId`, `year`, `month`, `status`
- `useYearOverview(options)` -- GET `/monthly-values` with year filter
- `useCloseMonth()` -- POST `/monthly-values/{id}/close`
- `useReopenMonth()` -- POST `/monthly-values/{id}/reopen`
- `useRecalculateMonth()` -- POST `/monthly-values/recalculate`

### Team Hooks
File: `/apps/web/src/hooks/api/use-teams.ts`
- `useTeams(options)` -- GET `/teams` with `departmentId`, `isActive`, `limit`, `cursor`
- `useTeam(id, enabled?)` -- GET `/teams/{id}` with `include_members`
- `useTeamMembers(teamId, enabled?)` -- GET `/teams/{id}/members`

### Employee Hooks
File: `/apps/web/src/hooks/api/use-employees.ts`
- `useEmployees(options)` -- GET `/employees` with `search`, `departmentId`, `active`, `limit`, `page`
- `useEmployee(id, enabled?)` -- GET `/employees/{id}`

### Booking Hooks
File: `/apps/web/src/hooks/api/use-bookings.ts`
- `useBookings(options)` -- GET `/bookings` with `employeeId`, `from`, `to`, `bookingTypeId`
- `useCreateBooking()` -- POST `/bookings`
- `useUpdateBooking()` -- PUT `/bookings/{id}`
- `useDeleteBooking()` -- DELETE `/bookings/{id}`

---

## 4. Existing API Endpoints (OpenAPI Spec)

### Absence Approval Endpoints
File: `/api/paths/absences.yaml`

**GET /absences** -- List all absences with filters:
- `employee_id` (uuid), `absence_type_id` (uuid), `from` (date), `to` (date), `status` (pending|approved|rejected|cancelled)
- Response: `AbsenceList` containing array of `Absence` objects

**POST /absences/{id}/approve** -- Approve absence:
- Path param: `id` (uuid)
- Response 200: Approved `Absence`
- Response 400: Cannot approve (not pending)

**POST /absences/{id}/reject** -- Reject absence:
- Path param: `id` (uuid)
- Body: `{ reason: string }` (rejection reason)
- Response 200: Rejected `Absence`
- Response 400: Cannot reject (not pending)

### Absence Schema
File: `/api/schemas/absences.yaml`
```yaml
Absence:
  properties:
    id, tenant_id, employee_id, absence_type_id, absence_date (date)
    duration (decimal, 1.0 or 0.5)
    status: pending | approved | rejected | cancelled
    notes (nullable)
    approved_by (uuid, nullable)
    approved_at (datetime, nullable)
    created_at, updated_at, created_by (uuid, nullable)
    employee: EmployeeSummary (nullable, expanded relation)
    absence_type: AbsenceTypeSummary (nullable, expanded relation)
```

### Daily Value Approval Endpoint
File: `/api/paths/daily-values.yaml`

**POST /daily-values/{id}/approve** -- Approve daily value (marks as approved):
- Response 200: Approved `DailyValue`
- Response 400: Cannot approve (has errors)

**Daily Value statuses**: pending, calculated, error, approved

### Correction Approval Endpoints
File: `/api/paths/corrections.yaml`

**POST /corrections/{id}/approve** -- Approve correction
**POST /corrections/{id}/reject** -- Reject correction
**Correction statuses**: pending, approved, rejected

### Monthly Value Batch Close
**POST /monthly-values/close-batch** -- Batch close month for multiple employees
- Body: `{ year, month, employee_ids?, department_id?, recalculate? }`

### Team Members
File: `/api/schemas/teams.yaml`

**TeamMemberRole**: `member | lead | deputy`
**Team** has `leader_employee_id`, `members[]` with roles

**Note**: There is **no bulk approve endpoint** for absences or daily values. Each must be approved individually.

**Note**: There is **no notification API endpoint**. The notification component at `/apps/web/src/components/layout/notifications.tsx` is a placeholder with hardcoded data.

---

## 5. Existing UI Components (Reusable)

### Table Components
File: `/apps/web/src/components/ui/table.tsx`
- `Table`, `TableBody`, `TableCaption`, `TableCell`, `TableFooter`, `TableHead`, `TableHeader`, `TableRow`
- Standard shadcn/ui table components

### Data Table with Checkbox Selection
File: `/apps/web/src/components/employees/employee-data-table.tsx`
- Implements checkbox selection pattern (select all, select individual)
- Uses `Set<string>` for selected IDs
- Props pattern: `selectedIds: Set<string>`, `onSelectIds: (ids: Set<string>) => void`
- Select all / indeterminate state logic
- Row actions via `DropdownMenu`

### Bulk Actions Bar
File: `/apps/web/src/components/employees/bulk-actions.tsx`
- Shows when items are selected: `"{count} selected"` with action buttons
- Pattern: `selectedCount`, `selectedIds: Set<string>`, `onClear` callback
- Uses `Button` with icons (Activate, Deactivate, Export, Clear)

### Tabs
File: `/apps/web/src/components/ui/tabs.tsx`
- Radix UI based: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- Used in timesheet page for day/week/month views

### Checkbox
File: `/apps/web/src/components/ui/checkbox.tsx`
- Supports `checked: boolean | 'indeterminate'`
- Used in data tables for selection

### Confirmation Dialog
File: `/apps/web/src/components/ui/confirm-dialog.tsx`
- Uses `Sheet` (bottom sheet pattern), NOT `Dialog`
- Props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` ('default' | 'destructive'), `isLoading`, `onConfirm`
- Supports loading state with `Loader2` spinner

### Dialog (Modal)
File: `/apps/web/src/components/ui/dialog.tsx`
- Radix UI based: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`
- Standard centered modal overlay pattern

### Badge
File: `/apps/web/src/components/ui/badge.tsx`
- Variants: `default`, `secondary`, `destructive`, `outline`
- Used for status display in absence cards

### Select
File: `/apps/web/src/components/ui/select.tsx`
- Radix UI based: `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`
- Used for filter dropdowns in admin pages

### Search Input
File: `/apps/web/src/components/ui/search-input.tsx`
- Debounced search with clear button
- Props: `value`, `onChange`, `placeholder`, `debounceMs`, `disabled`

### Date Range Picker
File: `/apps/web/src/components/ui/date-range-picker.tsx`
- Popover-based date range selector
- Uses calendar component, supports holidays/absences highlighting

### Textarea
File: `/apps/web/src/components/ui/textarea.tsx`
- Standard textarea for text input (useful for rejection reason)

### Pagination
File: `/apps/web/src/components/ui/pagination.tsx`
- Standard pagination component

### Additional Components Available
`Button`, `Card`/`CardContent`, `Skeleton`, `Alert`, `Input`, `Label`, `Avatar`, `Separator`, `ScrollArea`, `Tooltip`, `Popover`, `RadioGroup`, `Switch`, `TimeInput`, `DurationInput`, `Breadcrumb`, `Grid`, `Stack`, `Container`

---

## 6. Existing Approval/Status Patterns

### Absence Status Pattern
File: `/apps/web/src/components/absences/pending-requests.tsx`

The `PendingRequests` component groups absences by status (pending, approved, rejected) and displays them as cards with:
- Color dot from absence type
- Type name, date, duration
- Status badge using STATUS_COLORS mapping:
  ```typescript
  const STATUS_COLORS = {
    pending: { variant: 'secondary', label: 'Pending' },
    approved: { variant: 'default', label: 'Approved' },
    rejected: { variant: 'destructive', label: 'Rejected' },
  }
  ```
- Delete action button (for pending items only)
- Confirmation via bottom Sheet

### Pending Actions Dashboard Widget
File: `/apps/web/src/components/dashboard/pending-actions.tsx`
- Shows daily values with errors or pending status from the last 14 days
- Links to timesheet for resolution
- Empty state: "All caught up!" with green checkmark

### Notification Component (Placeholder)
File: `/apps/web/src/components/layout/notifications.tsx`
- Placeholder with hardcoded notifications including "Time approval required" and "Absence request"
- Uses `DropdownMenu` with `ScrollArea`
- **No real API integration** -- interface uses `{ id, title, message, timestamp, read }`

### Toast Pattern
The `ClockSuccessToast` component exists at `/apps/web/src/components/time-clock/clock-success-toast.tsx` for clock-in/out success feedback. The `useApiMutation` hook comment references `toast.success()` but no toast library (like sonner) is currently installed/integrated.

---

## 7. Backend Absence Model and Approval Logic

### AbsenceDay Model
File: `/apps/api/internal/model/absenceday.go`

```go
type AbsenceStatus string
const (
  AbsenceStatusPending   AbsenceStatus = "pending"
  AbsenceStatusApproved  AbsenceStatus = "approved"
  AbsenceStatusRejected  AbsenceStatus = "rejected"
  AbsenceStatusCancelled AbsenceStatus = "cancelled"
)

type AbsenceDay struct {
  ID              uuid.UUID
  TenantID        uuid.UUID
  EmployeeID      uuid.UUID
  AbsenceDate     time.Time
  AbsenceTypeID   uuid.UUID
  Duration        decimal.Decimal  // 1.00 or 0.50
  HalfDayPeriod   *HalfDayPeriod   // morning | afternoon
  Status          AbsenceStatus
  ApprovedBy      *uuid.UUID
  ApprovedAt      *time.Time
  RejectionReason *string
  Notes           *string
  CreatedBy       *uuid.UUID
  Employee        *Employee    // relation
  AbsenceType     *AbsenceType // relation
}
```

### Absence Handler
File: `/apps/api/internal/handler/absence.go`
- The handler currently does **NOT** implement approve/reject endpoints
- It implements: `ListTypes`, `ListByEmployee`, `CreateRange`, `Delete`, `GetType`, `CreateType`, `UpdateType`, `DeleteType`
- The approve/reject endpoints are defined in the OpenAPI spec but **not yet implemented** in the Go handler

### Absence Service
File: `/apps/api/internal/service/absence.go`
- The service does **NOT** have `Approve` or `Reject` methods
- The `CreateRange` method allows setting initial status (e.g., `model.AbsenceStatusApproved` for admin-created absences)
- The admin handler always creates absences with `Status: model.AbsenceStatusApproved`

### AbsenceType Model
File: `/apps/api/internal/model/absencetype.go`
- Has `RequiresApproval` boolean field
- This flag is exposed in the API response and used in the frontend

---

## 8. API Client Pattern

### Type-Safe API Client
File: `/apps/web/src/lib/api/client.ts`
- Uses `openapi-fetch` with generated types from `openapi-ts`
- Adds `Authorization` (Bearer token) and `X-Tenant-ID` headers via middleware
- Type: `paths` from `/apps/web/src/lib/api/types.ts`

### useApiQuery Pattern
File: `/apps/web/src/hooks/use-api-query.ts`
```typescript
useApiQuery<Path>(path, { params, path: pathParams, ...queryOptions })
// Uses TanStack Query with queryKey: [path, params, pathParams]
```

### useApiMutation Pattern
File: `/apps/web/src/hooks/use-api-mutation.ts`
```typescript
useApiMutation<Path>(path, method, { invalidateKeys, onSuccess })
// Supports: post, put, patch, delete
// Variables: { body?, path? }
// Auto-invalidates specified query keys on success
```

---

## 9. Admin Page Pattern (Reference: Teams Page)

File: `/apps/web/src/app/(dashboard)/admin/teams/page.tsx`

Standard admin page structure:
1. **Auth check**: `useHasRole(['admin'])` + redirect if not admin
2. **State**: filters (search, department, active), selection (Set<string>), dialog state (create/edit/view/delete)
3. **Data fetching**: `useTeams(options)` with filters
4. **Client-side filtering**: Additional search filter on fetched data
5. **Layout**:
   - Page header (title + description + action button)
   - Filters bar (SearchInput + Select dropdowns + Clear button)
   - Card with DataTable or EmptyState
   - Sheets/Dialogs for CRUD operations
   - ConfirmDialog for delete

---

## 10. Key Findings and Gaps

### What Exists
1. **Absence approve/reject API endpoints** are defined in OpenAPI spec
2. **useApproveAbsence()** and **useRejectAbsence()** frontend hooks already exist
3. **GET /absences?status=pending** can filter all pending absences
4. **Checkbox selection pattern** exists in EmployeeDataTable
5. **BulkActions bar** exists in employees section
6. **ConfirmDialog** exists for confirmation flows
7. **Tabs** component exists for switching between views
8. **Dialog** component exists for modal flows (rejection reason)
9. **DateRangePicker** exists for date range filtering
10. **Select** dropdown exists for team filtering
11. **Badge** component exists for status display
12. **Notification component** exists but is a placeholder (no real API)

### What Does NOT Exist
1. **No manager role** -- only `'user'` and `'admin'` roles; a "manager" concept would need to use admin or add a new role
2. **No bulk approve endpoint** for absences -- each must be approved individually (would need sequential calls)
3. **No approval handler in Go** -- approve/reject are in the OpenAPI spec but not implemented in the handler
4. **No approval service methods** in the Go absence service
5. **No notification API** -- the notification component is a placeholder
6. **No toast library** installed (sonner, react-hot-toast, etc.) -- would need to be added or use custom solution
7. **No timesheet approval concept** -- daily values have an "approved" status in the schema but no frontend implementation for managers to approve timesheets
8. **No dedicated approvals page** or manager dashboard route
9. **No employee-to-manager relationship** in the data model (teams have `leader_employee_id` but this is not used for approval routing)
