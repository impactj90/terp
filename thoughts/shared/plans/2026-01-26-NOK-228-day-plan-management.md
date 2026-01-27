# NOK-228: Day Plan Management Implementation Plan

## Overview

Implement a comprehensive day plan management interface in the frontend for creating, editing, and viewing day plans (Tagespläne). Day plans define the daily working time specifications including time windows, breaks, tolerances, rounding rules, and bonus/surcharge configurations. This is a complex admin feature following the ZMI Time reference manual.

## Current State Analysis

### Backend (Fully Implemented)
- **Model**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` - Complete with all ZMI fields
- **Handler**: `/home/tolga/projects/terp/apps/api/internal/handler/dayplan.go` - All CRUD operations
- **API Endpoints**: Full REST API with breaks/bonuses sub-resources

### API Schema Gap
The OpenAPI schema (`api/schemas/day-plans.yaml`) is missing several model fields:
- `regular_hours_2` - Alternative target for absence days
- `from_employee_master` - Get target from employee master
- `variable_work_time` - Enable tolerance_come_minus for FAZ
- `round_all_bookings` - Round all vs first/last only
- `rounding_come_add_value`, `rounding_go_add_value` - Add/subtract values
- `holiday_credit_cat1/2/3` - Holiday time credits
- `vacation_deduction` - Vacation days deducted
- `no_booking_behavior` - Days without bookings handling
- `day_change_behavior` - Cross-midnight handling
- `shift_detect_*` - Shift detection windows
- `shift_alt_plan_1-6` - Alternative day plans
- `minutes_difference` (breaks) - Proportional deduction near threshold

### Frontend (To Be Created)
- No day plan management pages exist
- No day plan hooks exist
- No accounts hook exists (needed for bonuses)

## Desired End State

A complete day plan management interface where administrators can:
1. View all day plans in a filterable, sortable table
2. Create new day plans with all configuration sections
3. Edit existing day plans
4. Copy day plans with new code/name
5. Manage breaks (fixed, variable, minimum) with inline editing
6. Manage bonuses/surcharges with account selection
7. Configure shift detection settings
8. Preview/visualize day plan time windows

### Verification
- List page loads day plans with filtering by status and type
- Create/edit form saves all fields correctly
- Breaks can be added/removed with correct types
- Bonuses can be added/removed with account selection
- Copy functionality creates proper duplicate
- All TypeScript types are properly generated

## What We're NOT Doing

- Week plan management (separate ticket)
- Employee assignment to day plans
- Actual time calculation preview
- Drag-and-drop reordering of breaks/bonuses
- Import/export functionality
- Localization (German labels) - English only for now

## Implementation Approach

1. **API Schema Update First** - Update OpenAPI spec to include all model fields
2. **Hooks Layer** - Create typed API hooks following existing patterns
3. **Base Components** - Time picker component for minutes-from-midnight input
4. **List Page** - Admin management page with filtering
5. **Form Sheet** - Multi-section form with collapsible sections
6. **Sub-forms** - Break and bonus management components
7. **Detail View** - Read-only detail sheet

---

## Phase 1: Update API Schema

### Overview
Add missing fields to the OpenAPI specification so TypeScript types are generated correctly.

### Changes Required:

#### 1. Update Day Plan Schema
**File**: `/home/tolga/projects/terp/api/schemas/day-plans.yaml`
**Changes**: Add missing properties to DayPlan, CreateDayPlanRequest, and UpdateDayPlanRequest schemas

```yaml
# Add to DayPlan properties (after existing fields):
    regular_hours_2:
      type: integer
      description: Alternative target hours for absence days (minutes)
      x-nullable: true
    from_employee_master:
      type: boolean
      description: Get target hours from employee master data
    variable_work_time:
      type: boolean
      description: Enable tolerance_come_minus for fixed working time plans
    round_all_bookings:
      type: boolean
      description: Round all bookings vs first arrival/last departure only
    rounding_come_add_value:
      type: integer
      description: Value to add/subtract for arrival (minutes)
      x-nullable: true
    rounding_go_add_value:
      type: integer
      description: Value to add/subtract for departure (minutes)
      x-nullable: true
    holiday_credit_cat1:
      type: integer
      description: Full holiday time credit (minutes)
      x-nullable: true
    holiday_credit_cat2:
      type: integer
      description: Half holiday time credit (minutes)
      x-nullable: true
    holiday_credit_cat3:
      type: integer
      description: Custom category holiday credit (minutes)
      x-nullable: true
    vacation_deduction:
      type: number
      format: float
      description: Vacation days deducted per day (default 1.0)
    no_booking_behavior:
      type: string
      enum:
        - error
        - deduct_target
        - vocational_school
        - adopt_target
        - target_with_order
      description: Behavior when no bookings recorded
    day_change_behavior:
      type: string
      enum:
        - none
        - at_arrival
        - at_departure
        - auto_complete
      description: How to handle cross-midnight shifts
    shift_detect_arrive_from:
      type: integer
      description: Shift detection arrival window start (minutes)
      x-nullable: true
    shift_detect_arrive_to:
      type: integer
      description: Shift detection arrival window end (minutes)
      x-nullable: true
    shift_detect_depart_from:
      type: integer
      description: Shift detection departure window start (minutes)
      x-nullable: true
    shift_detect_depart_to:
      type: integer
      description: Shift detection departure window end (minutes)
      x-nullable: true
    shift_alt_plan_1:
      type: string
      format: uuid
      x-nullable: true
    shift_alt_plan_2:
      type: string
      format: uuid
      x-nullable: true
    shift_alt_plan_3:
      type: string
      format: uuid
      x-nullable: true
    shift_alt_plan_4:
      type: string
      format: uuid
      x-nullable: true
    shift_alt_plan_5:
      type: string
      format: uuid
      x-nullable: true
    shift_alt_plan_6:
      type: string
      format: uuid
      x-nullable: true
```

```yaml
# Add to DayPlanBreak properties:
    minutes_difference:
      type: boolean
      description: Proportional deduction when near threshold
```

```yaml
# Update rounding type enum in all places to include add/subtract:
    rounding_come_type:
      type: string
      enum:
        - none
        - up
        - down
        - nearest
        - add
        - subtract
```

#### 2. Mirror changes in CreateDayPlanRequest and UpdateDayPlanRequest
Add the same new fields (except id, tenant_id, created_at, updated_at, breaks, bonuses) to both request schemas.

#### 3. Update CreateDayPlanBreakRequest
```yaml
    minutes_difference:
      type: boolean
      default: false
```

### Success Criteria:

#### Automated Verification:
- [ ] API spec bundles without errors: `make swagger-bundle`
- [ ] Go models regenerate successfully: `make generate`
- [ ] Backend tests pass: `cd apps/api && go test ./...`
- [ ] TypeScript types generate correctly: `cd apps/web && pnpm run generate:api`

#### Manual Verification:
- [ ] Verify new fields appear in generated TypeScript types
- [ ] Test API endpoints accept new fields via curl/Postman

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Create API Hooks

### Overview
Create typed API hooks for day plans, day plan breaks, day plan bonuses, and accounts following existing patterns.

### Changes Required:

#### 1. Day Plans Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts`
**Changes**: Create new file with all day plan hooks

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseDayPlansOptions {
  active?: boolean
  planType?: 'fixed' | 'flextime'
  enabled?: boolean
}

/**
 * Hook to fetch list of day plans with optional filters.
 */
export function useDayPlans(options: UseDayPlansOptions = {}) {
  const { active, planType, enabled = true } = options

  return useApiQuery('/day-plans', {
    params: {
      active,
      plan_type: planType,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single day plan by ID with breaks and bonuses.
 */
export function useDayPlan(id: string, enabled = true) {
  return useApiQuery('/day-plans/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new day plan.
 */
export function useCreateDayPlan() {
  return useApiMutation('/day-plans', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to update an existing day plan.
 */
export function useUpdateDayPlan() {
  return useApiMutation('/day-plans/{id}', 'put', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to delete a day plan.
 */
export function useDeleteDayPlan() {
  return useApiMutation('/day-plans/{id}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to copy a day plan.
 */
export function useCopyDayPlan() {
  return useApiMutation('/day-plans/{id}/copy', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to add a break to a day plan.
 */
export function useCreateDayPlanBreak() {
  return useApiMutation('/day-plans/{id}/breaks', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to delete a break from a day plan.
 */
export function useDeleteDayPlanBreak() {
  return useApiMutation('/day-plans/{id}/breaks/{breakId}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to add a bonus to a day plan.
 */
export function useCreateDayPlanBonus() {
  return useApiMutation('/day-plans/{id}/bonuses', 'post', {
    invalidateKeys: [['/day-plans']],
  })
}

/**
 * Hook to delete a bonus from a day plan.
 */
export function useDeleteDayPlanBonus() {
  return useApiMutation('/day-plans/{id}/bonuses/{bonusId}', 'delete', {
    invalidateKeys: [['/day-plans']],
  })
}
```

#### 2. Accounts Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-accounts.ts`
**Changes**: Create new file for accounts (needed for bonus account selection)

```typescript
import { useApiQuery } from '@/hooks'

interface UseAccountsOptions {
  accountType?: 'time' | 'bonus' | 'deduction' | 'vacation' | 'sick'
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of accounts.
 */
export function useAccounts(options: UseAccountsOptions = {}) {
  const { accountType, active, enabled = true } = options

  return useApiQuery('/accounts', {
    params: {
      account_type: accountType,
      active,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single account by ID.
 */
export function useAccount(id: string, enabled = true) {
  return useApiQuery('/accounts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

#### 3. Export from Index
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
**Changes**: Add exports for new hooks

```typescript
// Add at end of file:

// Day Plans
export {
  useDayPlans,
  useDayPlan,
  useCreateDayPlan,
  useUpdateDayPlan,
  useDeleteDayPlan,
  useCopyDayPlan,
  useCreateDayPlanBreak,
  useDeleteDayPlanBreak,
  useCreateDayPlanBonus,
  useDeleteDayPlanBonus,
} from './use-day-plans'

// Accounts
export { useAccounts, useAccount } from './use-accounts'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Hooks can be imported in a test component
- [ ] API calls work with dev server running

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Time Input Component

### Overview
Create a reusable time input component for entering minutes-from-midnight values, displaying as HH:MM.

### Changes Required:

#### 1. Time Input Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/time-input.tsx`
**Changes**: Create new component

```typescript
'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TimeInputProps {
  /** Value in minutes from midnight (0-1440) */
  value: number | null | undefined
  /** Callback when value changes */
  onChange: (minutes: number | null) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Additional class names */
  className?: string
  /** Input ID for labels */
  id?: string
}

/**
 * Convert minutes from midnight to HH:MM string.
 */
function minutesToTimeString(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Parse HH:MM string to minutes from midnight.
 */
function timeStringToMinutes(time: string): number | null {
  if (!time || !time.includes(':')) return null
  const [hoursStr, minsStr] = time.split(':')
  const hours = parseInt(hoursStr ?? '0', 10)
  const mins = parseInt(minsStr ?? '0', 10)
  if (isNaN(hours) || isNaN(mins)) return null
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null
  return hours * 60 + mins
}

/**
 * Time input component for minutes-from-midnight values.
 * Displays and accepts HH:MM format.
 */
export function TimeInput({
  value,
  onChange,
  placeholder = 'HH:MM',
  disabled,
  className,
  id,
}: TimeInputProps) {
  const [inputValue, setInputValue] = React.useState(() => minutesToTimeString(value))

  // Sync input value when prop changes externally
  React.useEffect(() => {
    setInputValue(minutesToTimeString(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
  }

  const handleBlur = () => {
    const minutes = timeStringToMinutes(inputValue)
    if (minutes !== null) {
      onChange(minutes)
      setInputValue(minutesToTimeString(minutes))
    } else if (inputValue === '') {
      onChange(null)
    } else {
      // Reset to previous valid value
      setInputValue(minutesToTimeString(value))
    }
  }

  return (
    <Input
      id={id}
      type="time"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn('w-[120px]', className)}
    />
  )
}
```

#### 2. Duration Input Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/duration-input.tsx`
**Changes**: Create component for duration values (minutes/hours)

```typescript
'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DurationInputProps {
  /** Value in minutes */
  value: number | null | undefined
  /** Callback when value changes */
  onChange: (minutes: number | null) => void
  /** Display format */
  format?: 'minutes' | 'hours' | 'hhmm'
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Additional class names */
  className?: string
  /** Input ID for labels */
  id?: string
}

/**
 * Duration input component for minute values.
 * Can display as minutes, hours (decimal), or HH:MM format.
 */
export function DurationInput({
  value,
  onChange,
  format = 'minutes',
  placeholder,
  disabled,
  className,
  id,
}: DurationInputProps) {
  const formatValue = (minutes: number | null | undefined): string => {
    if (minutes === null || minutes === undefined) return ''
    switch (format) {
      case 'hours':
        return (minutes / 60).toFixed(2)
      case 'hhmm': {
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return `${h}:${m.toString().padStart(2, '0')}`
      }
      default:
        return minutes.toString()
    }
  }

  const parseValue = (input: string): number | null => {
    if (!input) return null
    switch (format) {
      case 'hours': {
        const hours = parseFloat(input)
        if (isNaN(hours)) return null
        return Math.round(hours * 60)
      }
      case 'hhmm': {
        if (!input.includes(':')) return null
        const [h, m] = input.split(':').map(Number)
        if (isNaN(h ?? NaN) || isNaN(m ?? NaN)) return null
        return (h ?? 0) * 60 + (m ?? 0)
      }
      default: {
        const mins = parseInt(input, 10)
        if (isNaN(mins)) return null
        return mins
      }
    }
  }

  const [inputValue, setInputValue] = React.useState(() => formatValue(value))

  React.useEffect(() => {
    setInputValue(formatValue(value))
  }, [value, format])

  const handleBlur = () => {
    const minutes = parseValue(inputValue)
    if (minutes !== null) {
      onChange(minutes)
      setInputValue(formatValue(minutes))
    } else if (inputValue === '') {
      onChange(null)
    } else {
      setInputValue(formatValue(value))
    }
  }

  const defaultPlaceholder = format === 'hours' ? '8.00' : format === 'hhmm' ? '8:00' : '480'

  return (
    <Input
      id={id}
      type={format === 'minutes' ? 'number' : 'text'}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder ?? defaultPlaceholder}
      disabled={disabled}
      className={cn('w-[100px]', className)}
    />
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] TimeInput shows correct HH:MM format
- [ ] TimeInput accepts time input and converts to minutes
- [ ] DurationInput works in all three formats
- [ ] Invalid input resets to previous value

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 4: Day Plans List Page

### Overview
Create the main admin page for viewing and managing day plans with filtering and pagination.

### Changes Required:

#### 1. Day Plans Page
**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx`
**Changes**: Create new page following employee management pattern

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, X, Copy } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useDayPlans, useDeleteDayPlan } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DayPlanDataTable } from '@/components/day-plans/day-plan-data-table'
import { DayPlanFormSheet } from '@/components/day-plans/day-plan-form-sheet'
import { DayPlanDetailSheet } from '@/components/day-plans/day-plan-detail-sheet'
import { CopyDayPlanDialog } from '@/components/day-plans/copy-day-plan-dialog'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

export default function DayPlansPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
  const [typeFilter, setTypeFilter] = React.useState<'fixed' | 'flextime' | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editDayPlan, setEditDayPlan] = React.useState<DayPlan | null>(null)
  const [viewDayPlan, setViewDayPlan] = React.useState<DayPlan | null>(null)
  const [deleteDayPlan, setDeleteDayPlan] = React.useState<DayPlan | null>(null)
  const [copyDayPlan, setCopyDayPlan] = React.useState<DayPlan | null>(null)

  // Fetch day plans
  const { data, isLoading, isFetching } = useDayPlans({
    active: activeFilter,
    planType: typeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteDayPlan()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const dayPlans = React.useMemo(() => {
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

  const handleView = (dayPlan: DayPlan) => {
    setViewDayPlan(dayPlan)
  }

  const handleEdit = (dayPlan: DayPlan) => {
    setEditDayPlan(dayPlan)
    setViewDayPlan(null)
  }

  const handleDelete = (dayPlan: DayPlan) => {
    setDeleteDayPlan(dayPlan)
  }

  const handleCopy = (dayPlan: DayPlan) => {
    setCopyDayPlan(dayPlan)
  }

  const handleConfirmDelete = async () => {
    if (!deleteDayPlan) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteDayPlan.id },
      })
      setDeleteDayPlan(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditDayPlan(null)
  }

  const hasFilters = Boolean(search) || activeFilter !== undefined || typeFilter !== undefined

  if (authLoading) {
    return <DayPlansPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Day Plans</h1>
          <p className="text-muted-foreground">
            Manage day plan templates for employee schedules
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Day Plan
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code or name..."
          className="w-full sm:w-64"
          disabled={isFetching}
        />

        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
          onValueChange={(value) => {
            if (value === 'all') setActiveFilter(undefined)
            else setActiveFilter(value === 'active')
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={typeFilter ?? 'all'}
          onValueChange={(value) => {
            if (value === 'all') setTypeFilter(undefined)
            else setTypeFilter(value as 'fixed' | 'flextime')
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Plan Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="flextime">Flextime</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
              setTypeFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : dayPlans.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <DayPlanDataTable
              dayPlans={dayPlans}
              isLoading={isLoading}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCopy={handleCopy}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <DayPlanFormSheet
        open={createOpen || !!editDayPlan}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditDayPlan(null)
          }
        }}
        dayPlan={editDayPlan}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <DayPlanDetailSheet
        dayPlanId={viewDayPlan?.id ?? null}
        open={!!viewDayPlan}
        onOpenChange={(open) => {
          if (!open) setViewDayPlan(null)
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />

      {/* Copy Dialog */}
      <CopyDayPlanDialog
        dayPlan={copyDayPlan}
        open={!!copyDayPlan}
        onOpenChange={(open) => {
          if (!open) setCopyDayPlan(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteDayPlan}
        onOpenChange={(open) => {
          if (!open) setDeleteDayPlan(null)
        }}
        title="Delete Day Plan"
        description={
          deleteDayPlan
            ? `Are you sure you want to delete "${deleteDayPlan.name}" (${deleteDayPlan.code})? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  return (
    <div className="text-center py-12 px-6">
      <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No day plans found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Get started by creating your first day plan'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Day Plan
        </Button>
      )}
    </div>
  )
}

function DayPlansPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Page loads at /admin/day-plans
- [ ] Skeleton shows during loading
- [ ] Empty state displays when no plans exist
- [ ] Filters work correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 5: Day Plan Data Table

### Overview
Create the data table component for displaying day plans.

### Changes Required:

#### 1. Day Plan Data Table
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-data-table.tsx`
**Changes**: Create new component

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTime, formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface DayPlanDataTableProps {
  dayPlans: DayPlan[]
  isLoading: boolean
  onView: (dayPlan: DayPlan) => void
  onEdit: (dayPlan: DayPlan) => void
  onDelete: (dayPlan: DayPlan) => void
  onCopy: (dayPlan: DayPlan) => void
}

export function DayPlanDataTable({
  dayPlans,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: DayPlanDataTableProps) {
  if (isLoading) {
    return <DayPlanDataTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-24">Type</TableHead>
          <TableHead className="w-32">Time Window</TableHead>
          <TableHead className="w-24">Target</TableHead>
          <TableHead className="w-20">Breaks</TableHead>
          <TableHead className="w-20">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dayPlans.map((dayPlan) => (
          <TableRow
            key={dayPlan.id}
            className="cursor-pointer"
            onClick={() => onView(dayPlan)}
          >
            <TableCell className="font-mono text-sm">{dayPlan.code}</TableCell>
            <TableCell className="font-medium">{dayPlan.name}</TableCell>
            <TableCell>
              <Badge variant={dayPlan.plan_type === 'fixed' ? 'secondary' : 'outline'}>
                {dayPlan.plan_type === 'fixed' ? 'Fixed' : 'Flextime'}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {dayPlan.come_from !== null && dayPlan.come_from !== undefined
                ? `${formatTime(dayPlan.come_from)} - ${formatTime(dayPlan.go_to ?? 0)}`
                : '-'}
            </TableCell>
            <TableCell>{formatDuration(dayPlan.regular_hours)}</TableCell>
            <TableCell>{dayPlan.breaks?.length ?? 0}</TableCell>
            <TableCell>
              <Badge variant={dayPlan.is_active ? 'default' : 'secondary'}>
                {dayPlan.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(dayPlan)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(dayPlan)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(dayPlan)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(dayPlan)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DayPlanDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Table displays day plans correctly
- [ ] Row click opens detail view
- [ ] Action menu works correctly
- [ ] Time window and target hours display correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 6: Day Plan Form Sheet (Basic + Time Windows)

### Overview
Create the main form sheet for creating/editing day plans. This phase covers basic info and time windows.

### Changes Required:

#### 1. Day Plan Form Sheet
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
**Changes**: Create multi-section form component

The form will have collapsible sections:
1. Basic Information (code, name, description, type, active)
2. Time Windows (come from/to, go from/to, core start/end)
3. Target Hours (regular hours 1 & 2, from employee master)
4. Tolerances (come +/-, go +/-, variable work time)
5. Rounding (come/go type, interval, add value, round all)
6. Breaks (managed via BreaksList sub-component)
7. Bonuses (managed via BonusesList sub-component)
8. Shift Detection (windows, alternative plans)
9. Special Settings (holiday credits, vacation deduction, no-booking, day change, min/max work time)

Due to the complexity, the form will use Tabs or Accordion for section organization.

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { TimeInput } from '@/components/ui/time-input'
import { DurationInput } from '@/components/ui/duration-input'
import {
  useCreateDayPlan,
  useUpdateDayPlan,
  useDayPlan,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface DayPlanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayPlan?: DayPlan | null
  onSuccess?: () => void
}

interface FormState {
  // Basic
  code: string
  name: string
  description: string
  planType: 'fixed' | 'flextime'
  isActive: boolean
  // Time windows
  comeFrom: number | null
  comeTo: number | null
  goFrom: number | null
  goTo: number | null
  coreStart: number | null
  coreEnd: number | null
  // Target hours
  regularHours: number
  regularHours2: number | null
  fromEmployeeMaster: boolean
  // Tolerances
  toleranceComePlus: number
  toleranceComeMinus: number
  toleranceGoPlus: number
  toleranceGoMinus: number
  variableWorkTime: boolean
  // Rounding
  roundingComeType: string
  roundingComeInterval: number | null
  roundingComeAddValue: number | null
  roundingGoType: string
  roundingGoInterval: number | null
  roundingGoAddValue: number | null
  roundAllBookings: boolean
  // Special
  minWorkTime: number | null
  maxNetWorkTime: number | null
  holidayCreditCat1: number | null
  holidayCreditCat2: number | null
  holidayCreditCat3: number | null
  vacationDeduction: number
  noBookingBehavior: string
  dayChangeBehavior: string
  // Shift detection
  shiftDetectArriveFrom: number | null
  shiftDetectArriveTo: number | null
  shiftDetectDepartFrom: number | null
  shiftDetectDepartTo: number | null
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  planType: 'fixed',
  isActive: true,
  comeFrom: null,
  comeTo: null,
  goFrom: null,
  goTo: null,
  coreStart: null,
  coreEnd: null,
  regularHours: 480, // 8 hours
  regularHours2: null,
  fromEmployeeMaster: false,
  toleranceComePlus: 0,
  toleranceComeMinus: 0,
  toleranceGoPlus: 0,
  toleranceGoMinus: 0,
  variableWorkTime: false,
  roundingComeType: 'none',
  roundingComeInterval: null,
  roundingComeAddValue: null,
  roundingGoType: 'none',
  roundingGoInterval: null,
  roundingGoAddValue: null,
  roundAllBookings: false,
  minWorkTime: null,
  maxNetWorkTime: null,
  holidayCreditCat1: null,
  holidayCreditCat2: null,
  holidayCreditCat3: null,
  vacationDeduction: 1.0,
  noBookingBehavior: 'error',
  dayChangeBehavior: 'none',
  shiftDetectArriveFrom: null,
  shiftDetectArriveTo: null,
  shiftDetectDepartFrom: null,
  shiftDetectDepartTo: null,
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []

  if (!isEdit && !form.code.trim()) {
    errors.push('Code is required')
  }
  if (form.code && /^[UKS]$/i.test(form.code.trim())) {
    errors.push('Code cannot be U, K, or S (reserved for absence days)')
  }
  if (!form.name.trim()) {
    errors.push('Name is required')
  }
  if (form.regularHours < 0) {
    errors.push('Target hours must be positive')
  }

  return errors
}

export function DayPlanFormSheet({
  open,
  onOpenChange,
  dayPlan,
  onSuccess,
}: DayPlanFormSheetProps) {
  const isEdit = !!dayPlan
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState('basic')

  // Fetch full day plan details when editing
  const { data: fullDayPlan } = useDayPlan(dayPlan?.id ?? '', open && isEdit)

  // Mutations
  const createMutation = useCreateDayPlan()
  const updateMutation = useUpdateDayPlan()

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      if (fullDayPlan) {
        setForm({
          code: fullDayPlan.code,
          name: fullDayPlan.name,
          description: fullDayPlan.description ?? '',
          planType: fullDayPlan.plan_type as 'fixed' | 'flextime',
          isActive: fullDayPlan.is_active,
          comeFrom: fullDayPlan.come_from ?? null,
          comeTo: fullDayPlan.come_to ?? null,
          goFrom: fullDayPlan.go_from ?? null,
          goTo: fullDayPlan.go_to ?? null,
          coreStart: fullDayPlan.core_start ?? null,
          coreEnd: fullDayPlan.core_end ?? null,
          regularHours: fullDayPlan.regular_hours,
          regularHours2: fullDayPlan.regular_hours_2 ?? null,
          fromEmployeeMaster: fullDayPlan.from_employee_master ?? false,
          toleranceComePlus: fullDayPlan.tolerance_come_plus ?? 0,
          toleranceComeMinus: fullDayPlan.tolerance_come_minus ?? 0,
          toleranceGoPlus: fullDayPlan.tolerance_go_plus ?? 0,
          toleranceGoMinus: fullDayPlan.tolerance_go_minus ?? 0,
          variableWorkTime: fullDayPlan.variable_work_time ?? false,
          roundingComeType: fullDayPlan.rounding_come_type ?? 'none',
          roundingComeInterval: fullDayPlan.rounding_come_interval ?? null,
          roundingComeAddValue: fullDayPlan.rounding_come_add_value ?? null,
          roundingGoType: fullDayPlan.rounding_go_type ?? 'none',
          roundingGoInterval: fullDayPlan.rounding_go_interval ?? null,
          roundingGoAddValue: fullDayPlan.rounding_go_add_value ?? null,
          roundAllBookings: fullDayPlan.round_all_bookings ?? false,
          minWorkTime: fullDayPlan.min_work_time ?? null,
          maxNetWorkTime: fullDayPlan.max_net_work_time ?? null,
          holidayCreditCat1: fullDayPlan.holiday_credit_cat1 ?? null,
          holidayCreditCat2: fullDayPlan.holiday_credit_cat2 ?? null,
          holidayCreditCat3: fullDayPlan.holiday_credit_cat3 ?? null,
          vacationDeduction: fullDayPlan.vacation_deduction ?? 1.0,
          noBookingBehavior: fullDayPlan.no_booking_behavior ?? 'error',
          dayChangeBehavior: fullDayPlan.day_change_behavior ?? 'none',
          shiftDetectArriveFrom: fullDayPlan.shift_detect_arrive_from ?? null,
          shiftDetectArriveTo: fullDayPlan.shift_detect_arrive_to ?? null,
          shiftDetectDepartFrom: fullDayPlan.shift_detect_depart_from ?? null,
          shiftDetectDepartTo: fullDayPlan.shift_detect_depart_to ?? null,
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
      setError(null)
      setActiveTab('basic')
    }
  }, [open, fullDayPlan, isEdit])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      plan_type: form.planType,
      come_from: form.comeFrom ?? undefined,
      come_to: form.comeTo ?? undefined,
      go_from: form.goFrom ?? undefined,
      go_to: form.goTo ?? undefined,
      core_start: form.coreStart ?? undefined,
      core_end: form.coreEnd ?? undefined,
      regular_hours: form.regularHours,
      regular_hours_2: form.regularHours2 ?? undefined,
      from_employee_master: form.fromEmployeeMaster,
      tolerance_come_plus: form.toleranceComePlus,
      tolerance_come_minus: form.toleranceComeMinus,
      tolerance_go_plus: form.toleranceGoPlus,
      tolerance_go_minus: form.toleranceGoMinus,
      variable_work_time: form.variableWorkTime,
      rounding_come_type: form.roundingComeType !== 'none' ? form.roundingComeType : undefined,
      rounding_come_interval: form.roundingComeInterval ?? undefined,
      rounding_come_add_value: form.roundingComeAddValue ?? undefined,
      rounding_go_type: form.roundingGoType !== 'none' ? form.roundingGoType : undefined,
      rounding_go_interval: form.roundingGoInterval ?? undefined,
      rounding_go_add_value: form.roundingGoAddValue ?? undefined,
      round_all_bookings: form.roundAllBookings,
      min_work_time: form.minWorkTime ?? undefined,
      max_net_work_time: form.maxNetWorkTime ?? undefined,
      holiday_credit_cat1: form.holidayCreditCat1 ?? undefined,
      holiday_credit_cat2: form.holidayCreditCat2 ?? undefined,
      holiday_credit_cat3: form.holidayCreditCat3 ?? undefined,
      vacation_deduction: form.vacationDeduction,
      no_booking_behavior: form.noBookingBehavior,
      day_change_behavior: form.dayChangeBehavior,
      shift_detect_arrive_from: form.shiftDetectArriveFrom ?? undefined,
      shift_detect_arrive_to: form.shiftDetectArriveTo ?? undefined,
      shift_detect_depart_from: form.shiftDetectDepartFrom ?? undefined,
      shift_detect_depart_to: form.shiftDetectDepartTo ?? undefined,
      is_active: form.isActive,
    }

    try {
      if (isEdit && dayPlan) {
        await updateMutation.mutateAsync({
          path: { id: dayPlan.id },
          body,
        })
      } else {
        await createMutation.mutateAsync({ body })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} day plan`)
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const isFlextime = form.planType === 'flextime'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Day Plan' : 'New Day Plan'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the day plan configuration.'
              : 'Create a new day plan template for employee schedules.'}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
            <TabsTrigger value="tolerance">Tolerance</TabsTrigger>
            <TabsTrigger value="rounding">Rounding</TabsTrigger>
            <TabsTrigger value="special">Special</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="py-4">
              {/* Basic Information Tab */}
              <TabsContent value="basic" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                      disabled={isEdit || isSubmitting}
                      placeholder="STD-1"
                      maxLength={20}
                    />
                    {isEdit && (
                      <p className="text-xs text-muted-foreground">Cannot be changed</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planType">Plan Type *</Label>
                    <Select
                      value={form.planType}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, planType: value as 'fixed' | 'flextime' }))}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Working Time</SelectItem>
                        <SelectItem value="flextime">Flextime</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder="Standard 8-Hour Day"
                    maxLength={255}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder="Optional description..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked === true }))}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>

                {/* Target Hours */}
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Target Hours</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="regularHours">Regular Hours (Soll) *</Label>
                      <DurationInput
                        id="regularHours"
                        value={form.regularHours}
                        onChange={(v) => setForm((prev) => ({ ...prev, regularHours: v ?? 480 }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="regularHours2">Alternative for Absence</Label>
                      <DurationInput
                        id="regularHours2"
                        value={form.regularHours2}
                        onChange={(v) => setForm((prev) => ({ ...prev, regularHours2: v }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fromEmployeeMaster"
                      checked={form.fromEmployeeMaster}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, fromEmployeeMaster: checked === true }))}
                      disabled={isSubmitting}
                    />
                    <Label htmlFor="fromEmployeeMaster">Get from Employee Master</Label>
                  </div>
                </div>
              </TabsContent>

              {/* Time Windows Tab */}
              <TabsContent value="time" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Arrival Window</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="comeFrom">Come From *</Label>
                      <TimeInput
                        id="comeFrom"
                        value={form.comeFrom}
                        onChange={(v) => setForm((prev) => ({ ...prev, comeFrom: v }))}
                        disabled={isSubmitting}
                      />
                    </div>
                    {isFlextime && (
                      <div className="space-y-2">
                        <Label htmlFor="comeTo">Come To</Label>
                        <TimeInput
                          id="comeTo"
                          value={form.comeTo}
                          onChange={(v) => setForm((prev) => ({ ...prev, comeTo: v }))}
                          disabled={isSubmitting}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Departure Window</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {isFlextime && (
                      <div className="space-y-2">
                        <Label htmlFor="goFrom">Go From</Label>
                        <TimeInput
                          id="goFrom"
                          value={form.goFrom}
                          onChange={(v) => setForm((prev) => ({ ...prev, goFrom: v }))}
                          disabled={isSubmitting}
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="goTo">Go To *</Label>
                      <TimeInput
                        id="goTo"
                        value={form.goTo}
                        onChange={(v) => setForm((prev) => ({ ...prev, goTo: v }))}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                {isFlextime && (
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Core Time</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="coreStart">Core Start</Label>
                        <TimeInput
                          id="coreStart"
                          value={form.coreStart}
                          onChange={(v) => setForm((prev) => ({ ...prev, coreStart: v }))}
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coreEnd">Core End</Label>
                        <TimeInput
                          id="coreEnd"
                          value={form.coreEnd}
                          onChange={(v) => setForm((prev) => ({ ...prev, coreEnd: v }))}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Tolerance Tab */}
              <TabsContent value="tolerance" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Arrival Tolerance</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {(!isFlextime || form.variableWorkTime) && (
                      <div className="space-y-2">
                        <Label htmlFor="toleranceComeMinus">Tolerance Come - (min)</Label>
                        <Input
                          id="toleranceComeMinus"
                          type="number"
                          min={0}
                          value={form.toleranceComeMinus}
                          onChange={(e) => setForm((prev) => ({ ...prev, toleranceComeMinus: parseInt(e.target.value) || 0 }))}
                          disabled={isSubmitting}
                        />
                        <p className="text-xs text-muted-foreground">Early arrival tolerance</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="toleranceComePlus">Tolerance Come + (min)</Label>
                      <Input
                        id="toleranceComePlus"
                        type="number"
                        min={0}
                        value={form.toleranceComePlus}
                        onChange={(e) => setForm((prev) => ({ ...prev, toleranceComePlus: parseInt(e.target.value) || 0 }))}
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">Late arrival grace period</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Departure Tolerance</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="toleranceGoMinus">Tolerance Go - (min)</Label>
                      <Input
                        id="toleranceGoMinus"
                        type="number"
                        min={0}
                        value={form.toleranceGoMinus}
                        onChange={(e) => setForm((prev) => ({ ...prev, toleranceGoMinus: parseInt(e.target.value) || 0 }))}
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">Early departure grace period</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="toleranceGoPlus">Tolerance Go + (min)</Label>
                      <Input
                        id="toleranceGoPlus"
                        type="number"
                        min={0}
                        value={form.toleranceGoPlus}
                        onChange={(e) => setForm((prev) => ({ ...prev, toleranceGoPlus: parseInt(e.target.value) || 0 }))}
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">No-overtime zone after end</p>
                    </div>
                  </div>
                </div>

                {!isFlextime && (
                  <div className="flex items-center space-x-2 pt-4 border-t">
                    <Checkbox
                      id="variableWorkTime"
                      checked={form.variableWorkTime}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, variableWorkTime: checked === true }))}
                      disabled={isSubmitting}
                    />
                    <div>
                      <Label htmlFor="variableWorkTime">Variable Work Time</Label>
                      <p className="text-xs text-muted-foreground">Enables early arrival tolerance for fixed plans</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Rounding Tab */}
              <TabsContent value="rounding" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Arrival Rounding</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="roundingComeType">Type</Label>
                      <Select
                        value={form.roundingComeType}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, roundingComeType: v }))}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="up">Round Up</SelectItem>
                          <SelectItem value="down">Round Down</SelectItem>
                          <SelectItem value="nearest">Nearest</SelectItem>
                          <SelectItem value="add">Add</SelectItem>
                          <SelectItem value="subtract">Subtract</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {['up', 'down', 'nearest'].includes(form.roundingComeType) && (
                      <div className="space-y-2">
                        <Label htmlFor="roundingComeInterval">Interval (min)</Label>
                        <Input
                          id="roundingComeInterval"
                          type="number"
                          min={1}
                          value={form.roundingComeInterval ?? ''}
                          onChange={(e) => setForm((prev) => ({ ...prev, roundingComeInterval: e.target.value ? parseInt(e.target.value) : null }))}
                          disabled={isSubmitting}
                          placeholder="15"
                        />
                      </div>
                    )}
                    {['add', 'subtract'].includes(form.roundingComeType) && (
                      <div className="space-y-2">
                        <Label htmlFor="roundingComeAddValue">Value (min)</Label>
                        <Input
                          id="roundingComeAddValue"
                          type="number"
                          min={0}
                          value={form.roundingComeAddValue ?? ''}
                          onChange={(e) => setForm((prev) => ({ ...prev, roundingComeAddValue: e.target.value ? parseInt(e.target.value) : null }))}
                          disabled={isSubmitting}
                          placeholder="10"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Departure Rounding</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="roundingGoType">Type</Label>
                      <Select
                        value={form.roundingGoType}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, roundingGoType: v }))}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="up">Round Up</SelectItem>
                          <SelectItem value="down">Round Down</SelectItem>
                          <SelectItem value="nearest">Nearest</SelectItem>
                          <SelectItem value="add">Add</SelectItem>
                          <SelectItem value="subtract">Subtract</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {['up', 'down', 'nearest'].includes(form.roundingGoType) && (
                      <div className="space-y-2">
                        <Label htmlFor="roundingGoInterval">Interval (min)</Label>
                        <Input
                          id="roundingGoInterval"
                          type="number"
                          min={1}
                          value={form.roundingGoInterval ?? ''}
                          onChange={(e) => setForm((prev) => ({ ...prev, roundingGoInterval: e.target.value ? parseInt(e.target.value) : null }))}
                          disabled={isSubmitting}
                          placeholder="15"
                        />
                      </div>
                    )}
                    {['add', 'subtract'].includes(form.roundingGoType) && (
                      <div className="space-y-2">
                        <Label htmlFor="roundingGoAddValue">Value (min)</Label>
                        <Input
                          id="roundingGoAddValue"
                          type="number"
                          min={0}
                          value={form.roundingGoAddValue ?? ''}
                          onChange={(e) => setForm((prev) => ({ ...prev, roundingGoAddValue: e.target.value ? parseInt(e.target.value) : null }))}
                          disabled={isSubmitting}
                          placeholder="10"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-4 border-t">
                  <Checkbox
                    id="roundAllBookings"
                    checked={form.roundAllBookings}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, roundAllBookings: checked === true }))}
                    disabled={isSubmitting}
                  />
                  <div>
                    <Label htmlFor="roundAllBookings">Round All Bookings</Label>
                    <p className="text-xs text-muted-foreground">Round all arrivals/departures, not just first/last</p>
                  </div>
                </div>
              </TabsContent>

              {/* Special Settings Tab */}
              <TabsContent value="special" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Work Time Limits</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minWorkTime">Min Work Time</Label>
                      <DurationInput
                        id="minWorkTime"
                        value={form.minWorkTime}
                        onChange={(v) => setForm((prev) => ({ ...prev, minWorkTime: v }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxNetWorkTime">Max Net Work Time</Label>
                      <DurationInput
                        id="maxNetWorkTime"
                        value={form.maxNetWorkTime}
                        onChange={(v) => setForm((prev) => ({ ...prev, maxNetWorkTime: v }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">Daily cap, excess goes to capping account</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Holiday Credits</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="holidayCreditCat1">Category 1 (Full)</Label>
                      <DurationInput
                        id="holidayCreditCat1"
                        value={form.holidayCreditCat1}
                        onChange={(v) => setForm((prev) => ({ ...prev, holidayCreditCat1: v }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holidayCreditCat2">Category 2 (Half)</Label>
                      <DurationInput
                        id="holidayCreditCat2"
                        value={form.holidayCreditCat2}
                        onChange={(v) => setForm((prev) => ({ ...prev, holidayCreditCat2: v }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holidayCreditCat3">Category 3</Label>
                      <DurationInput
                        id="holidayCreditCat3"
                        value={form.holidayCreditCat3}
                        onChange={(v) => setForm((prev) => ({ ...prev, holidayCreditCat3: v }))}
                        format="hhmm"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Special Behaviors</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vacationDeduction">Vacation Deduction</Label>
                      <Input
                        id="vacationDeduction"
                        type="number"
                        step="0.5"
                        min={0}
                        value={form.vacationDeduction}
                        onChange={(e) => setForm((prev) => ({ ...prev, vacationDeduction: parseFloat(e.target.value) || 1 }))}
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">Days deducted from vacation balance</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="noBookingBehavior">No Booking Behavior</Label>
                      <Select
                        value={form.noBookingBehavior}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, noBookingBehavior: v }))}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="error">Show Error</SelectItem>
                          <SelectItem value="deduct_target">Deduct Target Hours</SelectItem>
                          <SelectItem value="vocational_school">Vocational School</SelectItem>
                          <SelectItem value="adopt_target">Adopt Target Hours</SelectItem>
                          <SelectItem value="target_with_order">Target with Order</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dayChangeBehavior">Day Change Behavior</Label>
                      <Select
                        value={form.dayChangeBehavior}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, dayChangeBehavior: v }))}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Day Change</SelectItem>
                          <SelectItem value="at_arrival">Evaluate at Arrival</SelectItem>
                          <SelectItem value="at_departure">Evaluate at Departure</SelectItem>
                          <SelectItem value="auto_complete">Auto-complete at Midnight</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Cross-midnight shift handling</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-medium">Shift Detection</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Arrival Detection Window</Label>
                      <div className="flex gap-2 items-center">
                        <TimeInput
                          value={form.shiftDetectArriveFrom}
                          onChange={(v) => setForm((prev) => ({ ...prev, shiftDetectArriveFrom: v }))}
                          disabled={isSubmitting}
                          placeholder="From"
                        />
                        <span>-</span>
                        <TimeInput
                          value={form.shiftDetectArriveTo}
                          onChange={(v) => setForm((prev) => ({ ...prev, shiftDetectArriveTo: v }))}
                          disabled={isSubmitting}
                          placeholder="To"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Departure Detection Window</Label>
                      <div className="flex gap-2 items-center">
                        <TimeInput
                          value={form.shiftDetectDepartFrom}
                          onChange={(v) => setForm((prev) => ({ ...prev, shiftDetectDepartFrom: v }))}
                          disabled={isSubmitting}
                          placeholder="From"
                        />
                        <span>-</span>
                        <TimeInput
                          value={form.shiftDetectDepartTo}
                          onChange={(v) => setForm((prev) => ({ ...prev, shiftDetectDepartTo: v }))}
                          disabled={isSubmitting}
                          placeholder="To"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        {error && (
          <Alert variant="destructive" className="mx-0">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Day Plan'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Form opens from list page
- [ ] All tabs navigate correctly
- [ ] Create new day plan works
- [ ] Edit existing day plan loads data
- [ ] Validation errors display properly
- [ ] Plan type toggle shows/hides flextime fields

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 7: Break and Bonus Management

### Overview
Add breaks and bonuses management to the form with inline add/remove functionality.

### Changes Required:

#### 1. Break Form Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/break-form.tsx`

This component handles adding/displaying breaks with fields:
- break_type (fixed, variable, minimum)
- start_time, end_time (for fixed/variable)
- duration
- after_work_minutes (for minimum breaks)
- auto_deduct
- is_paid
- minutes_difference (for minimum breaks)

#### 2. Bonus Form Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/bonus-form.tsx`

This component handles adding/displaying bonuses with fields:
- account_id (dropdown from useAccounts)
- time_from, time_to
- calculation_type (fixed, per_minute, percentage)
- value_minutes
- min_work_minutes
- applies_on_holiday

#### 3. Breaks List Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/breaks-list.tsx`

Displays existing breaks with delete button and add form.

#### 4. Bonuses List Component
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/bonuses-list.tsx`

Displays existing bonuses with account name and delete button.

#### 5. Add Breaks/Bonuses tabs to form
Update DayPlanFormSheet to include two more tabs: Breaks and Bonuses

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Can add fixed, variable, and minimum breaks
- [ ] Break-type-specific fields show/hide correctly
- [ ] Can delete breaks
- [ ] Can add bonuses with account selection
- [ ] Can delete bonuses

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 8: Detail Sheet and Copy Dialog

### Overview
Create read-only detail view and copy dialog components.

### Changes Required:

#### 1. Day Plan Detail Sheet
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-detail-sheet.tsx`

Read-only view showing all day plan configuration with:
- Section headers matching form tabs
- Formatted time values
- Breaks and bonuses lists
- Action buttons (Edit, Copy, Delete)

#### 2. Copy Day Plan Dialog
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`

Simple dialog with:
- New code input
- New name input
- Copy button using useCopyDayPlan hook

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Detail sheet shows all day plan fields
- [ ] Breaks and bonuses display correctly
- [ ] Copy dialog creates new plan with new code/name
- [ ] Action buttons work from detail view

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 9: Navigation and Polish

### Overview
Add navigation links and final polish.

### Changes Required:

#### 1. Add to Admin Navigation
**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar.tsx` (or equivalent navigation file)
**Changes**: Add Day Plans link in admin section

#### 2. Export Components
**File**: `/home/tolga/projects/terp/apps/web/src/components/day-plans/index.ts`
**Changes**: Create barrel export file

```typescript
export { DayPlanDataTable } from './day-plan-data-table'
export { DayPlanFormSheet } from './day-plan-form-sheet'
export { DayPlanDetailSheet } from './day-plan-detail-sheet'
export { CopyDayPlanDialog } from './copy-day-plan-dialog'
export { BreakForm } from './break-form'
export { BonusForm } from './bonus-form'
export { BreaksList } from './breaks-list'
export { BonusesList } from './bonuses-list'
```

### Success Criteria:

#### Automated Verification:
- [ ] Full build succeeds: `cd apps/web && pnpm build`
- [ ] TypeScript compiles: `cd apps/web && pnpm tsc --noEmit`
- [ ] Lint passes: `cd apps/web && pnpm lint`
- [ ] Backend tests pass: `cd apps/api && go test ./...`

#### Manual Verification:
- [ ] Navigation link appears in admin menu
- [ ] Full workflow: create -> edit -> copy -> delete
- [ ] Form validation works for all fields
- [ ] All time inputs display correctly
- [ ] Responsive design on mobile

**Implementation Note**: This is the final phase. After all verification passes, the feature is complete.

---

## Testing Strategy

### Unit Tests (Future Enhancement)
- Time input component conversion functions
- Form validation logic
- Duration formatting utilities

### Integration Tests (Manual)
1. Create day plan with minimal fields (code, name, type, hours)
2. Create day plan with all fields populated
3. Edit day plan and verify changes persist
4. Copy day plan and verify new plan created
5. Add/remove breaks of each type
6. Add/remove bonuses with different calculation types
7. Delete day plan

### Edge Cases to Test
- Reserved codes (U, K, S) validation
- Time window validation (come_from < go_to)
- Duplicate code handling
- Empty state handling
- Loading state handling
- Error message display

## Performance Considerations

- Day plans list is typically small (<50), no pagination needed
- Fetch full day plan details only when opening form/detail
- Use React Query caching for reference data (accounts)

## References

- Research: `thoughts/shared/research/2026-01-26-NOK-228-day-plan-management.md`
- ZMI Reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Employee Pattern: `apps/web/src/app/(dashboard)/admin/employees/page.tsx`
- Form Pattern: `apps/web/src/components/employees/employee-form-sheet.tsx`
- API Schema: `api/schemas/day-plans.yaml`
- Go Model: `apps/api/internal/model/dayplan.go`
