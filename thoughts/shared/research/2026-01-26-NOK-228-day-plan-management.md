# Research: NOK-228 Day Plan Management

**Date**: 2026-01-26
**Ticket**: NOK-228 - Build day plan management with break and bonus configuration

## Overview

This document analyzes the existing codebase for implementing a comprehensive day plan management interface in the frontend.

---

## 1. Backend API Implementation

### 1.1 Existing Day Plan API Endpoints

The day plan API is fully implemented in the backend with all required endpoints:

**File**: `/home/tolga/projects/terp/api/paths/day-plans.yaml`

| Method | Endpoint | Operation | Description |
|--------|----------|-----------|-------------|
| GET | `/day-plans` | listDayPlans | List day plans with optional filters |
| POST | `/day-plans` | createDayPlan | Create new day plan |
| GET | `/day-plans/{id}` | getDayPlan | Get single day plan with breaks/bonuses |
| PUT | `/day-plans/{id}` | updateDayPlan | Update day plan |
| DELETE | `/day-plans/{id}` | deleteDayPlan | Delete day plan |
| POST | `/day-plans/{id}/copy` | copyDayPlan | Copy day plan with new code/name |
| POST | `/day-plans/{id}/breaks` | createDayPlanBreak | Add break to day plan |
| DELETE | `/day-plans/{id}/breaks/{breakId}` | deleteDayPlanBreak | Remove break |
| POST | `/day-plans/{id}/bonuses` | createDayPlanBonus | Add bonus/surcharge |
| DELETE | `/day-plans/{id}/bonuses/{bonusId}` | deleteDayPlanBonus | Remove bonus |

### 1.2 Query Parameters

**GET /day-plans**:
- `active` (boolean): Filter by active status
- `plan_type` (string, enum: "fixed", "flextime"): Filter by plan type

---

## 2. Day Plan Data Model

### 2.1 Database Schema

**File**: `/home/tolga/projects/terp/db/migrations/000015_create_day_plans.up.sql`
**Extended by**: `/home/tolga/projects/terp/db/migrations/000030_add_day_plan_zmi_fields.up.sql`

### 2.2 Day Plan Fields

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

#### Basic Information
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant reference |
| `code` | string (max 20) | Unique identifier (not U, K, or S) |
| `name` | string (max 255) | Display name |
| `description` | string | Optional description |
| `plan_type` | enum | "fixed" or "flextime" |
| `is_active` | boolean | Active status |

#### Time Windows (minutes from midnight)
| Field | Type | Description |
|-------|------|-------------|
| `come_from` | int | Earliest allowed arrival |
| `come_to` | int | Latest allowed arrival (GLZ only) |
| `go_from` | int | Earliest allowed departure (GLZ only) |
| `go_to` | int | Latest allowed departure |
| `core_start` | int | Core time start |
| `core_end` | int | Core time end |

#### Target Hours
| Field | Type | Description |
|-------|------|-------------|
| `regular_hours` | int | Target daily hours (minutes) |
| `regular_hours_2` | int | Alternative for absence days |
| `from_employee_master` | boolean | Get target from employee |

#### Tolerance Settings
| Field | Type | Description |
|-------|------|-------------|
| `tolerance_come_plus` | int | Late arrival tolerance (minutes) |
| `tolerance_come_minus` | int | Early arrival tolerance (minutes) |
| `tolerance_go_plus` | int | Late departure tolerance (minutes) |
| `tolerance_go_minus` | int | Early departure tolerance (minutes) |
| `variable_work_time` | boolean | Enable tolerance_come_minus for FAZ |

#### Rounding Settings
| Field | Type | Description |
|-------|------|-------------|
| `rounding_come_type` | enum | "none", "up", "down", "nearest", "add", "subtract" |
| `rounding_come_interval` | int | Rounding interval (minutes) |
| `rounding_go_type` | enum | Same as come_type |
| `rounding_go_interval` | int | Rounding interval (minutes) |
| `rounding_come_add_value` | int | Add/subtract value |
| `rounding_go_add_value` | int | Add/subtract value |
| `round_all_bookings` | boolean | Round all vs first/last only |

#### Work Time Limits
| Field | Type | Description |
|-------|------|-------------|
| `min_work_time` | int | Minimum work time (minutes) |
| `max_net_work_time` | int | Maximum net work time (minutes) |

#### Holiday Credits (minutes)
| Field | Type | Description |
|-------|------|-------------|
| `holiday_credit_cat1` | int | Full holiday credit |
| `holiday_credit_cat2` | int | Half holiday credit |
| `holiday_credit_cat3` | int | Custom category credit |

#### Special Settings
| Field | Type | Description |
|-------|------|-------------|
| `vacation_deduction` | decimal(5,2) | Vacation days deducted (default 1.0) |
| `no_booking_behavior` | enum | "error", "deduct_target", "vocational_school", "adopt_target", "target_with_order" |
| `day_change_behavior` | enum | "none", "at_arrival", "at_departure", "auto_complete" |

#### Shift Detection
| Field | Type | Description |
|-------|------|-------------|
| `shift_detect_arrive_from` | int | Arrival detection window start |
| `shift_detect_arrive_to` | int | Arrival detection window end |
| `shift_detect_depart_from` | int | Departure detection window start |
| `shift_detect_depart_to` | int | Departure detection window end |
| `shift_alt_plan_1` through `shift_alt_plan_6` | UUID | Alternative day plans |

### 2.3 Day Plan Break Fields

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` (DayPlanBreak struct)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `day_plan_id` | UUID | Parent reference |
| `break_type` | enum | "fixed", "variable", "minimum" |
| `start_time` | int | Break window start (minutes) |
| `end_time` | int | Break window end (minutes) |
| `duration` | int | Break duration (minutes) |
| `after_work_minutes` | int | Threshold for minimum breaks |
| `auto_deduct` | boolean | Auto-deduct if no manual break |
| `is_paid` | boolean | Paid break flag |
| `minutes_difference` | boolean | Proportional deduction near threshold |
| `sort_order` | int | Display order |

### 2.4 Day Plan Bonus Fields

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` (DayPlanBonus struct)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `day_plan_id` | UUID | Parent reference |
| `account_id` | UUID | Target account for bonus |
| `time_from` | int | Bonus time window start |
| `time_to` | int | Bonus time window end |
| `calculation_type` | enum | "fixed", "per_minute", "percentage" |
| `value_minutes` | int | Bonus value in minutes |
| `min_work_minutes` | int | Minimum work required |
| `applies_on_holiday` | boolean | Apply on holidays |
| `sort_order` | int | Display order |

---

## 3. Handler Implementation

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/dayplan.go`

The handler provides:
- Standard CRUD operations
- Copy functionality
- Break and bonus sub-resource management
- Filter support for listing

### Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 153-167)

```go
func RegisterDayPlanRoutes(r chi.Router, h *DayPlanHandler) {
    r.Route("/day-plans", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.Get)
        r.Put("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
        r.Post("/{id}/copy", h.Copy)
        r.Post("/{id}/breaks", h.AddBreak)
        r.Delete("/{id}/breaks/{breakId}", h.DeleteBreak)
        r.Post("/{id}/bonuses", h.AddBonus)
        r.Delete("/{id}/bonuses/{bonusId}", h.DeleteBonus)
    })
}
```

---

## 4. Frontend Patterns

### 4.1 Admin Page Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/employees/page.tsx`

Key patterns:
1. **Page Header**: Title, description, "New" button
2. **Filter Bar**: SearchInput, Select dropdown for filters, "Clear filters" button
3. **Bulk Actions**: Shown when items selected
4. **Data Table**: Card wrapper with EmployeeDataTable
5. **Pagination**: At bottom of page
6. **Dialogs/Sheets**: Create/Edit FormSheet, DetailSheet, ConfirmDialog

State management:
```typescript
const [page, setPage] = React.useState(1)
const [limit, setLimit] = React.useState(20)
const [search, setSearch] = React.useState('')
const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
const [createOpen, setCreateOpen] = React.useState(false)
const [editEmployee, setEditEmployee] = React.useState<Employee | null>(null)
const [viewEmployee, setViewEmployee] = React.useState<Employee | null>(null)
const [deleteEmployee, setDeleteEmployee] = React.useState<Employee | null>(null)
```

### 4.2 Data Table Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`

Features:
- Checkbox column for selection
- Select all toggle with indeterminate state
- Row click to view details
- Action dropdown (MoreHorizontal icon) with View, Edit, Delete options
- StatusBadge for active/inactive state
- Skeleton loading state

### 4.3 Form Sheet Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`

Structure:
1. **Sheet** with side="right"
2. **SheetHeader**: Title, Description
3. **ScrollArea**: Form content
4. **Form sections**: Grouped fields with section headers
5. **SheetFooter**: Cancel and Submit buttons

Form state pattern:
```typescript
interface FormState {
  field1: string
  field2: number
  // ...
}
const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
const [error, setError] = React.useState<string | null>(null)
```

Field change pattern:
```typescript
onChange={(e) => setForm((prev) => ({ ...prev, fieldName: e.target.value }))}
```

### 4.4 Complex Form Pattern (Multi-section)

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/absences/absence-request-form.tsx`

For complex forms:
- Uses Sheet with ScrollArea
- Sections divided by Labels with larger text
- Conditional field display
- Preview/impact components inline
- API hooks for loading reference data
- Real-time calculation display

### 4.5 UI Components Available

**Directory**: `/home/tolga/projects/terp/apps/web/src/components/ui/`

| Component | Description |
|-----------|-------------|
| Button | Standard button with variants |
| Input | Text input |
| Label | Form labels |
| Select | Dropdown select |
| Checkbox | Checkbox input |
| RadioGroup | Radio button group |
| Textarea | Multiline text input |
| Tabs | Tab navigation |
| Card | Container with optional header |
| Sheet | Side panel |
| ScrollArea | Scrollable container |
| Table | Data table components |
| Badge | Status indicators |
| Alert | Error/warning messages |
| Skeleton | Loading placeholders |
| Pagination | Page navigation |
| SearchInput | Search with icon |
| ConfirmDialog | Confirmation modal |
| Calendar | Date picker |
| Popover | Popover container |
| DateRangePicker | Date range selection |
| Tooltip | Hover tooltips |

---

## 5. API Hooks Pattern

### 5.1 Generic Hooks

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

Query hook usage:
```typescript
const { data, isLoading, isFetching } = useApiQuery('/employees', {
  params: { limit, page, q: search, active },
  enabled: true,
})
```

Mutation hook usage:
```typescript
const createMutation = useApiMutation('/employees', 'post', {
  invalidateKeys: [['/employees']],
})

// Usage
await createMutation.mutateAsync({
  body: { /* request body */ },
})
```

### 5.2 Domain Hook Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
export function useEmployees(options: UseEmployeesOptions = {}) {
  const { limit = 20, page, search, active, enabled = true } = options

  return useApiQuery('/employees', {
    params: { limit, page, q: search, active },
    enabled,
  })
}

export function useCreateEmployee() {
  return useApiMutation('/employees', 'post', {
    invalidateKeys: [['/employees']],
  })
}
```

### 5.3 Hooks Not Yet Created for Day Plans

The following hooks need to be created in `apps/web/src/hooks/api/use-day-plans.ts`:

- `useDayPlans(options)` - List with filters
- `useDayPlan(id)` - Get single with details
- `useCreateDayPlan()` - Create mutation
- `useUpdateDayPlan()` - Update mutation
- `useDeleteDayPlan()` - Delete mutation
- `useCopyDayPlan()` - Copy mutation
- `useCreateDayPlanBreak()` - Add break mutation
- `useDeleteDayPlanBreak()` - Remove break mutation
- `useCreateDayPlanBonus()` - Add bonus mutation
- `useDeleteDayPlanBonus()` - Remove bonus mutation

### 5.4 Accounts Hook Needed

Bonuses require selecting an account. A `useAccounts()` hook needs to be created:

**Reference endpoint**: GET `/accounts` (exists in routes.go)

---

## 6. Generated API Types

### 6.1 Day Plan Types Available

**File**: `/home/tolga/projects/terp/apps/api/gen/models/day_plan.go`

- `DayPlan` - Full day plan response
- `DayPlanList` - List response wrapper
- `CreateDayPlanRequest` - Create request body
- `UpdateDayPlanRequest` - Update request body
- `CopyDayPlanRequest` - Copy request body

### 6.2 Break Types Available

**File**: `/home/tolga/projects/terp/apps/api/gen/models/day_plan_break.go`

- `DayPlanBreak` - Break response
- `CreateDayPlanBreakRequest` - Create break request

### 6.3 Bonus Types Available

**File**: `/home/tolga/projects/terp/apps/api/gen/models/day_plan_bonus.go`

- `DayPlanBonus` - Bonus response with embedded Account
- `CreateDayPlanBonusRequest` - Create bonus request

### 6.4 Enum Values

**Plan Types**: `fixed`, `flextime`

**Rounding Types**: `none`, `up`, `down`, `nearest` (note: `add`, `subtract` in model but not in API spec)

**Break Types**: `fixed`, `variable`, `minimum`

**Calculation Types**: `fixed`, `per_minute`, `percentage`

---

## 7. File Locations Summary

### Backend Files
- **Handler**: `/home/tolga/projects/terp/apps/api/internal/handler/dayplan.go`
- **Service**: `/home/tolga/projects/terp/apps/api/internal/service/dayplan.go`
- **Repository**: `/home/tolga/projects/terp/apps/api/internal/repository/dayplan.go`
- **Model**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`
- **Routes**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`
- **Generated Models**: `/home/tolga/projects/terp/apps/api/gen/models/`

### Frontend Files to Create
- **Page**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx`
- **Hooks**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts`
- **Hooks**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-accounts.ts`
- **Components**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/`
  - `day-plan-data-table.tsx`
  - `day-plan-form-sheet.tsx` (or multi-step wizard)
  - `day-plan-detail-sheet.tsx`
  - `break-form.tsx`
  - `bonus-form.tsx`
  - `time-picker.tsx` (or use existing patterns)
  - `time-window-input.tsx`

### API Spec Files
- **Paths**: `/home/tolga/projects/terp/api/paths/day-plans.yaml`
- **Schemas**: `/home/tolga/projects/terp/api/schemas/day-plans.yaml`

---

## 8. Time Input Considerations

Times are stored as **minutes from midnight** (0-1440). Frontend needs:

1. **Display**: Convert minutes to HH:MM format
2. **Input**: Time picker or text input with validation
3. **Examples**:
   - 420 = 07:00
   - 540 = 09:00
   - 960 = 16:00
   - 1080 = 18:00

Utility functions needed:
```typescript
function minutesToTime(minutes: number): string
function timeToMinutes(time: string): number
```

---

## 9. Form Section Organization

Based on ZMI reference and data model, the form should have these sections:

1. **Basic Information**
   - Code, Name, Description
   - Plan Type (Fixed/Flextime toggle)
   - Active status

2. **Time Windows**
   - Arrival: come_from, come_to
   - Departure: go_from, go_to
   - Core time: core_start, core_end

3. **Target Hours**
   - Regular hours (Regelarbeitszeit 1)
   - Alternative hours for absence (Regelarbeitszeit 2)
   - From employee master checkbox

4. **Tolerances**
   - Come +/- (show - only if variable_work_time for FAZ)
   - Go +/-
   - Variable work time checkbox (FAZ only)

5. **Rounding**
   - Come: type, interval, add_value
   - Go: type, interval, add_value
   - Round all bookings checkbox

6. **Breaks** (sub-form/list)
   - Type selector
   - Time window (fixed)
   - Duration
   - After work threshold (minimum)
   - Auto-deduct, Minutes difference, Is paid

7. **Bonuses/Surcharges** (sub-form/list)
   - Account selector
   - Time window
   - Calculation type
   - Value
   - Min work required
   - Applies on holiday

8. **Shift Detection**
   - Arrival detection window
   - Departure detection window
   - Alternative plans (up to 6)

9. **Special Settings**
   - Holiday credits (cat 1, 2, 3)
   - Vacation deduction
   - No-booking behavior
   - Day change behavior
   - Min/max work time
