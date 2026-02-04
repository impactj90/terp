# Research: ZMI-TICKET-049 - Vacation Balance Admin UI

**Date:** 2026-02-03
**Ticket:** thoughts/shared/tickets/ZMI-TICKET-049-vacation-balance-admin-ui.md
**Status:** Research complete

---

## 1. Backend API Endpoints

All vacation balance endpoints are fully implemented and registered.

### Route Registration

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 1603-1619)

```go
func RegisterVacationBalanceRoutes(r chi.Router, h *VacationBalanceHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("absences.manage").String()
    // Without authz:
    r.Get("/vacation-balances", h.List)
    r.Post("/vacation-balances", h.Create)
    r.Post("/vacation-balances/initialize", h.Initialize)
    r.Get("/vacation-balances/{id}", h.Get)
    r.Patch("/vacation-balances/{id}", h.Update)
    // With authz:
    r.With(authz.RequirePermission(permManage)).Get("/vacation-balances", h.List)
    r.With(authz.RequirePermission(permManage)).Post("/vacation-balances", h.Create)
    r.With(authz.RequirePermission(permManage)).Post("/vacation-balances/initialize", h.Initialize)
    r.With(authz.RequirePermission(permManage)).Get("/vacation-balances/{id}", h.Get)
    r.With(authz.RequirePermission(permManage)).Patch("/vacation-balances/{id}", h.Update)
}
```

Routes are registered in `apps/api/cmd/server/main.go` (line 524):
```go
handler.RegisterVacationBalanceRoutes(r, vacationBalanceHandler, authzMiddleware)
```

Permission required: `absences.manage`

### Handler

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/vacation_balance.go`

The handler struct depends on three services:
```go
type VacationBalanceHandler struct {
    balanceService  *service.VacationBalanceService
    vacationService *service.VacationService
    employeeService *service.EmployeeService
}
```

#### GET /vacation-balances (List)
- Query params: `employee_id` (uuid), `year` (int), `department_id` (uuid) -- all optional
- Returns: `models.VacationBalanceList` with `{ data: []*VacationBalance }`
- Filters via `repository.VacationBalanceFilter`

#### GET /vacation-balances/{id} (Get)
- Path param: `id` (uuid)
- Returns: `models.VacationBalance`
- 404 if not found

#### POST /vacation-balances (Create)
- Body: `models.CreateVacationBalanceRequest` -- fields: `employee_id` (required), `year` (required), `base_entitlement` (required), `additional_entitlement`, `carryover_from_previous`, `manual_adjustment`, `carryover_expires_at`
- Combines `base_entitlement + additional_entitlement` into `Entitlement` in the service input
- Returns 201 with created balance
- Returns 409 "Vacation balance already exists for this employee and year" on duplicate

#### PATCH /vacation-balances/{id} (Update)
- Path param: `id` (uuid)
- Body: `models.UpdateVacationBalanceRequest` -- fields: `base_entitlement`, `additional_entitlement`, `carryover_from_previous`, `manual_adjustment`, `carryover_to_next`, `carryover_expires_at`
- Returns 200 with updated balance
- Returns 404 if not found
- Note: Zero values are not sent due to omitempty behavior; the handler checks `req.BaseEntitlement != 0 || req.AdditionalEntitlement != 0` before updating

#### POST /vacation-balances/initialize (Initialize)
- Body: `{ year: int, carryover: bool }` (year required, carryover defaults to true)
- Gets all active employees via `employeeService.List`
- For each employee: if carryover enabled, calls `vacationService.CarryoverFromPreviousYear`, then calls `vacationService.InitializeYear`
- Returns 201 with `{ message: "Vacation balances initialized", created_count: N }`

#### Response mapping (balanceToResponse)
Maps internal model fields to API response:
- `Entitlement` -> `BaseEntitlement` (note: additional_entitlement is not separately stored in backend model)
- `Carryover` -> `CarryoverFromPrevious`
- `Adjustments` -> `ManualAdjustment`
- `Taken` -> `UsedDays`
- `Total()` -> `TotalEntitlement` (calculated: Entitlement + Carryover + Adjustments)
- `Available()` -> `RemainingDays` (calculated: Total - Taken)
- `PlannedDays` is not set in the response (always 0)
- `AdditionalEntitlement` is not set in the response (always 0)

### Service

**File:** `/home/tolga/projects/terp/apps/api/internal/service/vacationbalance.go`

```go
type VacationBalanceService struct {
    repo vacationBalanceRepoForBalanceService
}
```

Methods:
- `List(ctx, filter) -> ([]model.VacationBalance, error)`
- `GetByID(ctx, id) -> (*model.VacationBalance, error)` -- returns `ErrVacationBalanceNotFound`
- `Create(ctx, input) -> (*model.VacationBalance, error)` -- checks for existing balance, returns `ErrVacationBalanceAlreadyExists`
- `Update(ctx, id, input) -> (*model.VacationBalance, error)` -- partial updates

Error variables:
- `ErrVacationBalanceAlreadyExists` (in vacationbalance.go)
- `ErrVacationBalanceNotFound` (in vacation.go, line 17)

### VacationService (Initialize/Carryover)

**File:** `/home/tolga/projects/terp/apps/api/internal/service/vacation.go`

- `InitializeYear(ctx, employeeID, year)` -- calculates entitlement from employee data (VacationDaysPerYear, WeeklyHours, EntryDate, ExitDate, calculation groups). Uses Upsert (idempotent).
- `CarryoverFromPreviousYear(ctx, employeeID, year)` -- reads previous year's `Available()`, applies cap via `calculation.CalculateCarryover`, sets `Carryover` on current year balance.

### Repository

**File:** `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go`

```go
type VacationBalanceFilter struct {
    TenantID     uuid.UUID
    EmployeeID   *uuid.UUID
    Year         *int
    DepartmentID *uuid.UUID
}
```

Key methods:
- `ListAll` -- JOINs employees table when filtering by department_id
- `GetByEmployeeYear` -- unique lookup
- `Upsert` -- ON CONFLICT (employee_id, year) DO UPDATE
- `UpdateTaken` / `IncrementTaken` -- for absence processing
- `ListByEmployee` -- ordered by year ASC

### Domain Model

**File:** `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID                 uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID           uuid.UUID       `gorm:"type:uuid;not null;index"`
    EmployeeID         uuid.UUID       `gorm:"type:uuid;not null;index"`
    Year               int             `gorm:"type:int;not null"`
    Entitlement        decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0"`
    Carryover          decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0"`
    Adjustments        decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0"`
    Taken              decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0"`
    CarryoverExpiresAt *time.Time      `gorm:"type:date"`
    CreatedAt          time.Time
    UpdatedAt          time.Time
    Employee           *Employee       `gorm:"foreignKey:EmployeeID"`
}

func (vb *VacationBalance) Total() decimal.Decimal {
    return vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments)
}

func (vb *VacationBalance) Available() decimal.Decimal {
    return vb.Total().Sub(vb.Taken)
}
```

Note: The backend model uses `Entitlement` (single field combining base + additional), `Carryover`, `Adjustments`, and `Taken`. There is no separate `additional_entitlement`, `planned_days`, or `carryover_to_next` stored in the DB model. These are only in the API schema.

---

## 2. OpenAPI Spec

### Paths

**File:** `/home/tolga/projects/terp/api/paths/vacation-balances.yaml`

Defines all 5 endpoints:
- `GET /vacation-balances` (listVacationBalances) -- query params: employee_id, year, department_id
- `POST /vacation-balances` (createVacationBalance) -- 201 response, 409 for duplicate
- `GET /vacation-balances/{id}` (getVacationBalance) -- 200, 404
- `PATCH /vacation-balances/{id}` (updateVacationBalance) -- 200, 400, 404
- `POST /vacation-balances/initialize` (initializeVacationBalances) -- 201 with { message, created_count }

### Schemas

**File:** `/home/tolga/projects/terp/api/schemas/vacation-balances.yaml`

Schemas defined:
- `VacationBalance` -- full response with id, tenant_id, employee_id, year, base_entitlement, additional_entitlement, carryover_from_previous, manual_adjustment, used_days, planned_days, total_entitlement, remaining_days, carryover_to_next (nullable), carryover_expires_at (nullable), created_at, updated_at, employee (nullable EmployeeSummary)
- `VacationBalanceSummary` -- year, total_entitlement, used_days, planned_days, remaining_days
- `CreateVacationBalanceRequest` -- required: employee_id, year, base_entitlement; optional: additional_entitlement, carryover_from_previous, manual_adjustment, carryover_expires_at
- `UpdateVacationBalanceRequest` -- all optional: base_entitlement, additional_entitlement, carryover_from_previous, manual_adjustment, carryover_to_next, carryover_expires_at
- `VacationBalanceList` -- `{ data: VacationBalance[] }`

---

## 3. Generated Models (Go)

**Directory:** `/home/tolga/projects/terp/apps/api/gen/models/`

Files:
- `vacation_balance.go` -- `VacationBalance` struct with all API fields
- `vacation_balance_list.go` -- `VacationBalanceList` with `Data []*VacationBalance`
- `create_vacation_balance_request.go` -- required: EmployeeID, Year, BaseEntitlement
- `update_vacation_balance_request.go` -- all optional fields with omitempty

---

## 4. Generated TypeScript Types

**File:** `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

### VacationBalance (line 7074)
```typescript
VacationBalance: {
    id: string;
    tenant_id: string;
    employee_id: string;
    year: number;
    base_entitlement?: number;
    additional_entitlement?: number;
    carryover_from_previous?: number;
    manual_adjustment?: number;
    used_days?: number;
    planned_days?: number;
    total_entitlement?: number;
    remaining_days?: number;
    carryover_to_next?: number | null;
    carryover_expires_at?: string | null;
    created_at?: string;
    updated_at?: string;
    employee?: components["schemas"]["EmployeeSummary"] | null;
};
```

### CreateVacationBalanceRequest (line 7147)
```typescript
CreateVacationBalanceRequest: {
    employee_id: string;
    year: number;
    base_entitlement: number;
    additional_entitlement?: number;
    carryover_from_previous?: number;
    manual_adjustment?: number;
    carryover_expires_at?: string;
};
```

### UpdateVacationBalanceRequest (line 7162)
```typescript
UpdateVacationBalanceRequest: {
    base_entitlement?: number;
    additional_entitlement?: number;
    carryover_from_previous?: number;
    manual_adjustment?: number;
    carryover_to_next?: number;
    carryover_expires_at?: string;
};
```

### Operation types (line 14312-14441)
- `listVacationBalances` -- query: { employee_id?, year?, department_id? }, response: VacationBalanceList
- `createVacationBalance` -- body: CreateVacationBalanceRequest, response: VacationBalance (201), 409 with ProblemDetails
- `getVacationBalance` -- path: { id }, response: VacationBalance
- `updateVacationBalance` -- path: { id }, body: UpdateVacationBalanceRequest, response: VacationBalance
- `initializeVacationBalances` -- body: { year: number, carryover?: boolean }, response: { message?, created_count? }

---

## 5. Existing Frontend Vacation Balance Components

### API Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-vacation-balance.ts`

Already exists with read-only hooks:
```typescript
export function useVacationBalances(options: UseVacationBalancesOptions = {})
  // GET /vacation-balances with params: employee_id, year, department_id, enabled

export function useVacationBalance(id: string, enabled = true)
  // GET /vacation-balances/{id}

export function useEmployeeVacationBalance(employeeId: string, year?: number, enabled = true)
  // GET /employees/{id}/vacation-balance
```

**Missing hooks (needed for ticket):**
- `useCreateVacationBalance()` -- POST /vacation-balances
- `useUpdateVacationBalance()` -- PATCH /vacation-balances/{id}
- `useInitializeVacationBalances()` -- POST /vacation-balances/initialize

These hooks are exported from `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`:
```typescript
export {
  useVacationBalances,
  useVacationBalance,
  useEmployeeVacationBalance,
} from './use-vacation-balance'
```

### Dashboard Vacation Balance Card

**File:** `/home/tolga/projects/terp/apps/web/src/components/dashboard/vacation-balance-card.tsx`

Uses `useEmployeeVacationBalance` hook. Shows remaining/total days with a stacked progress bar (used=green, planned=yellow). Has loading skeleton and error states.

### Absences Vacation Balance Card

**File:** `/home/tolga/projects/terp/apps/web/src/components/absences/vacation-balance-card.tsx`

Simpler card using `useEmployeeVacationBalance`. Shows remaining/total with progress bar and breakdown of used/planned/carryover days.

### Vacation Balance Breakdown

**File:** `/home/tolga/projects/terp/apps/web/src/components/vacation/balance-breakdown.tsx`

Full breakdown component using `useEmployeeVacationBalance`. Shows:
- Large remaining days number
- Stacked progress bar (used=green, planned=yellow)
- Line-by-line breakdown: base entitlement, additional days, carryover, adjustments, total, used, planned, available
- Uses `BreakdownRow` subcomponent with tooltip support
- Has skeleton and error states

### Vacation Impact Preview

**File:** `/home/tolga/projects/terp/apps/web/src/components/absences/vacation-impact-preview.tsx`

Shows projected balance impact when creating absences. Includes progress bar and warnings for negative/low balance.

### No admin vacation-balance components exist yet

Directories checked:
- `apps/web/src/components/vacation-balances/` -- does not exist
- `apps/web/src/app/[locale]/(dashboard)/admin/vacation-balances/` -- does not exist

---

## 6. Existing Frontend Patterns (Reference)

### Admin Page Pattern

Reference pages:
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx`

Common structure:
```tsx
'use client'

export default function AdminXxxPage() {
  // 1. Auth/permission check with redirect
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  useEffect(() => { if (!authLoading && !isAdmin) router.push('/dashboard') }, ...)

  // 2. Filter/search state
  const [search, setSearch] = useState('')
  const [filterX, setFilterX] = useState(...)

  // 3. Dialog/sheet state
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<Type | null>(null)
  const [viewItem, setViewItem] = useState<Type | null>(null)

  // 4. Data fetching
  const { data, isLoading } = useXxx({ ...filters, enabled: !authLoading && isAdmin })

  // 5. Loading skeleton
  if (authLoading) return <PageSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newXxx')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput ... />
        <Select ... />
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? <Skeleton /> : items.length === 0 ? <EmptyState /> : <DataTable />}
        </CardContent>
      </Card>

      {/* Form sheet */}
      <FormSheet open={createOpen || !!editItem} ... />

      {/* Detail sheet */}
      <DetailSheet ... />
    </div>
  )
}
```

### Data Table Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`

Uses native shadcn Table components:
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
```

Pattern:
- Column headers with translation keys
- Row click handler (e.g., `onClick={() => onView(item)}`)
- Actions column with DropdownMenu
- Optional checkbox selection
- StatusBadge component for status display

### Form Sheet Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/users/user-form-sheet.tsx`

Structure:
```tsx
export function XxxFormSheet({ open, onOpenChange, item, onSuccess }: Props) {
  const isEdit = !!item
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateXxx()
  const updateMutation = useUpdateXxx()

  // Reset form on open/close
  useEffect(() => { if (open) { ... } }, [open, item])

  const handleSubmit = async () => {
    // validate, call mutation, handle errors
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('edit') : t('create')}</SheetTitle>
          <SheetDescription>...</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Form fields */}
            {error && <Alert variant="destructive">...</Alert>}
          </div>
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Detail Sheet Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/absences/absence-detail-sheet.tsx`

Structure:
```tsx
export function XxxDetailSheet({ item, open, onOpenChange, onEdit, onDelete }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('details')}</SheetTitle>
          <SheetDescription>...</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Detail sections with rounded-lg border p-4 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Section Title</h4>
              <div className="rounded-lg border p-4">
                <DetailRow label="..." value="..." />
              </div>
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline">Close</Button>
          <Button variant="outline" onClick={() => onEdit(item)}>Edit</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}
```

### Toolbar Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx`

Layout:
```tsx
<div className="flex flex-wrap items-center gap-2">
  {/* Navigation/date controls */}
  {/* View mode toggle */}
  <div className="flex-1" /> {/* Spacer */}
  {/* Filters */}
  <SearchInput ... />
  <Select ... /> {/* Department filter */}
  {/* Actions */}
  <Button>...</Button>
</div>
```

### Skeleton Loading Pattern

Skeletons are defined as separate functions within the same file:
```tsx
function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-[400px]" />
    </div>
  )
}
```

### API Hook Patterns

**useApiQuery:** `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`
- Type-safe wrapper around React Query `useQuery`
- Takes path string + options (params, path, enabled, etc.)
- Returns standard React Query result

**useApiMutation:** `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`
- Type-safe wrapper around React Query `useMutation`
- Takes path, method ('post'|'put'|'patch'|'delete'), options
- `invalidateKeys` option for cache invalidation
- Variables have `{ body?, path? }` shape

Example mutation hook pattern:
```typescript
export function useCreateXxx() {
  return useApiMutation('/xxx', 'post', {
    invalidateKeys: [['/xxx']],
  })
}

export function useUpdateXxx() {
  return useApiMutation('/xxx/{id}', 'patch', {
    invalidateKeys: [['/xxx']],
  })
}
```

Usage:
```typescript
const createMutation = useCreateXxx()
await createMutation.mutateAsync({
  body: { field1: value1, ... },
})

const updateMutation = useUpdateXxx()
await updateMutation.mutateAsync({
  path: { id: itemId },
  body: { field1: newValue, ... },
})
```

---

## 7. Navigation & Translation Configuration

### Sidebar Configuration

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

The sidebar has three sections: `main`, `management`, and `administration`. Vacation balances would go in the `management` section.

Currently there is a `vacation` entry in `main`:
```typescript
{ titleKey: 'vacation', href: '/vacation', icon: Palmtree }
```

No `vacationBalances` entry exists in the management section. It needs to be added.

NavItem interface:
```typescript
interface NavItem {
  titleKey: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
  badge?: number;
}
```

### Breadcrumbs

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`

Uses `segmentToKey` mapping (Record<string, string>) to translate URL segments to breadcrumb labels. Currently has entries for `vacation` but NOT `vacation-balances`.

Needs addition:
```typescript
'vacation-balances': 'vacationBalances',
```

### Translations

**Files:**
- `/home/tolga/projects/terp/apps/web/messages/en.json`
- `/home/tolga/projects/terp/apps/web/messages/de.json`

Translation structure uses flat JSON with namespace keys:
```json
{
  "nav": { "vacationBalances": "Vacation Balances" },
  "breadcrumbs": { "vacationBalances": "Vacation Balances" },
  "adminVacationBalances": {
    "title": "...",
    "subtitle": "...",
    ...
  }
}
```

Existing translation namespaces follow the pattern:
- `adminEmployees` for employees admin page
- `adminUsers` for users admin page
- `employeeDayPlans` for employee day plans page

No `adminVacationBalances` or `vacationBalances` namespace exists yet.

---

## 8. Dependency APIs

### Employees API Hook

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
useEmployees(options?: {
  limit?: number;
  page?: number;
  search?: string;
  departmentId?: string;
  active?: boolean;
  enabled?: boolean;
})
// Returns: { data: { data: Employee[], total: number }, isLoading, ... }
```

Employee schema includes: id, first_name, last_name, personnel_number, email, department, tariff, is_active, entry_date, exit_date.

### Departments API Hook

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`

```typescript
useDepartments(options?: {
  enabled?: boolean;
  active?: boolean;
  parentId?: string;
})
// Returns: { data: { data: Department[] }, isLoading, ... }
```

### Type Imports Pattern

Components import API types from generated types:
```typescript
import type { components } from '@/lib/api/types'
type VacationBalance = components['schemas']['VacationBalance']
```

---

## 9. UI Component Library Available

All existing admin pages use these shadcn/ui components:

- `Button`, `Input`, `Label`, `Textarea`, `Checkbox`, `Switch`
- `Card`, `CardContent`, `CardHeader`, `CardTitle`
- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`
- `Sheet`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuTrigger`
- `Alert`, `AlertDescription`
- `Badge`
- `Skeleton`
- `ScrollArea`
- `SearchInput` (custom, at `/home/tolga/projects/terp/apps/web/src/components/ui/search-input.tsx`)
- `Pagination` (custom)
- `ConfirmDialog` (custom)
- `Tooltip`, `TooltipContent`, `TooltipTrigger`

Icons from `lucide-react`: Plus, Edit, Trash2, MoreHorizontal, Loader2, Eye, X, AlertTriangle, Palmtree, etc.

---

## 10. Key Observations for Implementation

### Backend field mapping gap
The backend model stores a single `Entitlement` field, but the API schema exposes `base_entitlement` and `additional_entitlement` separately. The handler combines them on create: `entitlement = base + additional`. On response, only `BaseEntitlement` is set from `Entitlement`. `AdditionalEntitlement` is always 0 in responses. `PlannedDays` is also always 0 in responses.

### Existing hooks are read-only
The current `use-vacation-balance.ts` file only has query hooks. Mutation hooks (create, update, initialize) need to be added.

### No admin page or components exist
The `apps/web/src/components/vacation-balances/` directory and `apps/web/src/app/[locale]/(dashboard)/admin/vacation-balances/` directory do not exist and need to be created.

### Balance breakdown component exists as reference
The `BalanceBreakdown` component at `/home/tolga/projects/terp/apps/web/src/components/vacation/balance-breakdown.tsx` provides a ready-made breakdown visualization with progress bars that can serve as a reference for the detail sheet.

### Translation and navigation entries needed
Both `en.json` and `de.json` need new translation namespaces. The sidebar nav config and breadcrumbs need new entries.
