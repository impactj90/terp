# Holiday Management Implementation Plan (NOK-231)

## Overview

Build holiday management UI for defining public holidays with calendar visualization. This feature allows admins to manage public holidays, view them in a year calendar, and assign holidays to specific departments.

## Current State Analysis

### Backend (Complete)
- Database schema exists with `holidays` table (migrations 000003)
- Model, repository, service, and handler fully implemented
- All CRUD endpoints available:
  - `GET /holidays` - List with `year`, `from`, `to` filters
  - `POST /holidays` - Create
  - `GET /holidays/{id}` - Get single
  - `PATCH /holidays/{id}` - Update
  - `DELETE /holidays/{id}` - Delete

### Frontend (Partial)
- Query hooks exist: `useHolidays`, `useHoliday`
- **Missing**: Mutation hooks (create, update, delete)
- **Missing**: Holiday management page and components
- **Missing**: Sidebar navigation entry

### Key Discoveries
- Schema has `is_half_day` boolean but NO `category` field
  - Ticket mentions categories (1=full, 2=half, 3=custom) but API doesn't support this
  - Will simplify to match actual API: use `is_half_day` toggle only
- `applies_to_all` + optional `department_id` for department-specific holidays
- Unique constraint on `(tenant_id, holiday_date)` prevents duplicate dates

## Desired End State

A fully functional holiday management page at `/admin/holidays` with:
1. List view showing holidays in a data table
2. Year calendar view showing all 12 months with holiday highlighting
3. Year selector to filter holidays by year
4. Create/edit form with all supported fields
5. Department selector for department-specific holidays
6. Delete confirmation with proper error handling
7. Half-day visual differentiation in both views

### Verification:
- Admin can navigate to `/admin/holidays` from sidebar
- Admin can view holidays in list or calendar view
- Admin can create, edit, and delete holidays
- Half-day holidays show distinct styling
- Department-specific holidays show department badge

## What We're NOT Doing

- **Category field**: API doesn't support categories (1/2/3), only `is_half_day`
- **Bulk import**: No API endpoint exists for bulk import
- **Year-to-year copy**: No API endpoint exists for copying holidays
- **Affected employees count**: No API support for this calculation
- These features would require backend changes and are out of scope for this ticket

## Implementation Approach

Follow existing management page patterns (departments, teams, day-plans):
1. Add mutation hooks to existing `use-holidays.ts`
2. Create holiday components in `components/holidays/`
3. Create holiday page at `app/(dashboard)/admin/holidays/page.tsx`
4. Add navigation entry to sidebar config

---

## Phase 1: Add Holiday Mutation Hooks

### Overview
Extend the existing `use-holidays.ts` hook file to include create, update, and delete mutations.

### Changes Required:

#### 1. Update Holiday Hooks
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-holidays.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseHolidaysOptions {
  year?: number
  from?: string
  to?: string
  enabled?: boolean
}

/**
 * Hook to fetch public holidays.
 */
export function useHolidays(options: UseHolidaysOptions = {}) {
  const { year, from, to, enabled = true } = options

  return useApiQuery('/holidays', {
    params: { year, from, to },
    enabled,
  })
}

/**
 * Hook to fetch a single holiday by ID.
 */
export function useHoliday(id: string, enabled = true) {
  return useApiQuery('/holidays/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new holiday.
 */
export function useCreateHoliday() {
  return useApiMutation('/holidays', 'post', {
    invalidateKeys: [['/holidays']],
  })
}

/**
 * Hook to update an existing holiday.
 */
export function useUpdateHoliday() {
  return useApiMutation('/holidays/{id}', 'patch', {
    invalidateKeys: [['/holidays']],
  })
}

/**
 * Hook to delete a holiday.
 */
export function useDeleteHoliday() {
  return useApiMutation('/holidays/{id}', 'delete', {
    invalidateKeys: [['/holidays']],
  })
}
```

#### 2. Update Hooks Index
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Update the holidays export:
```typescript
// Holidays
export {
  useHolidays,
  useHoliday,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
} from './use-holidays'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Hooks can be imported in a test component

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Create Holiday Data Table Component

### Overview
Create the data table component for displaying holidays in list view.

### Changes Required:

#### 1. Holiday Data Table
**File**: `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-data-table.tsx`

```typescript
'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { MoreHorizontal, Eye, Edit, Trash2, CalendarDays, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayDataTableProps {
  holidays: Holiday[]
  isLoading: boolean
  onView: (holiday: Holiday) => void
  onEdit: (holiday: Holiday) => void
  onDelete: (holiday: Holiday) => void
}

export function HolidayDataTable({
  holidays,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: HolidayDataTableProps) {
  if (isLoading) {
    return <HolidayDataTableSkeleton />
  }

  if (holidays.length === 0) {
    return null
  }

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'EEEE, MMMM d, yyyy')
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Date</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-24">Type</TableHead>
          <TableHead className="w-32">Applies To</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holidays.map((holiday) => (
          <TableRow
            key={holiday.id}
            className="cursor-pointer"
            onClick={() => onView(holiday)}
          >
            <TableCell className="font-mono text-sm">
              {formatDate(holiday.holiday_date)}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30">
                  <CalendarDays className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-medium">{holiday.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                {holiday.is_half_day ? 'Half Day' : 'Full Day'}
              </Badge>
            </TableCell>
            <TableCell>
              {holiday.applies_to_all ? (
                <span className="text-muted-foreground">All</span>
              ) : (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  <span className="text-sm">Department</span>
                </div>
              )}
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
                  <DropdownMenuItem onClick={() => onView(holiday)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(holiday)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(holiday)}
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

function HolidayDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
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
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Component can be imported without errors

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Create Holiday Year Calendar View Component

### Overview
Create a new year calendar component showing all 12 months with holiday highlighting. This is a custom component as no existing year view exists.

### Changes Required:

#### 1. Holiday Year Calendar
**File**: `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-year-calendar.tsx`

```typescript
'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { parseISODate, isSameDay, isWeekend, isToday } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayYearCalendarProps {
  year: number
  holidays: Holiday[]
  onHolidayClick?: (holiday: Holiday) => void
  onDateClick?: (date: Date) => void
  className?: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  const startDayOfWeek = firstDay.getDay()
  const adjustedStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

  const grid: (Date | null)[][] = []
  let currentWeek: (Date | null)[] = Array(adjustedStart).fill(null)

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(year, month, day))
    if (currentWeek.length === 7) {
      grid.push(currentWeek)
      currentWeek = []
    }
  }

  // Pad last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null)
    }
    grid.push(currentWeek)
  }

  return grid
}

function MonthMiniCalendar({
  year,
  month,
  holidays,
  onHolidayClick,
  onDateClick,
}: {
  year: number
  month: number
  holidays: Holiday[]
  onHolidayClick?: (holiday: Holiday) => void
  onDateClick?: (date: Date) => void
}) {
  const grid = React.useMemo(() => getMonthGrid(year, month), [year, month])

  const holidayMap = React.useMemo(() => {
    const map = new Map<string, Holiday>()
    for (const h of holidays) {
      const date = parseISODate(h.holiday_date)
      if (date.getMonth() === month && date.getFullYear() === year) {
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        map.set(key, h)
      }
    }
    return map
  }, [holidays, month, year])

  const getHoliday = (date: Date): Holiday | undefined => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    return holidayMap.get(key)
  }

  const handleClick = (date: Date) => {
    const holiday = getHoliday(date)
    if (holiday) {
      onHolidayClick?.(holiday)
    } else {
      onDateClick?.(date)
    }
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-center">{MONTH_NAMES[month]}</h3>

      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px">
        {WEEK_DAYS.map((day, i) => (
          <div
            key={i}
            className={cn(
              'text-center text-[10px] font-medium py-0.5',
              i >= 5 && 'text-muted-foreground'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-px">
        {grid.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-px">
            {week.map((date, dayIndex) => {
              if (!date) {
                return <div key={dayIndex} className="h-5" />
              }

              const holiday = getHoliday(date)
              const isHolidayDate = !!holiday
              const isHalfDay = holiday?.is_half_day
              const weekend = isWeekend(date)
              const today = isToday(date)

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => handleClick(date)}
                  className={cn(
                    'h-5 w-full text-[10px] rounded-sm transition-colors',
                    'hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    today && 'ring-1 ring-primary',
                    weekend && !isHolidayDate && 'text-muted-foreground bg-muted/30',
                    isHolidayDate && !isHalfDay && 'bg-red-500 text-white hover:bg-red-600',
                    isHolidayDate && isHalfDay && 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-100 hover:bg-red-300 dark:hover:bg-red-900/70'
                  )}
                  title={holiday?.name}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HolidayYearCalendar({
  year,
  holidays,
  onHolidayClick,
  onDateClick,
  className,
}: HolidayYearCalendarProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Year grid - 4 columns x 3 rows */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, month) => (
          <div key={month} className="border rounded-lg p-2">
            <MonthMiniCalendar
              year={year}
              month={month}
              holidays={holidays}
              onHolidayClick={onHolidayClick}
              onDateClick={onDateClick}
            />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm justify-center">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-red-500" />
          <span className="text-muted-foreground">Full Day Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-red-200 dark:bg-red-900/50" />
          <span className="text-muted-foreground">Half Day Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-muted/50" />
          <span className="text-muted-foreground">Weekend</span>
        </div>
      </div>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Component displays 12 months in a grid
- [ ] Holidays are highlighted with correct colors

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Create Holiday Form Sheet Component

### Overview
Create the form sheet for creating and editing holidays.

### Changes Required:

#### 1. Holiday Form Sheet
**File**: `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-form-sheet.tsx`

```typescript
'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Loader2, CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  useCreateHoliday,
  useUpdateHoliday,
  useDepartments,
} from '@/hooks/api'
import { cn } from '@/lib/utils'
import { formatDate, parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holiday?: Holiday | null
  defaultDate?: Date | null
  onSuccess?: () => void
}

interface FormState {
  holidayDate: Date | undefined
  name: string
  isHalfDay: boolean
  appliesToAll: boolean
  departmentId: string
}

const INITIAL_STATE: FormState = {
  holidayDate: undefined,
  name: '',
  isHalfDay: false,
  appliesToAll: true,
  departmentId: '',
}

function validateForm(form: FormState): string[] {
  const errors: string[] = []

  if (!form.holidayDate) {
    errors.push('Date is required')
  }

  if (!form.name.trim()) {
    errors.push('Name is required')
  }

  if (!form.appliesToAll && !form.departmentId) {
    errors.push('Department is required when not applying to all')
  }

  return errors
}

export function HolidayFormSheet({
  open,
  onOpenChange,
  holiday,
  defaultDate,
  onSuccess,
}: HolidayFormSheetProps) {
  const isEdit = !!holiday
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [datePickerOpen, setDatePickerOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => new Date())

  // Mutations
  const createMutation = useCreateHoliday()
  const updateMutation = useUpdateHoliday()

  // Fetch departments for selection
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    enabled: open && !form.appliesToAll,
    active: true,
  })
  const departments = departmentsData?.data ?? []

  // Reset form when opening/closing or holiday changes
  React.useEffect(() => {
    if (open) {
      if (holiday) {
        const date = parseISODate(holiday.holiday_date)
        setForm({
          holidayDate: date,
          name: holiday.name,
          isHalfDay: holiday.is_half_day ?? false,
          appliesToAll: holiday.applies_to_all ?? true,
          departmentId: holiday.department_id || '',
        })
        setMonth(date)
      } else {
        const initialDate = defaultDate || undefined
        setForm({
          ...INITIAL_STATE,
          holidayDate: initialDate,
        })
        if (initialDate) {
          setMonth(initialDate)
        }
      }
      setError(null)
    }
  }, [open, holiday, defaultDate])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && holiday) {
        await updateMutation.mutateAsync({
          path: { id: holiday.id },
          body: {
            holiday_date: formatDate(form.holidayDate!),
            name: form.name.trim(),
            is_half_day: form.isHalfDay,
            applies_to_all: form.appliesToAll,
            department_id: form.appliesToAll ? undefined : form.departmentId || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            holiday_date: formatDate(form.holidayDate!),
            name: form.name.trim(),
            is_half_day: form.isHalfDay,
            applies_to_all: form.appliesToAll,
            department_id: form.appliesToAll ? undefined : form.departmentId || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} holiday`
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Holiday' : 'New Holiday'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update holiday information.'
              : 'Create a new public holiday.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Date Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Date</h3>

              <div className="space-y-2">
                <Label>Holiday Date *</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.holidayDate && 'text-muted-foreground'
                      )}
                      disabled={isSubmitting}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.holidayDate ? (
                        format(form.holidayDate, 'EEEE, MMMM d, yyyy')
                      ) : (
                        'Select date'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      month={month}
                      onMonthChange={setMonth}
                      selected={form.holidayDate}
                      onSelect={(date) => {
                        if (date instanceof Date) {
                          setForm((prev) => ({ ...prev, holidayDate: date }))
                          setDatePickerOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Information</h3>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Christmas Day"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isHalfDay">Half Day</Label>
                  <p className="text-xs text-muted-foreground">
                    Half days credit 50% of regular working time
                  </p>
                </div>
                <Switch
                  id="isHalfDay"
                  checked={form.isHalfDay}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isHalfDay: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Scope */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Scope</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="appliesToAll">Applies to All Employees</Label>
                  <p className="text-xs text-muted-foreground">
                    Uncheck to assign to a specific department
                  </p>
                </div>
                <Switch
                  id="appliesToAll"
                  checked={form.appliesToAll}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      appliesToAll: checked,
                      departmentId: checked ? '' : prev.departmentId,
                    }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              {!form.appliesToAll && (
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select
                    value={form.departmentId || '__none__'}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        departmentId: value === '__none__' ? '' : value,
                      }))
                    }
                    disabled={isSubmitting || loadingDepartments}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select a department</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name} ({dept.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Holiday'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Form sheet opens and closes correctly
- [ ] Date picker works
- [ ] Department selector appears when "Applies to All" is unchecked

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Create Holiday Detail Sheet Component

### Overview
Create the detail sheet for viewing holiday details.

### Changes Required:

#### 1. Holiday Detail Sheet
**File**: `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-detail-sheet.tsx`

```typescript
'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, CalendarDays, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useHoliday, useDepartment } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayDetailSheetProps {
  holidayId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (holiday: Holiday) => void
  onDelete: (holiday: Holiday) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function HolidayDetailSheet({
  holidayId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: HolidayDetailSheetProps) {
  const { data: holiday, isLoading } = useHoliday(holidayId || '', open && !!holidayId)

  // Fetch department details if holiday is department-specific
  const { data: department } = useDepartment(
    holiday?.department_id || '',
    open && !!holiday?.department_id
  )

  const formatDateDisplay = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'EEEE, MMMM d, yyyy')
  }

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Holiday Details</SheetTitle>
          <SheetDescription>View holiday information</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : holiday ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <CalendarDays className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{holiday.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDateDisplay(holiday.holiday_date)}
                  </p>
                </div>
                <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                  {holiday.is_half_day ? 'Half Day' : 'Full Day'}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Details</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Date" value={formatDateDisplay(holiday.holiday_date)} />
                  <DetailRow label="Name" value={holiday.name} />
                  <DetailRow
                    label="Type"
                    value={
                      <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                        {holiday.is_half_day ? 'Half Day' : 'Full Day'}
                      </Badge>
                    }
                  />
                </div>
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Scope</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label="Applies To"
                    value={
                      holiday.applies_to_all ? (
                        'All Employees'
                      ) : (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          <span>{department?.name || 'Specific Department'}</span>
                        </div>
                      )
                    }
                  />
                  {!holiday.applies_to_all && department && (
                    <DetailRow label="Department" value={`${department.name} (${department.code})`} />
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Timestamps</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label="Created" value={formatDateTime(holiday.created_at)} />
                  <DetailRow label="Last Updated" value={formatDateTime(holiday.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Close
          </Button>
          {holiday && (
            <>
              <Button variant="outline" onClick={() => onEdit(holiday)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="destructive" onClick={() => onDelete(holiday)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Detail sheet displays all holiday information
- [ ] Edit and Delete buttons work

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Create Component Index and Holiday Page

### Overview
Create the component index file and the main holiday management page.

### Changes Required:

#### 1. Component Index
**File**: `/home/tolga/projects/terp/apps/web/src/components/holidays/index.ts`

```typescript
export { HolidayDataTable } from './holiday-data-table'
export { HolidayYearCalendar } from './holiday-year-calendar'
export { HolidayFormSheet } from './holiday-form-sheet'
export { HolidayDetailSheet } from './holiday-detail-sheet'
```

#### 2. Holiday Management Page
**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/holidays/page.tsx`

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, CalendarDays, List, CalendarRange, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useHolidays, useDeleteHoliday } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { YearSelector } from '@/components/vacation/year-selector'
import {
  HolidayDataTable,
  HolidayYearCalendar,
  HolidayFormSheet,
  HolidayDetailSheet,
} from '@/components/holidays'
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

export default function HolidaysPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // View mode and filters
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('calendar')
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [search, setSearch] = React.useState('')

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createDefaultDate, setCreateDefaultDate] = React.useState<Date | null>(null)
  const [editHoliday, setEditHoliday] = React.useState<Holiday | null>(null)
  const [viewHoliday, setViewHoliday] = React.useState<Holiday | null>(null)
  const [deleteHoliday, setDeleteHoliday] = React.useState<Holiday | null>(null)

  // Fetch holidays for selected year
  const { data: holidaysData, isLoading } = useHolidays({
    year,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteHoliday()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const holidays = holidaysData ?? []

  // Filter by search (client-side)
  const filteredHolidays = React.useMemo(() => {
    if (!search.trim()) return holidays

    const searchLower = search.toLowerCase()
    return holidays.filter((h) => h.name.toLowerCase().includes(searchLower))
  }, [holidays, search])

  const handleView = (holiday: Holiday) => {
    setViewHoliday(holiday)
  }

  const handleEdit = (holiday: Holiday) => {
    setEditHoliday(holiday)
    setViewHoliday(null)
  }

  const handleDelete = (holiday: Holiday) => {
    setDeleteHoliday(holiday)
  }

  const handleDateClick = (date: Date) => {
    setCreateDefaultDate(date)
    setCreateOpen(true)
  }

  const handleHolidayClick = (holiday: Holiday) => {
    setViewHoliday(holiday)
  }

  const handleConfirmDelete = async () => {
    if (!deleteHoliday) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteHoliday.id },
      })
      setDeleteHoliday(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditHoliday(null)
    setCreateDefaultDate(null)
  }

  const hasFilters = Boolean(search)

  if (authLoading) {
    return <HolidaysPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Holidays</h1>
          <p className="text-muted-foreground">
            Manage public holidays and company-wide days off
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Holiday
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <YearSelector value={year} onChange={setYear} className="w-[120px]" />

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search holidays..."
          className="w-full sm:w-64"
        />

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        )}

        {/* View mode toggle */}
        <div className="ml-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'calendar')}>
            <TabsList>
              <TabsTrigger value="calendar">
                <CalendarRange className="mr-2 h-4 w-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="list">
                <List className="mr-2 h-4 w-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Holiday count */}
      <div className="text-sm text-muted-foreground">
        {filteredHolidays.length} holiday{filteredHolidays.length !== 1 ? 's' : ''} in {year}
      </div>

      {/* Content */}
      <Card>
        <CardContent className={viewMode === 'calendar' ? 'p-4' : 'p-0'}>
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : viewMode === 'calendar' ? (
            filteredHolidays.length === 0 && !hasFilters ? (
              <EmptyState onCreateClick={() => setCreateOpen(true)} />
            ) : (
              <HolidayYearCalendar
                year={year}
                holidays={filteredHolidays}
                onHolidayClick={handleHolidayClick}
                onDateClick={handleDateClick}
              />
            )
          ) : filteredHolidays.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <HolidayDataTable
              holidays={filteredHolidays}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <HolidayFormSheet
        open={createOpen || !!editHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditHoliday(null)
            setCreateDefaultDate(null)
          }
        }}
        holiday={editHoliday}
        defaultDate={createDefaultDate}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <HolidayDetailSheet
        holidayId={viewHoliday?.id ?? null}
        open={!!viewHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setViewHoliday(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteHoliday(null)
          }
        }}
        title="Delete Holiday"
        description={
          deleteHoliday
            ? `Are you sure you want to delete "${deleteHoliday.name}"? This action cannot be undone.`
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
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  return (
    <div className="text-center py-12 px-6">
      <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No holidays found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search'
          : 'Get started by creating your first holiday'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Add Holiday
        </Button>
      )}
    </div>
  )
}

function HolidaysPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-[120px]" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40 ml-auto" />
      </div>

      {/* Content */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Page loads at `/admin/holidays`
- [ ] List and calendar views work
- [ ] Create, edit, delete operations work

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 7: Add Sidebar Navigation Entry

### Overview
Add the holidays management link to the admin sidebar navigation.

### Changes Required:

#### 1. Update Sidebar Navigation Config
**File**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add the `CalendarHeart` import and a new entry in the Management section:

```typescript
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Clock,
  Calendar,
  CalendarDays,
  CalendarHeart, // Add this import
  Users,
  UsersRound,
  Building2,
  Briefcase,
  Settings,
  FileText,
  CalendarOff,
  Palmtree,
  UserCog,
  Shield,
} from 'lucide-react'
```

Add the holidays entry to the Management section (after Day Plans):

```typescript
{
  title: 'Management',
  roles: ['admin'],
  items: [
    // ... existing items ...
    {
      title: 'Day Plans',
      href: '/admin/day-plans',
      icon: CalendarDays,
      roles: ['admin'],
      description: 'Configure work schedules',
    },
    {
      title: 'Holidays',
      href: '/admin/holidays',
      icon: CalendarHeart,
      roles: ['admin'],
      description: 'Manage public holidays',
    },
  ],
},
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm typecheck`
- [ ] Linting passes: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] "Holidays" link appears in admin sidebar under Management section
- [ ] Clicking the link navigates to `/admin/holidays`
- [ ] Icon displays correctly

**Implementation Note**: After completing this phase and all automated verification passes, the feature is complete. Proceed to final verification.

---

## Testing Strategy

### Unit Tests:
- Not required for this ticket (following existing pattern - no unit tests for admin pages)

### Integration Tests:
- Not required for this ticket (following existing pattern)

### Manual Testing Steps:
1. Navigate to `/admin/holidays` via sidebar
2. Verify calendar view shows 12 months for current year
3. Change year using year selector - verify holidays update
4. Click "New Holiday" - verify form opens
5. Create a full-day holiday - verify it appears in calendar (red)
6. Create a half-day holiday - verify it appears with different styling (light red)
7. Click on a holiday in calendar - verify detail sheet opens
8. Edit a holiday - verify changes are saved
9. Delete a holiday - verify confirmation dialog and deletion
10. Switch to list view - verify table displays holidays
11. Search for a holiday - verify filtering works
12. Test department-specific holiday creation

## Performance Considerations

- Year calendar renders 12 months with ~365 days - performance should be acceptable
- Holiday data is fetched once per year - no pagination needed for typical usage
- Search is client-side filtering (acceptable for <100 holidays/year)

## Migration Notes

- No database migrations required (schema already exists)
- No data migration needed

## References

- Research document: `thoughts/shared/research/2026-01-26-NOK-231-holiday-management.md`
- Department page pattern: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx`
- Hooks pattern: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`
- Existing calendar: `/home/tolga/projects/terp/apps/web/src/components/ui/calendar.tsx`
