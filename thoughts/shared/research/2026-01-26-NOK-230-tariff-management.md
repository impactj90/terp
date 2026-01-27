# Research: NOK-230 Tariff Management with Week Plan Assignment

## Overview

This document captures research findings for implementing tariff management in the Next.js frontend. Tariffs define employment contract terms linking week plans and break deduction rules.

---

## 1. Backend Architecture

### 1.1 Tariff Model

**Location**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go`

```go
type Tariff struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string     `gorm:"type:varchar(20);not null" json:"code"`
    Name        string     `gorm:"type:varchar(255);not null" json:"name"`
    Description *string    `gorm:"type:text" json:"description,omitempty"`
    WeekPlanID  *uuid.UUID `gorm:"type:uuid" json:"week_plan_id,omitempty"`
    ValidFrom   *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
    ValidTo     *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive    bool       `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time  `gorm:"default:now()" json:"updated_at"`

    // Relations
    WeekPlan *WeekPlan     `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
    Breaks   []TariffBreak `gorm:"foreignKey:TariffID" json:"breaks,omitempty"`
}

type TariffBreak struct {
    ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TariffID         uuid.UUID `gorm:"type:uuid;not null;index" json:"tariff_id"`
    BreakType        BreakType `gorm:"type:varchar(20);not null" json:"break_type"`
    AfterWorkMinutes *int      `gorm:"type:int" json:"after_work_minutes,omitempty"`
    Duration         int       `gorm:"type:int;not null" json:"duration"`
    IsPaid           bool      `gorm:"default:false" json:"is_paid"`
    SortOrder        int       `gorm:"default:0" json:"sort_order"`
    CreatedAt        time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt        time.Time `gorm:"default:now()" json:"updated_at"`
}
```

### 1.2 Break Type Enum

**Location**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

```go
type BreakType string

const (
    BreakTypeFixed    BreakType = "fixed"
    BreakTypeVariable BreakType = "variable"
    BreakTypeMinimum  BreakType = "minimum"
)
```

### 1.3 Tariff Repository

**Location**: `/home/tolga/projects/terp/apps/api/internal/repository/tariff.go`

Key methods:
- `Create(ctx, *Tariff)` - Create new tariff
- `GetByID(ctx, uuid)` - Get tariff by ID
- `GetByCode(ctx, tenantID, code)` - Get by code for uniqueness check
- `GetWithDetails(ctx, id)` - Get with WeekPlan and Breaks preloaded
- `Update(ctx, *Tariff)` - Update tariff
- `Delete(ctx, id)` - Delete tariff
- `List(ctx, tenantID)` - List all tariffs (with breaks preloaded)
- `ListActive(ctx, tenantID)` - List active tariffs only
- `CreateBreak(ctx, *TariffBreak)` - Create break
- `DeleteBreak(ctx, id)` - Delete break
- `ListBreaks(ctx, tariffID)` - List breaks for tariff

### 1.4 Tariff Service

**Location**: `/home/tolga/projects/terp/apps/api/internal/service/tariff.go`

Service errors:
```go
var (
    ErrTariffNotFound      = errors.New("tariff not found")
    ErrTariffCodeExists    = errors.New("tariff code already exists")
    ErrTariffCodeReq       = errors.New("tariff code is required")
    ErrTariffNameReq       = errors.New("tariff name is required")
    ErrInvalidWeekPlan     = errors.New("invalid week plan reference")
    ErrTariffBreakNotFound = errors.New("tariff break not found")
    ErrInvalidBreakType    = errors.New("invalid break type")
    ErrBreakDurationReq    = errors.New("break duration is required")
)
```

Input types:
```go
type CreateTariffInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    WeekPlanID  *uuid.UUID
    ValidFrom   *time.Time
    ValidTo     *time.Time
}

type UpdateTariffInput struct {
    Name           *string
    Description    *string
    WeekPlanID     *uuid.UUID
    ValidFrom      *time.Time
    ValidTo        *time.Time
    IsActive       *bool
    ClearWeekPlan  bool
    ClearValidFrom bool
    ClearValidTo   bool
}

type CreateTariffBreakInput struct {
    TariffID         uuid.UUID
    BreakType        string
    AfterWorkMinutes *int
    Duration         int
    IsPaid           bool
}
```

### 1.5 Tariff Handler

**Location**: `/home/tolga/projects/terp/apps/api/internal/handler/tariff.go`

Endpoints:
- `List` - GET /tariffs (supports `?active=true` filter)
- `Get` - GET /tariffs/{id}
- `Create` - POST /tariffs
- `Update` - PUT /tariffs/{id}
- `Delete` - DELETE /tariffs/{id}
- `CreateBreak` - POST /tariffs/{id}/breaks
- `DeleteBreak` - DELETE /tariffs/{id}/breaks/{breakId}

---

## 2. OpenAPI Specification

### 2.1 Tariff Schemas

**Location**: `/home/tolga/projects/terp/api/schemas/tariffs.yaml`

```yaml
Tariff:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "TARIFF-001"
    name:
      type: string
      example: "Standard Tariff"
    description:
      type: string
      x-nullable: true
    week_plan_id:
      type: string
      format: uuid
      x-nullable: true
    valid_from:
      type: string
      format: date
      x-nullable: true
    valid_to:
      type: string
      format: date
      x-nullable: true
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time
    week_plan:
      allOf:
        - $ref: './week-plans.yaml#/WeekPlanSummary'
      x-nullable: true
    breaks:
      type: array
      items:
        $ref: '#/TariffBreak'

TariffBreak:
  type: object
  required:
    - id
    - tariff_id
    - break_type
    - duration
  properties:
    id:
      type: string
      format: uuid
    tariff_id:
      type: string
      format: uuid
    break_type:
      type: string
      enum:
        - fixed
        - variable
        - minimum
    after_work_minutes:
      type: integer
      description: Deduct break after this much work time
    duration:
      type: integer
      description: Break duration in minutes
    is_paid:
      type: boolean
    sort_order:
      type: integer

CreateTariffRequest:
  type: object
  required:
    - code
    - name
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 20
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    week_plan_id:
      type: string
      format: uuid
    valid_from:
      type: string
      format: date
    valid_to:
      type: string
      format: date

UpdateTariffRequest:
  type: object
  properties:
    name:
      type: string
    description:
      type: string
    week_plan_id:
      type: string
      format: uuid
    valid_from:
      type: string
      format: date
    valid_to:
      type: string
      format: date
    is_active:
      type: boolean

CreateTariffBreakRequest:
  type: object
  required:
    - break_type
    - duration
  properties:
    break_type:
      type: string
      enum:
        - fixed
        - variable
        - minimum
    after_work_minutes:
      type: integer
    duration:
      type: integer
    is_paid:
      type: boolean
      default: false
```

### 2.2 Tariff Endpoints

**Location**: `/home/tolga/projects/terp/api/paths/tariffs.yaml`

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| GET | /tariffs | listTariffs | List tariffs with optional `?active=true` filter |
| POST | /tariffs | createTariff | Create new tariff |
| GET | /tariffs/{id} | getTariff | Get tariff with breaks |
| PUT | /tariffs/{id} | updateTariff | Update tariff |
| DELETE | /tariffs/{id} | deleteTariff | Delete tariff |
| POST | /tariffs/{id}/breaks | createTariffBreak | Add break to tariff |
| DELETE | /tariffs/{id}/breaks/{breakId} | deleteTariffBreak | Delete break from tariff |

### 2.3 Week Plan Schemas

**Location**: `/home/tolga/projects/terp/api/schemas/week-plans.yaml`

```yaml
WeekPlan:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    description:
      type: string
      x-nullable: true
    monday_day_plan_id:
      type: string
      format: uuid
      x-nullable: true
    # ... day plan IDs for each day of week
    is_active:
      type: boolean
    # Expanded relations
    monday_day_plan:
      allOf:
        - $ref: './day-plans.yaml#/DayPlanSummary'
      x-nullable: true
    # ... day plan objects for each day

WeekPlanSummary:
  type: object
  required:
    - id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
```

### 2.4 Week Plan Endpoints

**Location**: `/home/tolga/projects/terp/api/paths/week-plans.yaml`

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| GET | /week-plans | listWeekPlans | List week plans with optional `?active=true` filter |
| POST | /week-plans | createWeekPlan | Create new week plan |
| GET | /week-plans/{id} | getWeekPlan | Get week plan by ID |
| PUT | /week-plans/{id} | updateWeekPlan | Update week plan |
| DELETE | /week-plans/{id} | deleteWeekPlan | Delete week plan |

---

## 3. Frontend Patterns

### 3.1 Admin Page Structure

**Reference**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx`

Pattern:
```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/entity/data-table'
import { FormSheet } from '@/components/entity/form-sheet'
import { DetailSheet } from '@/components/entity/detail-sheet'
import { useEntities, useDeleteEntity } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Entity = components['schemas']['Entity']

export default function EntityPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [editEntity, setEditEntity] = useState<Entity | null>(null)

  const { data, isLoading, refetch } = useEntities()
  const deleteMutation = useDeleteEntity()

  const handleDelete = async (entity: Entity) => {
    // Show confirm dialog
    await deleteMutation.mutateAsync({ path: { id: entity.id } })
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entities</h1>
          <p className="text-sm text-muted-foreground">Manage entities</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Entity
        </Button>
      </div>

      <DataTable
        data={data?.data ?? []}
        isLoading={isLoading}
        onRowClick={setSelectedEntity}
        onEdit={setEditEntity}
        onDelete={handleDelete}
      />

      <FormSheet
        open={showCreateForm || !!editEntity}
        onOpenChange={(open) => { ... }}
        entity={editEntity}
        onSuccess={() => { refetch(); close(); }}
      />

      <DetailSheet
        open={!!selectedEntity}
        onOpenChange={(open) => !open && setSelectedEntity(null)}
        entity={selectedEntity}
      />
    </div>
  )
}
```

### 3.2 Data Table Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-data-table.tsx`

Features:
- Column definitions with sorting
- Status badge (active/inactive)
- Row click for detail view
- Actions dropdown (Edit, Copy, Delete)
- Delete confirmation dialog
- Search/filter capability

### 3.3 Form Sheet Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-form-sheet.tsx`

Pattern:
```tsx
interface FormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: Entity | null  // null = create mode
  onSuccess?: () => void
}

function FormSheet({ open, onOpenChange, entity, onSuccess }: FormSheetProps) {
  const isEdit = !!entity
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateEntity()
  const updateMutation = useUpdateEntity()

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setError(null)
      if (entity) {
        setForm({ ...entity })
      } else {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, entity])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Validation
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ path: { id: entity.id }, body: {...} })
      } else {
        await createMutation.mutateAsync({ body: {...} })
      }
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit' : 'Create'} Entity</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <form onSubmit={handleSubmit}>
            {/* Form fields */}
          </form>
        </ScrollArea>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### 3.4 Reference Selector Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/teams/team-form-sheet.tsx`

```tsx
// Fetch reference data when sheet opens
const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({ enabled: open })
const departments = departmentsData?.data ?? []

// Select component with "None" option
<Select
  value={form.weekPlanId || '__none__'}
  onValueChange={(value) => setForm({
    ...form,
    weekPlanId: value === '__none__' ? '' : value
  })}
  disabled={isSubmitting || loadingDepartments}
>
  <SelectTrigger>
    <SelectValue placeholder="Select week plan" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="__none__">None</SelectItem>
    {weekPlans.map((wp) => (
      <SelectItem key={wp.id} value={wp.id}>
        {wp.code} - {wp.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 3.5 API Hook Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts`

```tsx
import { useApiQuery } from '@/hooks/use-api-query'
import { useApiMutation } from '@/hooks/use-api-mutation'

// List hook
export function useDayPlans(params?: { active?: boolean }) {
  return useApiQuery('/day-plans', { params })
}

// Get single entity hook
export function useDayPlan(id: string, enabled = true) {
  return useApiQuery('/day-plans/{id}', {
    path: { id },
    enabled: !!id && enabled,
  })
}

// Create mutation
export function useCreateDayPlan() {
  return useApiMutation('/day-plans', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

// Update mutation
export function useUpdateDayPlan() {
  return useApiMutation('/day-plans/{id}', 'put', {
    invalidateKeys: [['/day-plans']],
  })
}

// Delete mutation
export function useDeleteDayPlan() {
  return useApiMutation('/day-plans/{id}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}

// Break operations
export function useCreateDayPlanBreak() {
  return useApiMutation('/day-plans/{id}/breaks', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

export function useDeleteDayPlanBreak() {
  return useApiMutation('/day-plans/{id}/breaks/{breakId}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}
```

### 3.6 Copy Dialog Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`

Uses Dialog component for copy functionality:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Copy Tariff</DialogTitle>
      <DialogDescription>Create a copy with a new code</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">New Code *</Label>
        <Input id="code" value={newCode} onChange={...} />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button onClick={handleCopy} disabled={isPending}>Copy</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 3.7 Date Range Picker Component

**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/date-range-picker.tsx`

Existing component for date range selection. Can be adapted for individual date fields using the Calendar component directly.

### 3.8 Time Utilities

**Location**: `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

Key functions:
- `formatMinutes(minutes)` - Format minutes to HH:MM
- `formatDuration(minutes)` - Format to "8h 30m"
- `formatDate(date)` - Format as YYYY-MM-DD
- `parseISODate(dateString)` - Parse ISO date string

---

## 4. UI Components Available

**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/`

| Component | File | Usage |
|-----------|------|-------|
| Button | button.tsx | Actions, submit |
| Input | input.tsx | Text fields |
| Label | label.tsx | Form labels |
| Select | select.tsx | Dropdowns |
| Sheet | sheet.tsx | Side panels |
| Dialog | dialog.tsx | Modal dialogs |
| Table | table.tsx | Data display |
| Badge | badge.tsx | Status indicators |
| Switch | switch.tsx | Boolean toggles |
| Checkbox | checkbox.tsx | Multi-select |
| Tabs | tabs.tsx | Tabbed content |
| Card | card.tsx | Content containers |
| Alert | alert.tsx | Error messages |
| ScrollArea | scroll-area.tsx | Scrollable content |
| DateRangePicker | date-range-picker.tsx | Date selection |
| DurationInput | duration-input.tsx | Duration fields |
| TimeInput | time-input.tsx | Time fields |
| ConfirmDialog | confirm-dialog.tsx | Delete confirmation |

---

## 5. Existing API Hooks

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Currently exported hooks (relevant to tariffs):
- `useDayPlans`, `useDayPlan`, `useCreateDayPlan`, `useUpdateDayPlan`, `useDeleteDayPlan`
- `useCreateDayPlanBreak`, `useDeleteDayPlanBreak`
- `useTeams`, `useTeam`, `useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`
- `useDepartments`, `useDepartment`, `useCreateDepartment`, `useUpdateDepartment`, `useDeleteDepartment`

Note: No tariff or week plan hooks exist yet - need to be created.

---

## 6. TypeScript Types

**Location**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` (generated)

Access via:
```tsx
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']
type TariffBreak = components['schemas']['TariffBreak']
type CreateTariffRequest = components['schemas']['CreateTariffRequest']
type UpdateTariffRequest = components['schemas']['UpdateTariffRequest']
type WeekPlan = components['schemas']['WeekPlan']
type WeekPlanSummary = components['schemas']['WeekPlanSummary']
```

---

## 7. Key Files Summary

### Backend Files
| File | Path |
|------|------|
| Tariff Model | `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` |
| Tariff Repository | `/home/tolga/projects/terp/apps/api/internal/repository/tariff.go` |
| Tariff Service | `/home/tolga/projects/terp/apps/api/internal/service/tariff.go` |
| Tariff Handler | `/home/tolga/projects/terp/apps/api/internal/handler/tariff.go` |
| WeekPlan Model | `/home/tolga/projects/terp/apps/api/internal/model/weekplan.go` |
| WeekPlan Handler | `/home/tolga/projects/terp/apps/api/internal/handler/weekplan.go` |

### OpenAPI Specs
| File | Path |
|------|------|
| Tariff Schemas | `/home/tolga/projects/terp/api/schemas/tariffs.yaml` |
| Tariff Paths | `/home/tolga/projects/terp/api/paths/tariffs.yaml` |
| WeekPlan Schemas | `/home/tolga/projects/terp/api/schemas/week-plans.yaml` |
| WeekPlan Paths | `/home/tolga/projects/terp/api/paths/week-plans.yaml` |

### Frontend References
| Component | Path |
|-----------|------|
| Day Plans Page | `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx` |
| Day Plan Data Table | `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-data-table.tsx` |
| Day Plan Form Sheet | `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-form-sheet.tsx` |
| Day Plan Detail Sheet | `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-detail-sheet.tsx` |
| Copy Day Plan Dialog | `/home/tolga/projects/terp/apps/web/src/components/day-plans/copy-day-plan-dialog.tsx` |
| Day Plans Hooks | `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts` |
| Team Form Sheet | `/home/tolga/projects/terp/apps/web/src/components/teams/team-form-sheet.tsx` |
| Teams Page | `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/teams/page.tsx` |
| Base API Query Hook | `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts` |
| Base API Mutation Hook | `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts` |
| Time Utilities | `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts` |

---

## 8. Implementation Notes

### 8.1 API Hooks to Create
- `useTariffs(params?: { active?: boolean })` - List tariffs
- `useTariff(id: string, enabled?: boolean)` - Get single tariff
- `useCreateTariff()` - Create tariff
- `useUpdateTariff()` - Update tariff
- `useDeleteTariff()` - Delete tariff
- `useCreateTariffBreak()` - Add break to tariff
- `useDeleteTariffBreak()` - Remove break from tariff
- `useWeekPlans(params?: { active?: boolean })` - List week plans (for selector)

### 8.2 Components to Create
- `apps/web/src/app/(dashboard)/admin/tariffs/page.tsx` - Main page
- `apps/web/src/components/tariffs/tariff-data-table.tsx` - List view
- `apps/web/src/components/tariffs/tariff-form-sheet.tsx` - Create/Edit form
- `apps/web/src/components/tariffs/tariff-detail-sheet.tsx` - Detail view
- `apps/web/src/components/tariffs/tariff-break-table.tsx` - Break management
- `apps/web/src/components/tariffs/copy-tariff-dialog.tsx` - Copy functionality
- `apps/web/src/components/tariffs/index.ts` - Exports

### 8.3 Form State Structure
```tsx
interface FormState {
  code: string
  name: string
  description: string
  weekPlanId: string  // empty string for none
  validFrom: string   // YYYY-MM-DD or empty
  validTo: string     // YYYY-MM-DD or empty
  isActive: boolean
}
```

### 8.4 Break Management Pattern
Breaks are managed separately from the main tariff form:
1. Create tariff first
2. Add/remove breaks via detail sheet
3. Use inline table with Add button and Delete action
4. Break form: type selector, duration input, after_work_minutes (for minimum type), is_paid toggle

### 8.5 Validation Rules
- Code: Required, max 20 chars, unique
- Name: Required, max 255 chars
- Valid dates: To must be after From (if both set)
- Break duration: Must be positive
- Break type: Must be one of: fixed, variable, minimum

---

*Research completed: 2026-01-26*
