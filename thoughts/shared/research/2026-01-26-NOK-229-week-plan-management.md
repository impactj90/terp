# Research: NOK-229 Week Plan Management

> **Date**: 2026-01-26
> **Ticket**: NOK-229
> **Purpose**: Research existing codebase patterns for implementing week plan management UI

---

## 1. Week Plan Backend API

### 1.1 OpenAPI Specification

**Location**: `/home/tolga/projects/terp/api/paths/week-plans.yaml`

**Endpoints**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/week-plans` | List week plans (optional `active` query param) |
| POST | `/week-plans` | Create week plan |
| GET | `/week-plans/{id}` | Get week plan by ID (includes day plan relations) |
| PUT | `/week-plans/{id}` | Update week plan |
| DELETE | `/week-plans/{id}` | Delete week plan |

### 1.2 Week Plan Schema

**Location**: `/home/tolga/projects/terp/api/schemas/week-plans.yaml`

**WeekPlan Response**:
```yaml
WeekPlan:
  required: [id, tenant_id, code, name]
  properties:
    id: uuid
    tenant_id: uuid
    code: string (e.g., "WEEK-001")
    name: string (e.g., "Standard Week")
    description: string (nullable)
    # Day plan assignments (all nullable - null means off day)
    monday_day_plan_id: uuid
    tuesday_day_plan_id: uuid
    wednesday_day_plan_id: uuid
    thursday_day_plan_id: uuid
    friday_day_plan_id: uuid
    saturday_day_plan_id: uuid
    sunday_day_plan_id: uuid
    is_active: boolean
    created_at: datetime
    updated_at: datetime
    # Expanded relations (DayPlanSummary)
    monday_day_plan: DayPlanSummary (nullable)
    tuesday_day_plan: DayPlanSummary (nullable)
    wednesday_day_plan: DayPlanSummary (nullable)
    thursday_day_plan: DayPlanSummary (nullable)
    friday_day_plan: DayPlanSummary (nullable)
    saturday_day_plan: DayPlanSummary (nullable)
    sunday_day_plan: DayPlanSummary (nullable)
```

**CreateWeekPlanRequest**:
```yaml
required: [code, name]
properties:
  code: string (1-20 chars)
  name: string (1-255 chars)
  description: string
  monday_day_plan_id: uuid
  tuesday_day_plan_id: uuid
  wednesday_day_plan_id: uuid
  thursday_day_plan_id: uuid
  friday_day_plan_id: uuid
  saturday_day_plan_id: uuid
  sunday_day_plan_id: uuid
```

**UpdateWeekPlanRequest**:
```yaml
properties:
  name: string (1-255 chars)
  description: string
  monday_day_plan_id: uuid
  tuesday_day_plan_id: uuid
  wednesday_day_plan_id: uuid
  thursday_day_plan_id: uuid
  friday_day_plan_id: uuid
  saturday_day_plan_id: uuid
  sunday_day_plan_id: uuid
  is_active: boolean
```

**DayPlanSummary** (referenced for expanded relations):
```yaml
required: [id, code, name, plan_type]
properties:
  id: uuid
  code: string
  name: string
  plan_type: string (fixed | flextime)
```

---

## 2. Week Plan Backend Implementation

### 2.1 Model

**Location**: `/home/tolga/projects/terp/apps/api/internal/model/weekplan.go`

```go
type WeekPlan struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string

    // Day plan IDs (nullable for off days)
    MondayDayPlanID    *uuid.UUID
    TuesdayDayPlanID   *uuid.UUID
    WednesdayDayPlanID *uuid.UUID
    ThursdayDayPlanID  *uuid.UUID
    FridayDayPlanID    *uuid.UUID
    SaturdayDayPlanID  *uuid.UUID
    SundayDayPlanID    *uuid.UUID

    IsActive  bool
    CreatedAt time.Time
    UpdatedAt time.Time

    // Relations (GORM foreignKey)
    MondayDayPlan    *DayPlan
    TuesdayDayPlan   *DayPlan
    // ... etc for all days
}

// Helper methods
func (wp *WeekPlan) GetDayPlanIDForWeekday(weekday time.Weekday) *uuid.UUID
func (wp *WeekPlan) WorkDaysPerWeek() int  // Count of days with assigned plans
```

### 2.2 Repository

**Location**: `/home/tolga/projects/terp/apps/api/internal/repository/weekplan.go`

**Key Methods**:
- `Create(ctx, plan)` - Insert new week plan
- `GetByID(ctx, id)` - Get week plan by ID
- `GetByCode(ctx, tenantID, code)` - Get by code for uniqueness check
- `GetWithDayPlans(ctx, id)` - Preload all day plan relations
- `Update(ctx, plan)` - Update existing week plan
- `Delete(ctx, id)` - Delete week plan
- `List(ctx, tenantID)` - List all week plans for tenant
- `ListActive(ctx, tenantID)` - List only active week plans

**Error**:
- `ErrWeekPlanNotFound`

### 2.3 Service

**Location**: `/home/tolga/projects/terp/apps/api/internal/service/weekplan.go`

**Errors**:
- `ErrWeekPlanNotFound`
- `ErrWeekPlanCodeExists`
- `ErrInvalidDayPlan`
- `ErrWeekPlanCodeReq`
- `ErrWeekPlanNameReq`

**Input Types**:
```go
type CreateWeekPlanInput struct {
    TenantID           uuid.UUID
    Code               string
    Name               string
    Description        *string
    MondayDayPlanID    *uuid.UUID
    // ... etc for all days
}

type UpdateWeekPlanInput struct {
    Name               *string
    Description        *string
    MondayDayPlanID    *uuid.UUID
    // ... etc for all days
    IsActive           *bool
    // Clear flags for setting day to null
    ClearMondayDayPlan    bool
    // ... etc
}
```

**Validation Logic**:
1. Code and name trimmed and required
2. Code uniqueness checked within tenant
3. All day plan IDs validated to exist and belong to same tenant

### 2.4 Handler

**Location**: `/home/tolga/projects/terp/apps/api/internal/handler/weekplan.go`

**Routes Registration** (from `routes.go`):
```go
func RegisterWeekPlanRoutes(r chi.Router, h *WeekPlanHandler) {
    r.Route("/week-plans", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.Get)
        r.Put("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
    })
}
```

**Response Format**:
- List: `{ "data": [...] }`
- Get/Create/Update: WeekPlan object directly

---

## 3. Day Plan Management UI Patterns

### 3.1 Page Structure

**Location**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx`

**Pattern**:
```tsx
export default function DayPlansPage() {
    // Auth check
    const { isLoading: authLoading } = useAuth()
    const isAdmin = useHasRole(['admin'])

    // Filters
    const [search, setSearch] = useState('')
    const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)
    const [typeFilter, setTypeFilter] = useState<'fixed' | 'flextime' | undefined>(undefined)

    // Dialog state
    const [createOpen, setCreateOpen] = useState(false)
    const [editDayPlan, setEditDayPlan] = useState<DayPlan | null>(null)
    const [viewDayPlan, setViewDayPlan] = useState<DayPlan | null>(null)
    const [deleteDayPlan, setDeleteDayPlan] = useState<DayPlan | null>(null)
    const [copyDayPlan, setCopyDayPlan] = useState<DayPlan | null>(null)

    // Data fetching
    const { data, isLoading, isFetching } = useDayPlans({ ... })
    const deleteMutation = useDeleteDayPlan()

    // Redirect non-admin
    useEffect(() => {
        if (!authLoading && !isAdmin) router.push('/dashboard')
    }, [authLoading, isAdmin, router])

    // Render structure
    return (
        <div className="space-y-6">
            {/* Page header with title + "New" button */}
            {/* Filter bar: search + select filters + clear button */}
            {/* Card with DataTable or EmptyState */}
            {/* FormSheet for create/edit */}
            {/* DetailSheet for view */}
            {/* CopyDialog */}
            {/* ConfirmDialog for delete */}
        </div>
    )
}
```

### 3.2 Data Table Pattern

**Location**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-data-table.tsx`

**Props Interface**:
```tsx
interface DayPlanDataTableProps {
    dayPlans: DayPlan[]
    isLoading: boolean
    onView: (dayPlan: DayPlan) => void
    onEdit: (dayPlan: DayPlan) => void
    onDelete: (dayPlan: DayPlan) => void
    onCopy: (dayPlan: DayPlan) => void
}
```

**Table Structure**:
- Uses shadcn/ui Table components
- Row click triggers `onView`
- Action column with DropdownMenu (View, Edit, Copy, Delete)
- Includes loading skeleton component

### 3.3 Form Sheet Pattern

**Location**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-form-sheet.tsx`

**Key Patterns**:
```tsx
interface DayPlanFormSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    dayPlan?: DayPlan | null  // null = create, defined = edit
    onSuccess?: () => void
}

// Uses Tabs for organizing complex forms
<Tabs defaultValue="basic">
    <TabsList>
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="time">Time Windows</TabsTrigger>
        // ...
    </TabsList>
    <TabsContent value="basic">...</TabsContent>
    // ...
</Tabs>

// Form state management
const [form, setForm] = useState<FormState>(INITIAL_STATE)
const [error, setError] = useState<string | null>(null)

// Mutation hooks
const createMutation = useCreateDayPlan()
const updateMutation = useUpdateDayPlan()

// Submit handler
const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
        setError(errors.join('. '))
        return
    }
    try {
        if (isEdit) await updateMutation.mutateAsync(...)
        else await createMutation.mutateAsync(...)
        onSuccess?.()
    } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
    }
}
```

### 3.4 Detail Sheet Pattern

**Location**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-detail-sheet.tsx`

**Pattern**:
```tsx
interface DayPlanDetailSheetProps {
    dayPlanId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onEdit: (dayPlan: DayPlan) => void
    onDelete: (dayPlan: DayPlan) => void
    onCopy: (dayPlan: DayPlan) => void
}

// Fetches full details when open
const { data: dayPlan, isLoading } = useDayPlan(dayPlanId ?? '', open && !!dayPlanId)

// Section component for organization
function Section({ title, icon: Icon, children }) {
    return (
        <div>
            <h3 className="flex items-center gap-2 text-sm font-medium mb-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {title}
            </h3>
            <div className="space-y-2">{children}</div>
        </div>
    )
}

// DetailRow for label-value pairs
function DetailRow({ label, value }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    )
}
```

### 3.5 Copy Dialog Pattern

**Location**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`

```tsx
interface CopyDayPlanDialogProps {
    dayPlan: DayPlan | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

// Pre-fills with defaults
useEffect(() => {
    if (open && dayPlan) {
        setNewCode(`${dayPlan.code}-COPY`)
        setNewName(`${dayPlan.name} (Copy)`)
    }
}, [open, dayPlan])
```

---

## 4. API Hooks Pattern

### 4.1 Day Plans Hooks

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts`

**Pattern**:
```tsx
// List with filters
export function useDayPlans(options: UseDayPlansOptions = {}) {
    const { active, planType, enabled = true } = options
    return useApiQuery('/day-plans', {
        params: { active, plan_type: planType },
        enabled,
    })
}

// Single item by ID
export function useDayPlan(id: string, enabled = true) {
    return useApiQuery('/day-plans/{id}', {
        path: { id },
        enabled: enabled && !!id,
    })
}

// Mutations
export function useCreateDayPlan() {
    return useApiMutation('/day-plans', 'post', {
        invalidateKeys: [['/day-plans']],
    })
}

export function useUpdateDayPlan() {
    return useApiMutation('/day-plans/{id}', 'put', {
        invalidateKeys: [['/day-plans']],
    })
}

export function useDeleteDayPlan() {
    return useApiMutation('/day-plans/{id}', 'delete', {
        invalidateKeys: [['/day-plans']],
    })
}

export function useCopyDayPlan() {
    return useApiMutation('/day-plans/{id}/copy', 'post', {
        invalidateKeys: [['/day-plans']],
    })
}
```

### 4.2 Teams Hooks (for reference)

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-teams.ts`

Shows similar pattern with additional complexity for nested resources (members).

### 4.3 Hooks Index

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

All domain hooks are exported from here. New week plan hooks should be added.

---

## 5. Other Admin Page Patterns

### 5.1 Teams Page

**Location**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/teams/page.tsx`

**Additional patterns**:
- Department filter dropdown (fetches departments separately)
- Selection state with `Set<string>` for bulk operations
- `MemberManagementSheet` for nested resource management

### 5.2 Departments Page

**Location**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx`

**Additional patterns**:
- View mode toggle (tree vs list) using Tabs
- Tree filtering with recursive `filterNodes` function
- `handleAddChild` for creating nested items

---

## 6. UI Components Used

### 6.1 Confirm Dialog

**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`

```tsx
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

Uses Sheet with `side="bottom"` for mobile-friendly confirmation.

### 6.2 Search Input

**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/search-input.tsx`

```tsx
interface SearchInputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    debounceMs?: number  // Default 300
    className?: string
    disabled?: boolean
}
```

Features: debounced input, search icon, clear button, Enter/Escape key handling.

### 6.3 Time Utilities

**Location**: `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

**Key functions**:
- `formatTime(minutes)` - Minutes to HH:MM (e.g., 510 -> "08:30")
- `formatDuration(minutes)` - Minutes to human readable (e.g., 510 -> "8h 30m")
- `formatMinutes(minutes)` - Minutes to H:MM (e.g., 510 -> "8:30")
- `timeStringToMinutes(time)` - HH:MM to minutes

---

## 7. Type Generation

### 7.1 Generated API Types

**Location**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

Generated from OpenAPI spec. Types accessed via:
```tsx
import type { components } from '@/lib/api/types'
type WeekPlan = components['schemas']['WeekPlan']
type CreateWeekPlanRequest = components['schemas']['CreateWeekPlanRequest']
```

### 7.2 Generated Go Models

**Location**: `/home/tolga/projects/terp/apps/api/gen/models/`

Models like `week_plan.go`, `create_week_plan_request.go` are generated from OpenAPI.

---

## 8. Existing Week Plan API Usage Notes

### 8.1 Day Plan ID Handling

From the handler implementation, day plan IDs are validated:
1. Check if ID string is non-empty
2. Parse to UUID
3. Service validates that day plan exists and belongs to same tenant

### 8.2 List Response Format

```json
{
    "data": [
        {
            "id": "...",
            "code": "WEEK-001",
            "name": "Standard Week",
            "monday_day_plan_id": "...",
            "monday_day_plan": { "id": "...", "code": "...", "name": "...", "plan_type": "fixed" },
            // ... other days
            "is_active": true
        }
    ]
}
```

### 8.3 Detail Response

Get by ID returns the WeekPlan with all day plan relations preloaded (via `GetWithDayPlans`).

---

## 9. Component File Organization

Based on day-plans pattern:

```
apps/web/src/components/week-plans/
  week-plan-data-table.tsx      # Table with row actions
  week-plan-form-sheet.tsx      # Create/edit form
  week-plan-detail-sheet.tsx    # View details
  copy-week-plan-dialog.tsx     # Copy with rename (if needed)
  index.ts                      # Barrel export
```

---

## 10. Summary: Key Implementation Details

### 10.1 What Exists

1. **Backend API** - Complete implementation with:
   - CRUD endpoints
   - Day plan validation
   - Preloaded relations in GET response
   - Active filter support

2. **OpenAPI Spec** - Fully defined with request/response schemas

3. **Generated Types** - TypeScript types available via `@/lib/api/types`

### 10.2 What Needs Implementation

1. **Frontend API Hooks** (`use-week-plans.ts`):
   - `useWeekPlans(options)` - List with active filter
   - `useWeekPlan(id)` - Get single with details
   - `useCreateWeekPlan()` - Create mutation
   - `useUpdateWeekPlan()` - Update mutation
   - `useDeleteWeekPlan()` - Delete mutation
   - Optionally: `useCopyWeekPlan()` if copy endpoint added

2. **Admin Page** (`app/(dashboard)/admin/week-plans/page.tsx`):
   - Follow day-plans page pattern
   - Filter by active status and search
   - Empty state handling

3. **Components**:
   - `WeekPlanDataTable` - 7-day grid with day plan names
   - `WeekPlanFormSheet` - Day plan dropdowns for each day
   - `WeekPlanDetailSheet` - Visual week overview
   - `CopyWeekPlanDialog` - If copy feature needed

4. **Weekly Hours Calculation**:
   - Frontend-only: sum `regular_hours` from each day's `DayPlanSummary`
   - Requires fetching day plans or including in response

5. **Usage Count**:
   - Not currently in API - would need backend addition
   - Or query employees with this week plan
