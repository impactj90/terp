# Implementation Plan: NOK-229 Week Plan Management

> **Date**: 2026-01-26
> **Ticket**: NOK-229
> **Status**: Ready for Implementation

---

## Overview

Build a week plan management UI for administrators to create, edit, and manage week plans that assign day plans to each day of the week. Week plans are assigned to employees to define their regular schedules.

## Prerequisites

- Backend API is fully implemented (CRUD endpoints for week plans)
- OpenAPI spec is complete with WeekPlan, CreateWeekPlanRequest, UpdateWeekPlanRequest schemas
- Day plans API hooks already exist (`useDayPlans`, `useDayPlan`)
- Generated TypeScript types available via `@/lib/api/types`

---

## Phase 1: API Client Hooks

**Goal**: Create React Query hooks for week plan CRUD operations.

### Files to Create

#### 1.1 Create `/apps/web/src/hooks/api/use-week-plans.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseWeekPlansOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of week plans with optional filters.
 */
export function useWeekPlans(options: UseWeekPlansOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/week-plans', {
    params: { active },
    enabled,
  })
}

/**
 * Hook to fetch a single week plan by ID with day plan relations.
 */
export function useWeekPlan(id: string, enabled = true) {
  return useApiQuery('/week-plans/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new week plan.
 */
export function useCreateWeekPlan() {
  return useApiMutation('/week-plans', 'post', {
    invalidateKeys: [['/week-plans']],
  })
}

/**
 * Hook to update an existing week plan.
 */
export function useUpdateWeekPlan() {
  return useApiMutation('/week-plans/{id}', 'put', {
    invalidateKeys: [['/week-plans']],
  })
}

/**
 * Hook to delete a week plan.
 */
export function useDeleteWeekPlan() {
  return useApiMutation('/week-plans/{id}', 'delete', {
    invalidateKeys: [['/week-plans']],
  })
}
```

#### 1.2 Update `/apps/web/src/hooks/api/index.ts`

Add exports for week plan hooks:

```typescript
// Week Plans
export {
  useWeekPlans,
  useWeekPlan,
  useCreateWeekPlan,
  useUpdateWeekPlan,
  useDeleteWeekPlan,
} from './use-week-plans'
```

### Verification

1. Import hooks in a test component and verify TypeScript types resolve correctly
2. Check that query keys match expected patterns
3. Verify mutation invalidation keys are correct

---

## Phase 2: Week Plans List Page

**Goal**: Create the main admin page for managing week plans.

### Files to Create

#### 2.1 Create `/apps/web/src/app/(dashboard)/admin/week-plans/page.tsx`

Follow the day-plans page pattern:

**Structure**:
```tsx
export default function WeekPlansPage() {
  // Auth check
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [editWeekPlan, setEditWeekPlan] = useState<WeekPlan | null>(null)
  const [viewWeekPlan, setViewWeekPlan] = useState<WeekPlan | null>(null)
  const [deleteWeekPlan, setDeleteWeekPlan] = useState<WeekPlan | null>(null)
  const [copyWeekPlan, setCopyWeekPlan] = useState<WeekPlan | null>(null)

  // Data fetching
  const { data, isLoading, isFetching } = useWeekPlans({
    active: activeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteWeekPlan()

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // Filter logic
  const weekPlans = useMemo(() => {
    let plans = data?.data ?? []
    if (search) {
      const searchLower = search.toLowerCase()
      plans = plans.filter(
        (p) =>
          p.code.toLowerCase().includes(searchLower) ||
          p.name.toLowerCase().includes(searchLower)
      )
    }
    return plans
  }, [data?.data, search])

  // Event handlers...

  return (
    <div className="space-y-6">
      {/* Page header with title + "New Week Plan" button */}
      {/* Filter bar: search + active filter + clear button */}
      {/* Card with WeekPlanDataTable or EmptyState */}
      {/* WeekPlanFormSheet for create/edit */}
      {/* WeekPlanDetailSheet for view */}
      {/* CopyWeekPlanDialog */}
      {/* ConfirmDialog for delete */}
    </div>
  )
}
```

**Key Components**:
- Page header: Title "Week Plans", subtitle "Manage week plan templates for employee schedules"
- Filter bar: SearchInput, Active status Select (All/Active/Inactive), Clear filters button
- Empty state with CalendarDays icon
- Loading skeleton matching page structure

### Verification

1. Page renders without errors
2. Auth check redirects non-admins
3. Filter bar controls work correctly
4. Loading states display properly

---

## Phase 3: Data Table Component

**Goal**: Create the week plans data table with visual day-to-plan grid.

### Files to Create

#### 3.1 Create `/apps/web/src/components/week-plans/week-plan-data-table.tsx`

**Props Interface**:
```tsx
interface WeekPlanDataTableProps {
  weekPlans: WeekPlan[]
  isLoading: boolean
  onView: (weekPlan: WeekPlan) => void
  onEdit: (weekPlan: WeekPlan) => void
  onDelete: (weekPlan: WeekPlan) => void
  onCopy: (weekPlan: WeekPlan) => void
}
```

**Table Columns**:
| Column | Width | Content |
|--------|-------|---------|
| Code | w-24 | `font-mono text-sm` |
| Name | flex | `font-medium` |
| Mon | w-16 | Day plan code badge or "-" |
| Tue | w-16 | Day plan code badge or "-" |
| Wed | w-16 | Day plan code badge or "-" |
| Thu | w-16 | Day plan code badge or "-" |
| Fri | w-16 | Day plan code badge or "-" |
| Sat | w-16 | Day plan code badge or "-" (muted for weekends) |
| Sun | w-16 | Day plan code badge or "-" (muted for weekends) |
| Work Days | w-20 | Count of assigned days (e.g., "5 days") |
| Status | w-20 | Active/Inactive badge |
| Actions | w-16 | DropdownMenu (View, Edit, Copy, Delete) |

**Day Plan Display Logic**:
```tsx
function DayPlanCell({ dayPlan, isWeekend }: { dayPlan: DayPlanSummary | null, isWeekend: boolean }) {
  if (!dayPlan) {
    return <span className={cn("text-muted-foreground", isWeekend && "opacity-50")}>-</span>
  }
  return (
    <Badge
      variant="outline"
      className={cn("text-xs truncate max-w-full", isWeekend && "opacity-75")}
      title={`${dayPlan.code}: ${dayPlan.name}`}
    >
      {dayPlan.code}
    </Badge>
  )
}
```

**Work Days Calculation** (helper function):
```tsx
function countWorkDays(weekPlan: WeekPlan): number {
  const days = [
    weekPlan.monday_day_plan_id,
    weekPlan.tuesday_day_plan_id,
    weekPlan.wednesday_day_plan_id,
    weekPlan.thursday_day_plan_id,
    weekPlan.friday_day_plan_id,
    weekPlan.saturday_day_plan_id,
    weekPlan.sunday_day_plan_id,
  ]
  return days.filter(Boolean).length
}
```

**Row Click**: Opens detail sheet
**Action Menu**: View Details, Edit, Copy, Delete (destructive)

### Verification

1. Table renders all week plans correctly
2. Day plan badges display with truncation
3. Work days count is accurate
4. Row click opens detail view
5. Action menu items work correctly

---

## Phase 4: Week Plan Form Sheet

**Goal**: Create form for creating and editing week plans with weekday-to-day-plan assignment grid.

### Files to Create

#### 4.1 Create `/apps/web/src/components/week-plans/week-plan-form-sheet.tsx`

**Props Interface**:
```tsx
interface WeekPlanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekPlan?: WeekPlan | null  // null = create, defined = edit
  onSuccess?: () => void
}
```

**Form State**:
```tsx
interface FormState {
  code: string
  name: string
  description: string
  mondayDayPlanId: string | null
  tuesdayDayPlanId: string | null
  wednesdayDayPlanId: string | null
  thursdayDayPlanId: string | null
  fridayDayPlanId: string | null
  saturdayDayPlanId: string | null
  sundayDayPlanId: string | null
  isActive: boolean
}
```

**Form Layout** (no tabs needed - simpler than day plans):

```
Basic Information
├── Code (Input, disabled on edit) *
├── Name (Input) *
└── Description (Input, optional)

Week Schedule
├── Visual grid showing Mon-Sun
├── Each day has a Select dropdown with day plans
├── "Off Day" option (null value)
└── Show selected day plan name + type badge

Weekly Summary
├── Total work days: X
├── Total target hours: Xh (calculated from day plans)
└── Active checkbox

Footer
├── Cancel button
└── Create/Save button
```

**Day Plan Selector Component** (inline):
```tsx
function DayPlanSelector({
  day,
  value,
  onChange,
  dayPlans,
  isWeekend
}: {
  day: string
  value: string | null
  onChange: (id: string | null) => void
  dayPlans: DayPlanSummary[]
  isWeekend: boolean
}) {
  return (
    <div className={cn("p-3 border rounded-lg", isWeekend && "bg-muted/30")}>
      <Label className="text-sm font-medium">{day}</Label>
      <Select value={value ?? 'off'} onValueChange={(v) => onChange(v === 'off' ? null : v)}>
        <SelectTrigger className="mt-1.5">
          <SelectValue placeholder="Select day plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="off">
            <span className="text-muted-foreground">Off Day</span>
          </SelectItem>
          <SelectSeparator />
          {dayPlans.map((dp) => (
            <SelectItem key={dp.id} value={dp.id}>
              <span className="font-mono text-xs mr-2">{dp.code}</span>
              <span>{dp.name}</span>
              <Badge variant="outline" className="ml-2 text-xs">
                {dp.plan_type === 'fixed' ? 'Fixed' : 'Flex'}
              </Badge>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Show selected plan details */}
      {value && (
        <p className="text-xs text-muted-foreground mt-1">
          {dayPlans.find(d => d.id === value)?.name}
        </p>
      )}
    </div>
  )
}
```

**Weekly Summary Calculation**:
```tsx
const summary = useMemo(() => {
  const dayPlanIds = [
    form.mondayDayPlanId,
    form.tuesdayDayPlanId,
    form.wednesdayDayPlanId,
    form.thursdayDayPlanId,
    form.fridayDayPlanId,
    form.saturdayDayPlanId,
    form.sundayDayPlanId,
  ]
  const workDays = dayPlanIds.filter(Boolean).length

  // Calculate total hours from fetched day plans (if available)
  // Note: Need full day plan data with regular_hours
  let totalMinutes = 0
  dayPlanIds.forEach((id) => {
    if (id) {
      const dp = fullDayPlans?.find(d => d.id === id)
      if (dp) totalMinutes += dp.regular_hours
    }
  })

  return { workDays, totalMinutes }
}, [form, fullDayPlans])
```

**Data Fetching**:
- Fetch active day plans for dropdown: `useDayPlans({ active: true })`
- Fetch full week plan details when editing: `useWeekPlan(weekPlan?.id, open && isEdit)`

**Validation**:
```tsx
function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push('Code is required')
  if (!form.name.trim()) errors.push('Name is required')
  // Note: Day plans are optional (off days allowed)
  return errors
}
```

**Submit Handler**:
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)

  const errors = validateForm(form, isEdit)
  if (errors.length > 0) {
    setError(errors.join('. '))
    return
  }

  try {
    const body = {
      code: form.code, // Only on create
      name: form.name,
      description: form.description || undefined,
      monday_day_plan_id: form.mondayDayPlanId || undefined,
      tuesday_day_plan_id: form.tuesdayDayPlanId || undefined,
      wednesday_day_plan_id: form.wednesdayDayPlanId || undefined,
      thursday_day_plan_id: form.thursdayDayPlanId || undefined,
      friday_day_plan_id: form.fridayDayPlanId || undefined,
      saturday_day_plan_id: form.saturdayDayPlanId || undefined,
      sunday_day_plan_id: form.sundayDayPlanId || undefined,
      is_active: form.isActive,
    }

    if (isEdit && weekPlan) {
      await updateMutation.mutateAsync({
        path: { id: weekPlan.id },
        body: body as UpdateWeekPlanRequest,
      })
    } else {
      await createMutation.mutateAsync({
        body: body as CreateWeekPlanRequest,
      })
    }
    onSuccess?.()
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An error occurred')
  }
}
```

### Verification

1. Form opens correctly for create and edit modes
2. Day plan dropdowns populate with active day plans
3. Off day selection works (null value)
4. Weekly summary updates dynamically
5. Validation errors display correctly
6. Create/update mutations work correctly
7. Form closes on success

---

## Phase 5: Detail Sheet

**Goal**: Create detail view for week plans with visual week overview.

### Files to Create

#### 5.1 Create `/apps/web/src/components/week-plans/week-plan-detail-sheet.tsx`

**Props Interface**:
```tsx
interface WeekPlanDetailSheetProps {
  weekPlanId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (weekPlan: WeekPlan) => void
  onDelete: (weekPlan: WeekPlan) => void
  onCopy: (weekPlan: WeekPlan) => void
}
```

**Layout Structure**:
```
Header
├── Name with Active/Inactive badge
└── Code

Visual Week Grid (main feature)
├── 7-column grid (Mon-Sun)
├── Each day shows:
│   ├── Day name
│   ├── Day plan code badge (or "Off")
│   ├── Day plan name
│   └── Plan type + target hours
└── Weekend days slightly muted

Summary Section
├── Work Days: 5/7
├── Total Weekly Hours: 40h
└── Description (if exists)

Footer Actions
├── Edit button
├── Copy button
└── Delete button (destructive)
```

**Visual Week Grid Component**:
```tsx
const DAYS = [
  { key: 'monday', label: 'Mon', full: 'Monday' },
  { key: 'tuesday', label: 'Tue', full: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', full: 'Wednesday' },
  { key: 'thursday', label: 'Thu', full: 'Thursday' },
  { key: 'friday', label: 'Fri', full: 'Friday' },
  { key: 'saturday', label: 'Sat', full: 'Saturday', weekend: true },
  { key: 'sunday', label: 'Sun', full: 'Sunday', weekend: true },
]

function WeekGrid({ weekPlan }: { weekPlan: WeekPlan }) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {DAYS.map((day) => {
        const dayPlan = weekPlan[`${day.key}_day_plan` as keyof WeekPlan] as DayPlanSummary | null
        return (
          <DayCard
            key={day.key}
            day={day}
            dayPlan={dayPlan}
          />
        )
      })}
    </div>
  )
}

function DayCard({ day, dayPlan }: { day: typeof DAYS[0], dayPlan: DayPlanSummary | null }) {
  return (
    <div className={cn(
      "p-2 border rounded-lg text-center",
      day.weekend && "bg-muted/30",
      !dayPlan && "opacity-60"
    )}>
      <div className="text-xs font-medium text-muted-foreground">{day.label}</div>
      {dayPlan ? (
        <>
          <Badge variant="outline" className="mt-1 text-xs">{dayPlan.code}</Badge>
          <div className="text-xs mt-1 truncate" title={dayPlan.name}>
            {dayPlan.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {dayPlan.plan_type === 'fixed' ? 'Fixed' : 'Flex'}
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground mt-2">Off</div>
      )}
    </div>
  )
}
```

**Total Hours Calculation**:
Note: The current API returns DayPlanSummary which includes `id`, `code`, `name`, `plan_type` but NOT `regular_hours`. Two options:

1. **Option A**: Update backend to include `regular_hours` in DayPlanSummary (preferred)
2. **Option B**: Display only work days count (simpler, no backend change)

For now, implement Option B and add a TODO for Option A if needed.

### Verification

1. Detail sheet opens with week plan data
2. Visual week grid displays correctly
3. Off days shown with muted styling
4. Weekend days visually differentiated
5. Edit/Copy/Delete buttons work correctly

---

## Phase 6: Copy Week Plan Dialog

**Goal**: Allow creating a copy of an existing week plan.

### Files to Create

#### 6.1 Create `/apps/web/src/components/week-plans/copy-week-plan-dialog.tsx`

**Note**: The backend does NOT have a `/week-plans/{id}/copy` endpoint. We'll implement client-side copy:

1. Read the source week plan
2. Create a new week plan with same day assignments but new code/name

**Implementation**:
```tsx
interface CopyWeekPlanDialogProps {
  weekPlan: WeekPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyWeekPlanDialog({ weekPlan, open, onOpenChange }: CopyWeekPlanDialogProps) {
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateWeekPlan()

  useEffect(() => {
    if (open && weekPlan) {
      setNewCode(`${weekPlan.code}-COPY`)
      setNewName(`${weekPlan.name} (Copy)`)
      setError(null)
    }
  }, [open, weekPlan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!weekPlan) return

    // Validation
    if (!newCode.trim()) { setError('Code is required'); return }
    if (!newName.trim()) { setError('Name is required'); return }

    try {
      await createMutation.mutateAsync({
        body: {
          code: newCode.trim(),
          name: newName.trim(),
          description: weekPlan.description ?? undefined,
          monday_day_plan_id: weekPlan.monday_day_plan_id ?? undefined,
          tuesday_day_plan_id: weekPlan.tuesday_day_plan_id ?? undefined,
          wednesday_day_plan_id: weekPlan.wednesday_day_plan_id ?? undefined,
          thursday_day_plan_id: weekPlan.thursday_day_plan_id ?? undefined,
          friday_day_plan_id: weekPlan.friday_day_plan_id ?? undefined,
          saturday_day_plan_id: weekPlan.saturday_day_plan_id ?? undefined,
          sunday_day_plan_id: weekPlan.sunday_day_plan_id ?? undefined,
        },
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy week plan')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Same pattern as CopyDayPlanDialog */}
    </Dialog>
  )
}
```

### Verification

1. Dialog opens with pre-filled code and name
2. Validation works correctly
3. Copy creates new week plan with same day assignments
4. Dialog closes on success

---

## Phase 7: Component Index and Integration

**Goal**: Create barrel export and integrate all components.

### Files to Create

#### 7.1 Create `/apps/web/src/components/week-plans/index.ts`

```typescript
export { WeekPlanDataTable } from './week-plan-data-table'
export { WeekPlanFormSheet } from './week-plan-form-sheet'
export { WeekPlanDetailSheet } from './week-plan-detail-sheet'
export { CopyWeekPlanDialog } from './copy-week-plan-dialog'
```

### Verification

1. All components export correctly
2. Page imports work without errors

---

## Phase 8: Testing and Polish

**Goal**: Test all functionality and add polish.

### Testing Checklist

#### 8.1 CRUD Operations
- [ ] Create new week plan with all days assigned
- [ ] Create week plan with some off days
- [ ] Edit week plan name and description
- [ ] Change day plan assignments
- [ ] Delete week plan
- [ ] Copy week plan

#### 8.2 UI/UX
- [ ] Loading states display correctly
- [ ] Empty state displays when no week plans
- [ ] Error messages display correctly
- [ ] Filter by active status works
- [ ] Search by code/name works
- [ ] Visual week grid is readable
- [ ] Weekend days are visually differentiated

#### 8.3 Edge Cases
- [ ] Handle API errors gracefully
- [ ] Handle duplicate code error on create
- [ ] Handle concurrent modifications
- [ ] Test with many week plans (pagination not needed - list is small)

### Polish Items
- [ ] Add keyboard navigation in table
- [ ] Add tooltips for truncated text
- [ ] Ensure responsive design on mobile
- [ ] Add aria labels for accessibility

---

## File Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/hooks/api/use-week-plans.ts` | API hooks for week plans |
| `apps/web/src/app/(dashboard)/admin/week-plans/page.tsx` | Admin page |
| `apps/web/src/components/week-plans/week-plan-data-table.tsx` | Data table |
| `apps/web/src/components/week-plans/week-plan-form-sheet.tsx` | Create/edit form |
| `apps/web/src/components/week-plans/week-plan-detail-sheet.tsx` | Detail view |
| `apps/web/src/components/week-plans/copy-week-plan-dialog.tsx` | Copy dialog |
| `apps/web/src/components/week-plans/index.ts` | Barrel export |

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/hooks/api/index.ts` | Add week plan hook exports |

---

## Dependencies

- `@/components/ui/*` - Shadcn UI components (already exist)
- `@/lib/time-utils` - Time formatting utilities (already exist)
- `useDayPlans` hook - For day plan dropdown options (already exists)

---

## Implementation Order

1. Phase 1: API hooks (foundation)
2. Phase 2: Page skeleton with loading states
3. Phase 3: Data table (view functionality)
4. Phase 4: Form sheet (create/edit)
5. Phase 5: Detail sheet (view details)
6. Phase 6: Copy dialog
7. Phase 7: Component exports
8. Phase 8: Testing and polish

---

## Success Criteria

1. Admin can view list of week plans with day assignment grid
2. Admin can create new week plan with day-to-plan assignments
3. Admin can edit existing week plans
4. Admin can copy week plans with new code/name
5. Admin can delete week plans
6. Visual week overview shows schedule at a glance
7. Work days count displays correctly
8. Filter and search work as expected
