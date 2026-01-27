# NOK-230: Tariff Management Implementation Plan

## Overview

Implement a tariff management page in the Next.js frontend that allows administrators to create, view, edit, and copy tariffs. Tariffs define employment contract terms including week plan assignments and break deduction rules. This follows the established patterns from day-plans, departments, and teams management pages.

## Current State Analysis

### Backend Status
- Tariff model, repository, service, and handler exist in `/home/tolga/projects/terp/apps/api/internal/`
- OpenAPI spec defined in `/home/tolga/projects/terp/api/paths/tariffs.yaml` and `/home/tolga/projects/terp/api/schemas/tariffs.yaml`
- Week plan endpoints defined in `/home/tolga/projects/terp/api/paths/week-plans.yaml`
- All backend CRUD operations are ready

### Frontend Status
- No tariff hooks exist yet
- No week plan hooks exist yet
- No tariff components exist
- Generated TypeScript types available in `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

### Key Discoveries
- Pattern: Day-plans page (`/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx`) provides complete reference for admin pages
- Pattern: Team form sheet (`/home/tolga/projects/terp/apps/web/src/components/teams/team-form-sheet.tsx`) shows reference selector with `__none__` value pattern
- Pattern: API hooks use `useApiQuery` and `useApiMutation` with `invalidateKeys` for cache invalidation
- Tariff breaks follow same pattern as day plan breaks but are simpler (no time window, just threshold-based)

## Desired End State

A fully functional tariff management page at `/admin/tariffs` with:
1. Data table showing all tariffs with filtering by status
2. Form sheet for creating/editing tariffs with week plan selector
3. Detail sheet showing tariff information and breaks
4. Copy functionality to duplicate tariffs
5. Inline break management in detail sheet (add/remove breaks)

### Verification Criteria
- Navigate to `/admin/tariffs` and see list of tariffs
- Create a new tariff with a week plan assigned
- Edit an existing tariff
- Add breaks to a tariff
- Delete breaks from a tariff
- Copy a tariff with new code/name
- Delete a tariff
- Filter tariffs by active status
- Search tariffs by code or name

## What We're NOT Doing

- Week plan management page (separate ticket)
- Tariff assignment to employees (employee management ticket)
- Advanced break configuration UI (keep simple like backend)
- Bulk operations
- Import/export functionality

## Implementation Approach

Follow the established patterns exactly:
1. Create API hooks first (tariffs and week-plans for selector)
2. Create components following day-plans structure
3. Create the page component
4. Wire everything together

---

## Phase 1: Create API Hooks

### Overview
Create the API hooks for tariffs and week-plans (for selector dropdown).

### Changes Required

#### 1. Week Plans Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-week-plans.ts` (new file)

```typescript
import { useApiQuery } from '@/hooks'

interface UseWeekPlansOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of week plans with optional filters.
 * Used primarily for week plan selector dropdowns.
 */
export function useWeekPlans(options: UseWeekPlansOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/week-plans', {
    params: {
      active,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single week plan by ID.
 */
export function useWeekPlan(id: string, enabled = true) {
  return useApiQuery('/week-plans/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

#### 2. Tariffs Hook
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-tariffs.ts` (new file)

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseTariffsOptions {
  active?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of tariffs with optional filters.
 */
export function useTariffs(options: UseTariffsOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/tariffs', {
    params: {
      active,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single tariff by ID with breaks.
 */
export function useTariff(id: string, enabled = true) {
  return useApiQuery('/tariffs/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new tariff.
 */
export function useCreateTariff() {
  return useApiMutation('/tariffs', 'post', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to update an existing tariff.
 */
export function useUpdateTariff() {
  return useApiMutation('/tariffs/{id}', 'put', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to delete a tariff.
 */
export function useDeleteTariff() {
  return useApiMutation('/tariffs/{id}', 'delete', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to add a break to a tariff.
 */
export function useCreateTariffBreak() {
  return useApiMutation('/tariffs/{id}/breaks', 'post', {
    invalidateKeys: [['/tariffs']],
  })
}

/**
 * Hook to delete a break from a tariff.
 */
export function useDeleteTariffBreak() {
  return useApiMutation('/tariffs/{id}/breaks/{breakId}', 'delete', {
    invalidateKeys: [['/tariffs']],
  })
}
```

#### 3. Update Hooks Index
**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Add exports:
```typescript
// Week Plans
export { useWeekPlans, useWeekPlan } from './use-week-plans'

// Tariffs
export {
  useTariffs,
  useTariff,
  useCreateTariff,
  useUpdateTariff,
  useDeleteTariff,
  useCreateTariffBreak,
  useDeleteTariffBreak,
} from './use-tariffs'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm build`
- [ ] No linting errors: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Hooks can be imported in test file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Create Tariff Data Table Component

### Overview
Create the data table component for displaying tariffs in a list view.

### Changes Required

#### 1. Tariff Data Table
**File**: `/home/tolga/projects/terp/apps/web/src/components/tariffs/tariff-data-table.tsx` (new file)

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
import { formatDate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface TariffDataTableProps {
  tariffs: Tariff[]
  isLoading: boolean
  onView: (tariff: Tariff) => void
  onEdit: (tariff: Tariff) => void
  onDelete: (tariff: Tariff) => void
  onCopy: (tariff: Tariff) => void
}

export function TariffDataTable({
  tariffs,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: TariffDataTableProps) {
  if (isLoading) {
    return <TariffDataTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-40">Week Plan</TableHead>
          <TableHead className="w-28">Valid From</TableHead>
          <TableHead className="w-28">Valid To</TableHead>
          <TableHead className="w-20">Breaks</TableHead>
          <TableHead className="w-20">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tariffs.map((tariff) => (
          <TableRow
            key={tariff.id}
            className="cursor-pointer"
            onClick={() => onView(tariff)}
          >
            <TableCell className="font-mono text-sm">{tariff.code}</TableCell>
            <TableCell className="font-medium">{tariff.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {tariff.week_plan ? (
                <span>{tariff.week_plan.code} - {tariff.week_plan.name}</span>
              ) : (
                <span className="text-muted-foreground/60">-</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {tariff.valid_from ? formatDate(tariff.valid_from) : '-'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {tariff.valid_to ? formatDate(tariff.valid_to) : '-'}
            </TableCell>
            <TableCell>{tariff.breaks?.length ?? 0}</TableCell>
            <TableCell>
              <Badge variant={tariff.is_active ? 'default' : 'secondary'}>
                {tariff.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(tariff)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(tariff)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(tariff)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(tariff)}
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

function TariffDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-40"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-8" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm build`
- [ ] No linting errors: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Component renders correctly when imported

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Create Tariff Form Sheet Component

### Overview
Create the form sheet for creating and editing tariffs with week plan selector.

### Changes Required

#### 1. Tariff Form Sheet
**File**: `/home/tolga/projects/terp/apps/web/src/components/tariffs/tariff-form-sheet.tsx` (new file)

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
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
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCreateTariff, useUpdateTariff, useTariff, useWeekPlans } from '@/hooks/api'
import { parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface TariffFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tariff?: Tariff | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  weekPlanId: string
  validFrom: Date | undefined
  validTo: Date | undefined
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  weekPlanId: '',
  validFrom: undefined,
  validTo: undefined,
  isActive: true,
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push('Code is required')
  if (form.code.length > 20) errors.push('Code must be 20 characters or less')
  if (!form.name.trim()) errors.push('Name is required')
  if (form.name.length > 255) errors.push('Name must be 255 characters or less')
  if (form.validFrom && form.validTo && form.validFrom > form.validTo) {
    errors.push('Valid To must be after Valid From')
  }
  return errors
}

export function TariffFormSheet({
  open,
  onOpenChange,
  tariff,
  onSuccess,
}: TariffFormSheetProps) {
  const isEdit = !!tariff
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Fetch full tariff details when editing
  const { data: fullTariff } = useTariff(tariff?.id ?? '', open && isEdit)

  // Fetch week plans for selector
  const { data: weekPlansData, isLoading: loadingWeekPlans } = useWeekPlans({
    active: true,
    enabled: open,
  })
  const weekPlans = weekPlansData?.data ?? []

  const createMutation = useCreateTariff()
  const updateMutation = useUpdateTariff()

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setError(null)
      if (fullTariff) {
        setForm({
          code: fullTariff.code,
          name: fullTariff.name,
          description: fullTariff.description ?? '',
          weekPlanId: fullTariff.week_plan_id ?? '',
          validFrom: fullTariff.valid_from ? parseISODate(fullTariff.valid_from) : undefined,
          validTo: fullTariff.valid_to ? parseISODate(fullTariff.valid_to) : undefined,
          isActive: fullTariff.is_active ?? true,
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, fullTariff, isEdit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && tariff) {
        await updateMutation.mutateAsync({
          path: { id: tariff.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            week_plan_id: form.weekPlanId || undefined,
            valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
            valid_to: form.validTo ? format(form.validTo, 'yyyy-MM-dd') : undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            week_plan_id: form.weekPlanId || undefined,
            valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
            valid_to: form.validTo ? format(form.validTo, 'yyyy-MM-dd') : undefined,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} tariff`)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Tariff' : 'Create Tariff'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update tariff settings and week plan assignment.'
              : 'Create a new tariff for employee contracts.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      disabled={isEdit || isPending}
                      placeholder="e.g., TARIFF-001"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={isPending}
                      placeholder="e.g., Standard Full-Time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    disabled={isPending}
                    placeholder="Optional description..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Week Plan Assignment */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Week Plan</h3>

                <div className="space-y-2">
                  <Label>Assigned Week Plan</Label>
                  <Select
                    value={form.weekPlanId || '__none__'}
                    onValueChange={(value) =>
                      setForm({ ...form, weekPlanId: value === '__none__' ? '' : value })
                    }
                    disabled={isPending || loadingWeekPlans}
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
                  <p className="text-xs text-muted-foreground">
                    The week plan defines the employee&apos;s regular schedule
                  </p>
                </div>
              </div>

              {/* Validity Period */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Validity Period</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valid From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !form.validFrom && 'text-muted-foreground'
                          )}
                          disabled={isPending}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.validFrom ? format(form.validFrom, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.validFrom}
                          onSelect={(date) => setForm({ ...form, validFrom: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Valid To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !form.validTo && 'text-muted-foreground'
                          )}
                          disabled={isPending}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.validTo ? format(form.validTo, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.validTo}
                          onSelect={(date) => setForm({ ...form, validTo: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty for no time restriction
                </p>
              </div>

              {/* Status */}
              {isEdit && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Status</h3>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Active</Label>
                      <p className="text-sm text-muted-foreground">
                        Inactive tariffs cannot be assigned to employees
                      </p>
                    </div>
                    <Switch
                      id="isActive"
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Tariff'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm build`
- [ ] No linting errors: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Form sheet opens correctly
- [ ] Week plan selector shows available week plans

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Create Tariff Detail Sheet Component

### Overview
Create the detail sheet for viewing tariff information including breaks management.

### Changes Required

#### 1. Tariff Detail Sheet
**File**: `/home/tolga/projects/terp/apps/web/src/components/tariffs/tariff-detail-sheet.tsx` (new file)

```typescript
'use client'

import * as React from 'react'
import { Edit, Trash2, Copy, Clock, Calendar, Settings, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { DurationInput } from '@/components/ui/duration-input'
import { useTariff, useCreateTariffBreak, useDeleteTariffBreak } from '@/hooks/api'
import { formatDate, formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']
type TariffBreak = components['schemas']['TariffBreak']

interface TariffDetailSheetProps {
  tariffId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (tariff: Tariff) => void
  onDelete: (tariff: Tariff) => void
  onCopy: (tariff: Tariff) => void
}

const BREAK_TYPE_LABELS: Record<string, string> = {
  fixed: 'Fixed',
  variable: 'Variable',
  minimum: 'Minimum',
}

export function TariffDetailSheet({
  tariffId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: TariffDetailSheetProps) {
  const { data: tariff, isLoading, refetch } = useTariff(tariffId ?? '', open && !!tariffId)

  // Break management state
  const [showAddBreak, setShowAddBreak] = React.useState(false)
  const [newBreak, setNewBreak] = React.useState({
    breakType: 'minimum' as 'fixed' | 'variable' | 'minimum',
    afterWorkMinutes: 300,
    duration: 30,
    isPaid: false,
  })

  const createBreakMutation = useCreateTariffBreak()
  const deleteBreakMutation = useDeleteTariffBreak()

  const handleAddBreak = async () => {
    if (!tariff) return
    try {
      await createBreakMutation.mutateAsync({
        path: { id: tariff.id },
        body: {
          break_type: newBreak.breakType,
          after_work_minutes: newBreak.breakType === 'minimum' ? newBreak.afterWorkMinutes : undefined,
          duration: newBreak.duration,
          is_paid: newBreak.isPaid,
        },
      })
      setShowAddBreak(false)
      setNewBreak({ breakType: 'minimum', afterWorkMinutes: 300, duration: 30, isPaid: false })
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  const handleDeleteBreak = async (breakItem: TariffBreak) => {
    if (!tariff) return
    try {
      await deleteBreakMutation.mutateAsync({
        path: { id: tariff.id, breakId: breakItem.id },
      })
      refetch()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        {isLoading ? (
          <DetailSheetSkeleton />
        ) : tariff ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="flex items-center gap-2">
                    {tariff.name}
                    <Badge variant={tariff.is_active ? 'default' : 'secondary'}>
                      {tariff.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    <span className="font-mono">{tariff.code}</span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
              <div className="space-y-6">
                {/* Basic Information */}
                <Section title="Basic Information" icon={Settings}>
                  {tariff.description && (
                    <DetailRow label="Description" value={tariff.description} />
                  )}
                </Section>

                {/* Week Plan */}
                <Section title="Week Plan" icon={Calendar}>
                  <DetailRow
                    label="Assigned Plan"
                    value={
                      tariff.week_plan ? (
                        <span>
                          <span className="font-mono">{tariff.week_plan.code}</span> - {tariff.week_plan.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )
                    }
                  />
                </Section>

                {/* Validity Period */}
                <Section title="Validity Period" icon={Calendar}>
                  <DetailRow
                    label="Valid From"
                    value={tariff.valid_from ? formatDate(tariff.valid_from) : 'Not set'}
                  />
                  <DetailRow
                    label="Valid To"
                    value={tariff.valid_to ? formatDate(tariff.valid_to) : 'Not set'}
                  />
                </Section>

                {/* Breaks Section */}
                <Section title="Break Deductions" icon={Clock}>
                  {tariff.breaks && tariff.breaks.length > 0 ? (
                    <div className="space-y-3">
                      {tariff.breaks.map((brk) => (
                        <div key={brk.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline">{BREAK_TYPE_LABELS[brk.break_type]}</Badge>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{formatDuration(brk.duration)}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteBreak(brk)}
                                disabled={deleteBreakMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {brk.break_type === 'minimum' && brk.after_work_minutes != null && (
                            <div className="text-muted-foreground">
                              After {formatDuration(brk.after_work_minutes)} work
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            {brk.is_paid && <span>Paid break</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No breaks configured</p>
                  )}

                  {/* Add Break Form */}
                  {showAddBreak ? (
                    <div className="border rounded-lg p-4 space-y-4 mt-4">
                      <h4 className="text-sm font-medium">Add Break</h4>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Break Type</Label>
                          <Select
                            value={newBreak.breakType}
                            onValueChange={(v) =>
                              setNewBreak({ ...newBreak, breakType: v as 'fixed' | 'variable' | 'minimum' })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed</SelectItem>
                              <SelectItem value="variable">Variable</SelectItem>
                              <SelectItem value="minimum">Minimum</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Duration</Label>
                          <DurationInput
                            value={newBreak.duration}
                            onChange={(v) => setNewBreak({ ...newBreak, duration: v ?? 0 })}
                            format="minutes"
                            className="w-full"
                          />
                        </div>
                      </div>

                      {newBreak.breakType === 'minimum' && (
                        <div className="space-y-2">
                          <Label>After Work Time (minutes)</Label>
                          <DurationInput
                            value={newBreak.afterWorkMinutes}
                            onChange={(v) => setNewBreak({ ...newBreak, afterWorkMinutes: v ?? 0 })}
                            format="hhmm"
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Break is deducted after this much work time
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Paid Break</Label>
                          <p className="text-xs text-muted-foreground">Break time counts as work time</p>
                        </div>
                        <Switch
                          checked={newBreak.isPaid}
                          onCheckedChange={(c) => setNewBreak({ ...newBreak, isPaid: c })}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddBreak(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAddBreak}
                          disabled={createBreakMutation.isPending}
                          className="flex-1"
                        >
                          {createBreakMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Add Break
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddBreak(true)}
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Break
                    </Button>
                  )}
                </Section>
              </div>
            </ScrollArea>

            <div className="flex gap-2 mt-4 border-t pt-4">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(tariff)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="outline" onClick={() => onCopy(tariff)}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(tariff)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">Tariff not found</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
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

function DetailRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function DetailSheetSkeleton() {
  return (
    <>
      <SheetHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32 mt-1" />
      </SheetHeader>
      <div className="space-y-6 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-5 w-32 mb-3" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm build`
- [ ] No linting errors: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Detail sheet displays tariff information
- [ ] Breaks are displayed correctly
- [ ] Add break form works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Create Copy Tariff Dialog

### Overview
Create the dialog for copying a tariff with a new code and name.

### Changes Required

#### 1. Copy Tariff Dialog
**File**: `/home/tolga/projects/terp/apps/web/src/components/tariffs/copy-tariff-dialog.tsx` (new file)

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateTariff, useTariff } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface CopyTariffDialogProps {
  tariff: Tariff | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyTariffDialog({ tariff, open, onOpenChange }: CopyTariffDialogProps) {
  const [newCode, setNewCode] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  // Fetch full tariff details to get all data for copying
  const { data: fullTariff } = useTariff(tariff?.id ?? '', open && !!tariff)

  const createMutation = useCreateTariff()

  // Initialize fields when dialog opens
  React.useEffect(() => {
    if (open && tariff) {
      setNewCode(`${tariff.code}-COPY`)
      setNewName(`${tariff.name} (Copy)`)
      setError(null)
    }
  }, [open, tariff])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!tariff || !fullTariff) return

    if (!newCode.trim()) {
      setError('Code is required')
      return
    }
    if (!newName.trim()) {
      setError('Name is required')
      return
    }

    try {
      // Create new tariff with same properties but new code/name
      await createMutation.mutateAsync({
        body: {
          code: newCode.trim(),
          name: newName.trim(),
          description: fullTariff.description || undefined,
          week_plan_id: fullTariff.week_plan_id || undefined,
          valid_from: fullTariff.valid_from || undefined,
          valid_to: fullTariff.valid_to || undefined,
        },
      })
      // Note: Breaks need to be copied separately if needed
      // For MVP, we just copy the base tariff
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to copy tariff')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy Tariff</DialogTitle>
          <DialogDescription>
            Create a copy of &ldquo;{tariff?.name}&rdquo; with a new code and name.
            Break rules will need to be added separately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newCode">New Code *</Label>
              <Input
                id="newCode"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g., TARIFF-002"
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newName">New Name *</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Standard Tariff (Copy)"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Copy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

#### 2. Create Index File
**File**: `/home/tolga/projects/terp/apps/web/src/components/tariffs/index.ts` (new file)

```typescript
export { TariffDataTable } from './tariff-data-table'
export { TariffFormSheet } from './tariff-form-sheet'
export { TariffDetailSheet } from './tariff-detail-sheet'
export { CopyTariffDialog } from './copy-tariff-dialog'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm build`
- [ ] No linting errors: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Copy dialog opens and shows correct fields
- [ ] Copy creates new tariff

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Create Tariffs Page

### Overview
Create the main tariffs management page that ties all components together.

### Changes Required

#### 1. Tariffs Page
**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/tariffs/page.tsx` (new file)

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useTariffs, useDeleteTariff } from '@/hooks/api'
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
import {
  TariffDataTable,
  TariffFormSheet,
  TariffDetailSheet,
  CopyTariffDialog,
} from '@/components/tariffs'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

export default function TariffsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTariff, setEditTariff] = React.useState<Tariff | null>(null)
  const [viewTariff, setViewTariff] = React.useState<Tariff | null>(null)
  const [deleteTariff, setDeleteTariff] = React.useState<Tariff | null>(null)
  const [copyTariff, setCopyTariff] = React.useState<Tariff | null>(null)

  // Fetch tariffs
  const { data, isLoading, isFetching } = useTariffs({
    active: activeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteTariff()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const tariffs = React.useMemo(() => {
    let list = data?.data ?? []
    if (search) {
      const searchLower = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.code.toLowerCase().includes(searchLower) ||
          t.name.toLowerCase().includes(searchLower)
      )
    }
    return list
  }, [data?.data, search])

  const handleView = (tariff: Tariff) => {
    setViewTariff(tariff)
  }

  const handleEdit = (tariff: Tariff) => {
    setEditTariff(tariff)
    setViewTariff(null)
  }

  const handleDelete = (tariff: Tariff) => {
    setDeleteTariff(tariff)
  }

  const handleCopy = (tariff: Tariff) => {
    setCopyTariff(tariff)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTariff) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteTariff.id },
      })
      setDeleteTariff(null)
      setViewTariff(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditTariff(null)
  }

  const hasFilters = Boolean(search) || activeFilter !== undefined

  if (authLoading) {
    return <TariffsPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tariffs</h1>
          <p className="text-muted-foreground">
            Manage employment contract tariffs and break rules
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Tariff
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

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
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
          ) : tariffs.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <TariffDataTable
              tariffs={tariffs}
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
      <TariffFormSheet
        open={createOpen || !!editTariff}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditTariff(null)
          }
        }}
        tariff={editTariff}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <TariffDetailSheet
        tariffId={viewTariff?.id ?? null}
        open={!!viewTariff}
        onOpenChange={(open) => {
          if (!open) setViewTariff(null)
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />

      {/* Copy Dialog */}
      <CopyTariffDialog
        tariff={copyTariff}
        open={!!copyTariff}
        onOpenChange={(open) => {
          if (!open) setCopyTariff(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTariff}
        onOpenChange={(open) => {
          if (!open) setDeleteTariff(null)
        }}
        title="Delete Tariff"
        description={
          deleteTariff
            ? `Are you sure you want to delete "${deleteTariff.name}" (${deleteTariff.code})? This action cannot be undone.`
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
      <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No tariffs found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Get started by creating your first tariff'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Tariff
        </Button>
      )}
    </div>
  )
}

function TariffsPageSkeleton() {
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
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && pnpm build`
- [ ] No linting errors: `cd apps/web && pnpm lint`

#### Manual Verification:
- [ ] Navigate to `/admin/tariffs` and page loads
- [ ] Create new tariff
- [ ] View tariff details
- [ ] Edit tariff
- [ ] Add break to tariff
- [ ] Delete break from tariff
- [ ] Copy tariff
- [ ] Delete tariff
- [ ] Filter by active status
- [ ] Search by code/name

**Implementation Note**: After completing this phase and all automated verification passes, perform full manual testing before marking the ticket as complete.

---

## Testing Strategy

### Unit Tests
- API hooks return correct data structures
- Form validation logic
- Date formatting

### Integration Tests
- Create tariff flow
- Edit tariff flow
- Add/remove breaks flow
- Copy tariff flow
- Delete tariff flow

### Manual Testing Steps
1. Navigate to `/admin/tariffs`
2. Click "New Tariff" and fill in form
3. Select a week plan from dropdown
4. Set validity dates
5. Create tariff
6. Click on tariff to view details
7. Add a minimum break (e.g., 30 min after 5 hours)
8. Edit tariff and change name
9. Copy tariff with new code
10. Delete the copied tariff
11. Filter list by active status
12. Search for tariff by code
13. Verify week plan shows in data table

## Performance Considerations

- Week plans are fetched only when form sheet opens (`enabled: open`)
- Data table uses memoization for filtered list
- API cache invalidation on mutations

## References

- Research document: `thoughts/shared/research/2026-01-26-NOK-230-tariff-management.md`
- Day Plans page: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/day-plans/page.tsx`
- Day Plan components: `/home/tolga/projects/terp/apps/web/src/components/day-plans/`
- Team form (selector pattern): `/home/tolga/projects/terp/apps/web/src/components/teams/team-form-sheet.tsx`
- API hooks pattern: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts`
