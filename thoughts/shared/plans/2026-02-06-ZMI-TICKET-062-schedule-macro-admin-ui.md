# Implementation Plan: Schedule & Macro Admin UI (ZMI-TICKET-062)

## Overview

This plan implements admin UI for managing scheduled tasks and macros:

- **Schedules**: CRUD with timing configuration (seconds/minutes/hours/daily/weekly/monthly/manual), task management, and execution logs
- **Macros**: CRUD with weekly/monthly types, tariff/employee assignments, and execution logs

The implementation follows existing admin patterns (orders, activities) and uses generated OpenAPI types.

---

## Phase 1: API Hooks

### Files
- `apps/web/src/hooks/api/use-schedules.ts` (create)
- `apps/web/src/hooks/api/use-macros.ts` (create)
- `apps/web/src/hooks/api/index.ts` (modify)

### Implementation Details

#### 1.1 Schedule Hooks (`use-schedules.ts`)

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

// === Query Options Types ===
interface UseSchedulesOptions {
  enabled?: boolean
}

// === Schedule CRUD ===
export function useSchedules(options: UseSchedulesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/schedules', { enabled })
}

export function useSchedule(id: string, enabled = true) {
  return useApiQuery('/schedules/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateSchedule() {
  return useApiMutation('/schedules', 'post', {
    invalidateKeys: [['/schedules']],
  })
}

export function useUpdateSchedule() {
  return useApiMutation('/schedules/{id}', 'patch', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}']],
  })
}

export function useDeleteSchedule() {
  return useApiMutation('/schedules/{id}', 'delete', {
    invalidateKeys: [['/schedules']],
  })
}

// === Schedule Tasks ===
export function useScheduleTasks(scheduleId: string, enabled = true) {
  return useApiQuery('/schedules/{id}/tasks', {
    path: { id: scheduleId },
    enabled: enabled && !!scheduleId,
  })
}

export function useCreateScheduleTask() {
  return useApiMutation('/schedules/{id}/tasks', 'post', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}'], ['/schedules/{id}/tasks']],
  })
}

export function useUpdateScheduleTask() {
  return useApiMutation('/schedules/{id}/tasks/{taskId}', 'patch', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}'], ['/schedules/{id}/tasks']],
  })
}

export function useDeleteScheduleTask() {
  return useApiMutation('/schedules/{id}/tasks/{taskId}', 'delete', {
    invalidateKeys: [['/schedules'], ['/schedules/{id}'], ['/schedules/{id}/tasks']],
  })
}

// === Schedule Execution ===
export function useExecuteSchedule() {
  return useApiMutation('/schedules/{id}/execute', 'post', {
    invalidateKeys: [['/schedules/{id}'], ['/schedules/{id}/executions']],
  })
}

export function useScheduleExecutions(scheduleId: string, enabled = true) {
  return useApiQuery('/schedules/{id}/executions', {
    path: { id: scheduleId },
    enabled: enabled && !!scheduleId,
  })
}

export function useScheduleExecution(id: string, enabled = true) {
  return useApiQuery('/schedule-executions/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// === Task Catalog ===
export function useTaskCatalog(enabled = true) {
  return useApiQuery('/scheduler/task-catalog', { enabled })
}
```

#### 1.2 Macro Hooks (`use-macros.ts`)

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseMacrosOptions {
  enabled?: boolean
}

// === Macro CRUD ===
export function useMacros(options: UseMacrosOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/macros', { enabled })
}

export function useMacro(id: string, enabled = true) {
  return useApiQuery('/macros/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateMacro() {
  return useApiMutation('/macros', 'post', {
    invalidateKeys: [['/macros']],
  })
}

export function useUpdateMacro() {
  return useApiMutation('/macros/{id}', 'patch', {
    invalidateKeys: [['/macros'], ['/macros/{id}']],
  })
}

export function useDeleteMacro() {
  return useApiMutation('/macros/{id}', 'delete', {
    invalidateKeys: [['/macros']],
  })
}

// === Macro Assignments ===
export function useMacroAssignments(macroId: string, enabled = true) {
  return useApiQuery('/macros/{id}/assignments', {
    path: { id: macroId },
    enabled: enabled && !!macroId,
  })
}

export function useCreateMacroAssignment() {
  return useApiMutation('/macros/{id}/assignments', 'post', {
    invalidateKeys: [['/macros'], ['/macros/{id}'], ['/macros/{id}/assignments']],
  })
}

export function useUpdateMacroAssignment() {
  return useApiMutation('/macros/{id}/assignments/{assignmentId}', 'patch', {
    invalidateKeys: [['/macros'], ['/macros/{id}'], ['/macros/{id}/assignments']],
  })
}

export function useDeleteMacroAssignment() {
  return useApiMutation('/macros/{id}/assignments/{assignmentId}', 'delete', {
    invalidateKeys: [['/macros'], ['/macros/{id}'], ['/macros/{id}/assignments']],
  })
}

// === Macro Execution ===
export function useExecuteMacro() {
  return useApiMutation('/macros/{id}/execute', 'post', {
    invalidateKeys: [['/macros/{id}'], ['/macros/{id}/executions']],
  })
}

export function useMacroExecutions(macroId: string, enabled = true) {
  return useApiQuery('/macros/{id}/executions', {
    path: { id: macroId },
    enabled: enabled && !!macroId,
  })
}

export function useMacroExecution(id: string, enabled = true) {
  return useApiQuery('/macro-executions/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

#### 1.3 Index Export Update

Add to `apps/web/src/hooks/api/index.ts`:

```typescript
// Schedules
export {
  useSchedules,
  useSchedule,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useScheduleTasks,
  useCreateScheduleTask,
  useUpdateScheduleTask,
  useDeleteScheduleTask,
  useExecuteSchedule,
  useScheduleExecutions,
  useScheduleExecution,
  useTaskCatalog,
} from './use-schedules'

// Macros
export {
  useMacros,
  useMacro,
  useCreateMacro,
  useUpdateMacro,
  useDeleteMacro,
  useMacroAssignments,
  useCreateMacroAssignment,
  useUpdateMacroAssignment,
  useDeleteMacroAssignment,
  useExecuteMacro,
  useMacroExecutions,
  useMacroExecution,
} from './use-macros'
```

### Verification
- [ ] TypeScript compiles without errors
- [ ] Hooks can be imported from `@/hooks/api`
- [ ] Run: `cd apps/web && npm run lint` passes
- [ ] Manual test: Console log `useSchedules()` and `useMacros()` in a test component

---

## Phase 2: Schedule Components

### Files
- `apps/web/src/components/schedules/index.ts` (create)
- `apps/web/src/components/schedules/schedule-timing-badge.tsx` (create)
- `apps/web/src/components/schedules/schedule-status-badge.tsx` (create)
- `apps/web/src/components/schedules/schedule-data-table.tsx` (create)
- `apps/web/src/components/schedules/schedule-form-sheet.tsx` (create)
- `apps/web/src/components/schedules/schedule-task-list.tsx` (create)
- `apps/web/src/components/schedules/schedule-task-form-dialog.tsx` (create)
- `apps/web/src/components/schedules/schedule-execution-log.tsx` (create)

### Implementation Details

#### 2.1 Type Definitions (at top of each component)

```typescript
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']
type ScheduleTask = components['schemas']['ScheduleTask']
type ScheduleExecution = components['schemas']['ScheduleExecution']
type TimingConfig = components['schemas']['TimingConfig']
type TaskCatalogEntry = components['schemas']['TaskCatalogEntry']
type TimingType = NonNullable<Schedule['timing_type']>
type ExecutionStatus = NonNullable<ScheduleExecution['status']>
```

#### 2.2 Timing Badge (`schedule-timing-badge.tsx`)

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']
type TimingType = NonNullable<Schedule['timing_type']>
type TimingConfig = components['schemas']['TimingConfig']

interface ScheduleTimingBadgeProps {
  timingType: TimingType
  timingConfig?: TimingConfig
}

const timingStyleConfig: Record<TimingType, string> = {
  seconds: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  minutes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  hours: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  daily: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  weekly: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  monthly: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  manual: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ScheduleTimingBadge({ timingType, timingConfig }: ScheduleTimingBadgeProps) {
  const t = useTranslations('adminSchedules')

  const getLabel = (): string => {
    switch (timingType) {
      case 'seconds':
        return t('timingSeconds', { interval: timingConfig?.interval ?? 0 })
      case 'minutes':
        return t('timingMinutes', { interval: timingConfig?.interval ?? 0 })
      case 'hours':
        return t('timingHours', { interval: timingConfig?.interval ?? 0 })
      case 'daily':
        return t('timingDaily', { time: timingConfig?.time ?? '00:00' })
      case 'weekly':
        return t('timingWeekly', {
          day: DAYS_OF_WEEK[timingConfig?.day_of_week ?? 0],
          time: timingConfig?.time ?? '00:00',
        })
      case 'monthly':
        return t('timingMonthly', {
          day: timingConfig?.day_of_month ?? 1,
          time: timingConfig?.time ?? '00:00',
        })
      case 'manual':
        return t('timingManual')
      default:
        return timingType
    }
  }

  return (
    <Badge variant="secondary" className={timingStyleConfig[timingType]}>
      {getLabel()}
    </Badge>
  )
}
```

#### 2.3 Status Badge (`schedule-status-badge.tsx`)

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type ScheduleExecution = components['schemas']['ScheduleExecution']
type ExecutionStatus = NonNullable<ScheduleExecution['status']>

interface ScheduleStatusBadgeProps {
  status: ExecutionStatus
}

const statusStyleConfig: Record<ExecutionStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export function ScheduleStatusBadge({ status }: ScheduleStatusBadgeProps) {
  const t = useTranslations('adminSchedules')
  return (
    <Badge variant="secondary" className={statusStyleConfig[status]}>
      {t(`status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
    </Badge>
  )
}
```

#### 2.4 Data Table (`schedule-data-table.tsx`)

```typescript
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ScheduleTimingBadge } from './schedule-timing-badge'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']

interface ScheduleDataTableProps {
  items: Schedule[]
  isLoading: boolean
  onView: (item: Schedule) => void
  onEdit: (item: Schedule) => void
  onDelete: (item: Schedule) => void
  onToggleEnabled?: (item: Schedule, enabled: boolean) => void
}

export function ScheduleDataTable({
  items, isLoading, onView, onEdit, onDelete, onToggleEnabled,
}: ScheduleDataTableProps) {
  const t = useTranslations('adminSchedules')

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnTimingType')}</TableHead>
          <TableHead>{t('columnActive')}</TableHead>
          <TableHead>{t('columnTaskCount')}</TableHead>
          <TableHead>{t('columnLastRun')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
              {t('noSchedules')}
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => onView(item)}
            >
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <ScheduleTimingBadge
                  timingType={item.timing_type!}
                  timingConfig={item.timing_config}
                />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={item.is_enabled ?? false}
                  onCheckedChange={(checked) => onToggleEnabled?.(item, checked)}
                />
              </TableCell>
              <TableCell>{item.tasks?.length ?? 0}</TableCell>
              <TableCell>
                {item.last_run_at
                  ? new Date(item.last_run_at).toLocaleString()
                  : t('neverRun')}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(item)}>
                      {t('actionView')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      {t('actionEdit')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(item)}
                    >
                      {t('actionDelete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
```

#### 2.5 Form Sheet (`schedule-form-sheet.tsx`)

Key implementation points:
- Dynamic fields based on `timing_type` selection
- `interval` field for seconds/minutes/hours
- `time` field for daily/weekly/monthly
- `day_of_week` select for weekly (0-6)
- `day_of_month` select for monthly (1-31)
- No timing config for manual

```typescript
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useCreateSchedule, useUpdateSchedule } from '@/hooks/api'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']
type TimingType = NonNullable<Schedule['timing_type']>

interface ScheduleFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule?: Schedule | null
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  timingType: TimingType
  interval: number
  time: string
  dayOfWeek: number
  dayOfMonth: number
  isEnabled: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  timingType: 'daily',
  interval: 60,
  time: '00:00',
  dayOfWeek: 1,
  dayOfMonth: 1,
  isEnabled: true,
}

const TIMING_TYPES: TimingType[] = [
  'seconds', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'manual',
]

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function ScheduleFormSheet({
  open, onOpenChange, schedule, onSuccess,
}: ScheduleFormSheetProps) {
  const t = useTranslations('adminSchedules')
  const isEdit = !!schedule
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateSchedule()
  const updateMutation = useUpdateSchedule()

  React.useEffect(() => {
    if (open) {
      if (schedule) {
        setForm({
          name: schedule.name ?? '',
          description: schedule.description ?? '',
          timingType: schedule.timing_type ?? 'daily',
          interval: schedule.timing_config?.interval ?? 60,
          time: schedule.timing_config?.time ?? '00:00',
          dayOfWeek: schedule.timing_config?.day_of_week ?? 1,
          dayOfMonth: schedule.timing_config?.day_of_month ?? 1,
          isEnabled: schedule.is_enabled ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, schedule])

  const buildTimingConfig = () => {
    switch (form.timingType) {
      case 'seconds':
      case 'minutes':
      case 'hours':
        return { interval: form.interval }
      case 'daily':
        return { time: form.time }
      case 'weekly':
        return { time: form.time, day_of_week: form.dayOfWeek }
      case 'monthly':
        return { time: form.time, day_of_month: form.dayOfMonth }
      case 'manual':
      default:
        return {}
    }
  }

  const handleSubmit = async () => {
    setError(null)
    const payload = {
      name: form.name,
      description: form.description || null,
      timing_type: form.timingType,
      timing_config: buildTimingConfig(),
      is_enabled: form.isEnabled,
    }

    try {
      if (isEdit && schedule) {
        await updateMutation.mutateAsync({ path: { id: schedule.id! }, body: payload })
      } else {
        await createMutation.mutateAsync({ body: payload })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editSchedule') : t('newSchedule')}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">{t('fieldName')}</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('fieldNamePlaceholder')}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">{t('fieldDescription')}</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('fieldDescriptionPlaceholder')}
              />
            </div>

            {/* Timing Type */}
            <div className="space-y-2">
              <Label htmlFor="timingType">{t('fieldTimingType')}</Label>
              <Select
                value={form.timingType}
                onValueChange={(v) => setForm({ ...form, timingType: v as TimingType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`timingType${type.charAt(0).toUpperCase() + type.slice(1)}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Timing Config Fields */}
            {['seconds', 'minutes', 'hours'].includes(form.timingType) && (
              <div className="space-y-2">
                <Label htmlFor="interval">{t('fieldInterval')}</Label>
                <Input
                  id="interval"
                  type="number"
                  min={1}
                  value={form.interval}
                  onChange={(e) => setForm({ ...form, interval: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
            )}

            {['daily', 'weekly', 'monthly'].includes(form.timingType) && (
              <div className="space-y-2">
                <Label htmlFor="time">{t('fieldTime')}</Label>
                <Input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
            )}

            {form.timingType === 'weekly' && (
              <div className="space-y-2">
                <Label htmlFor="dayOfWeek">{t('fieldDayOfWeek')}</Label>
                <Select
                  value={String(form.dayOfWeek)}
                  onValueChange={(v) => setForm({ ...form, dayOfWeek: parseInt(v, 10) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.timingType === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="dayOfMonth">{t('fieldDayOfMonth')}</Label>
                <Select
                  value={String(form.dayOfMonth)}
                  onValueChange={(v) => setForm({ ...form, dayOfMonth: parseInt(v, 10) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(31)].map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="isEnabled">{t('fieldEnabled')}</Label>
              <Switch
                id="isEnabled"
                checked={form.isEnabled}
                onCheckedChange={(checked) => setForm({ ...form, isEnabled: checked })}
              />
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.name || createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 2.6 Task List (`schedule-task-list.tsx`)

Features:
- Display tasks in order
- Task type badge
- Parameters display
- Enable/disable toggle
- Delete button
- Add task button (opens dialog)

#### 2.7 Task Form Dialog (`schedule-task-form-dialog.tsx`)

Features:
- Task type selector from task catalog API
- Dynamic parameter fields based on task type schema
- Sort order input

#### 2.8 Execution Log (`schedule-execution-log.tsx`)

Features:
- Read-only table of executions
- Status badge, timestamps, duration calculation
- Error message display
- "Execute Now" button at top

#### 2.9 Index Export (`schedules/index.ts`)

```typescript
export { ScheduleTimingBadge } from './schedule-timing-badge'
export { ScheduleStatusBadge } from './schedule-status-badge'
export { ScheduleDataTable } from './schedule-data-table'
export { ScheduleFormSheet } from './schedule-form-sheet'
export { ScheduleTaskList } from './schedule-task-list'
export { ScheduleTaskFormDialog } from './schedule-task-form-dialog'
export { ScheduleExecutionLog } from './schedule-execution-log'
```

### Verification
- [ ] All components compile without TypeScript errors
- [ ] Components render correctly in Storybook or test page
- [ ] Badge colors display properly in both light/dark mode
- [ ] Form sheet opens/closes and fields are interactive
- [ ] Run: `cd apps/web && npm run lint` passes

---

## Phase 3: Schedule Pages

### Files
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx` (create)
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx` (create)

### Implementation Details

#### 3.1 List Page (`schedules/page.tsx`)

Follow orders page pattern:
- Admin role check with redirect
- Search filter
- Create button opens form sheet
- Data table with view/edit/delete actions
- Confirm dialog for delete
- Navigation to detail page on row click

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useSchedules, useDeleteSchedule, useUpdateSchedule } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ScheduleDataTable, ScheduleFormSheet } from '@/components/schedules'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']

export default function SchedulesPage() {
  const router = useRouter()
  const t = useTranslations('adminSchedules')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Schedule | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Schedule | null>(null)

  const { data, isLoading } = useSchedules({ enabled: !authLoading && isAdmin })
  const deleteMutation = useDeleteSchedule()
  const updateMutation = useUpdateSchedule()

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const filteredItems = React.useMemo(() => {
    if (!data?.items) return []
    if (!search) return data.items
    const query = search.toLowerCase()
    return data.items.filter((item) =>
      item.name?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query)
    )
  }, [data?.items, search])

  const handleView = (item: Schedule) => {
    router.push(`/admin/schedules/${item.id}`)
  }

  const handleEdit = (item: Schedule) => {
    setEditItem(item)
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    await deleteMutation.mutateAsync({ path: { id: deleteItem.id! } })
    setDeleteItem(null)
  }

  const handleToggleEnabled = async (item: Schedule, enabled: boolean) => {
    await updateMutation.mutateAsync({
      path: { id: item.id! },
      body: { is_enabled: enabled },
    })
  }

  if (authLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newSchedule')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('searchPlaceholder')}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ScheduleDataTable
            items={filteredItems}
            isLoading={isLoading}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={setDeleteItem}
            onToggleEnabled={handleToggleEnabled}
          />
        </CardContent>
      </Card>

      <ScheduleFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        schedule={editItem}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => !open && setDeleteItem(null)}
        title={t('deleteSchedule')}
        description={t('deleteDescription', { name: deleteItem?.name ?? '' })}
        onConfirm={handleDelete}
        confirmLabel={t('delete')}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
```

#### 3.2 Detail Page (`schedules/[id]/page.tsx`)

Features:
- Back button navigation
- Schedule info header
- Edit/Delete buttons
- Tabs: "Tasks" and "Executions"
- Tasks tab: ScheduleTaskList with add/edit/delete
- Executions tab: ScheduleExecutionLog with Execute Now button

```typescript
'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Pencil, Trash2, Play } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useSchedule, useDeleteSchedule, useExecuteSchedule,
  useScheduleExecutions,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  ScheduleTimingBadge, ScheduleFormSheet,
  ScheduleTaskList, ScheduleExecutionLog,
} from '@/components/schedules'

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('adminSchedules')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const { data: schedule, isLoading } = useSchedule(params.id, !authLoading && isAdmin)
  const { data: executions } = useScheduleExecutions(params.id, !authLoading && isAdmin)
  const deleteMutation = useDeleteSchedule()
  const executeMutation = useExecuteSchedule()

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ path: { id: params.id } })
    router.push('/admin/schedules')
  }

  const handleExecute = async () => {
    try {
      await executeMutation.mutateAsync({ path: { id: params.id } })
      toast.success(t('executionStarted'))
    } catch {
      toast.error(t('executionFailed'))
    }
  }

  if (authLoading || isLoading) {
    return <Skeleton className="h-[600px] w-full" />
  }

  if (!schedule) {
    return <div>{t('notFound')}</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/admin/schedules')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{schedule.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <ScheduleTimingBadge
              timingType={schedule.timing_type!}
              timingConfig={schedule.timing_config}
            />
            {schedule.is_enabled ? (
              <span className="text-sm text-green-600">{t('statusEnabled')}</span>
            ) : (
              <span className="text-sm text-muted-foreground">{t('statusDisabled')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExecute} disabled={executeMutation.isPending}>
            <Play className="mr-2 h-4 w-4" />
            {t('executeNow')}
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('actionEdit')}
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('actionDelete')}
          </Button>
        </div>
      </div>

      {/* Description */}
      {schedule.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{schedule.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">{t('tabTasks')}</TabsTrigger>
          <TabsTrigger value="executions">{t('tabExecutions')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <ScheduleTaskList scheduleId={params.id} tasks={schedule.tasks ?? []} />
        </TabsContent>

        <TabsContent value="executions" className="mt-6">
          <ScheduleExecutionLog executions={executions?.items ?? []} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ScheduleFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        schedule={schedule}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteSchedule')}
        description={t('deleteDescription', { name: schedule.name ?? '' })}
        onConfirm={handleDelete}
        confirmLabel={t('delete')}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
```

### Verification
- [ ] List page loads and displays schedules
- [ ] Search filters schedules by name
- [ ] Create form opens and creates new schedule
- [ ] Edit form opens pre-populated and updates schedule
- [ ] Delete confirmation dialog works
- [ ] Detail page loads with tabs
- [ ] Tasks tab displays and manages tasks
- [ ] Executions tab displays execution history
- [ ] Execute Now button triggers execution
- [ ] Run: `cd apps/web && npm run build` passes

---

## Phase 4: Macro Components

### Files
- `apps/web/src/components/macros/index.ts` (create)
- `apps/web/src/components/macros/macro-type-badge.tsx` (create)
- `apps/web/src/components/macros/macro-action-badge.tsx` (create)
- `apps/web/src/components/macros/macro-status-badge.tsx` (create)
- `apps/web/src/components/macros/macro-data-table.tsx` (create)
- `apps/web/src/components/macros/macro-form-sheet.tsx` (create)
- `apps/web/src/components/macros/macro-assignment-list.tsx` (create)
- `apps/web/src/components/macros/macro-assignment-form-dialog.tsx` (create)
- `apps/web/src/components/macros/macro-execution-log.tsx` (create)

### Implementation Details

#### 4.1 Type Badge (`macro-type-badge.tsx`)

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['Macro']
type MacroType = NonNullable<Macro['macro_type']>

interface MacroTypeBadgeProps {
  type: MacroType
}

const typeStyleConfig: Record<MacroType, string> = {
  weekly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  monthly: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export function MacroTypeBadge({ type }: MacroTypeBadgeProps) {
  const t = useTranslations('adminMacros')
  return (
    <Badge variant="secondary" className={typeStyleConfig[type]}>
      {t(`type${type.charAt(0).toUpperCase() + type.slice(1)}`)}
    </Badge>
  )
}
```

#### 4.2 Action Badge (`macro-action-badge.tsx`)

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['Macro']
type ActionType = NonNullable<Macro['action_type']>

interface MacroActionBadgeProps {
  action: ActionType
}

const actionStyleConfig: Record<ActionType, string> = {
  log_message: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  recalculate_target_hours: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reset_flextime: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  carry_forward_balance: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
}

export function MacroActionBadge({ action }: MacroActionBadgeProps) {
  const t = useTranslations('adminMacros')
  const key = action.split('_').map((s, i) =>
    i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
  ).join('')
  return (
    <Badge variant="secondary" className={actionStyleConfig[action]}>
      {t(`action${key.charAt(0).toUpperCase() + key.slice(1)}`)}
    </Badge>
  )
}
```

#### 4.3 Data Table (`macro-data-table.tsx`)

Similar structure to schedule data table:
- Columns: Name, Type (badge), Action Type (badge), Active, Assignment Count, Actions

#### 4.4 Form Sheet (`macro-form-sheet.tsx`)

Features:
- Name, description fields
- Macro type select (weekly/monthly)
- Action type select
- Action parameters (JSON or dynamic fields based on action type)
- Active toggle

#### 4.5 Assignment List (`macro-assignment-list.tsx`)

Features:
- Table of assignments
- Target column shows tariff name or employee name
- Execution day column
- Active toggle
- Edit/Delete actions
- Add assignment button

#### 4.6 Assignment Form Dialog (`macro-assignment-form-dialog.tsx`)

Features:
- Radio toggle: "By Tariff" / "By Employee"
- Tariff selector (when by tariff selected)
- Employee selector (when by employee selected)
- Execution day picker (0-6 for weekly, 1-31 for monthly based on parent macro type)
- Active toggle

#### 4.7 Execution Log (`macro-execution-log.tsx`)

Similar to schedule execution log:
- Read-only table
- Status badges
- Timestamps and duration

#### 4.8 Index Export (`macros/index.ts`)

```typescript
export { MacroTypeBadge } from './macro-type-badge'
export { MacroActionBadge } from './macro-action-badge'
export { MacroStatusBadge } from './macro-status-badge'
export { MacroDataTable } from './macro-data-table'
export { MacroFormSheet } from './macro-form-sheet'
export { MacroAssignmentList } from './macro-assignment-list'
export { MacroAssignmentFormDialog } from './macro-assignment-form-dialog'
export { MacroExecutionLog } from './macro-execution-log'
```

### Verification
- [ ] All macro components compile without errors
- [ ] Type and action badges display correctly
- [ ] Form sheet handles both create and edit modes
- [ ] Assignment form toggles between tariff/employee correctly
- [ ] Run: `cd apps/web && npm run lint` passes

---

## Phase 5: Macro Pages

### Files
- `apps/web/src/app/[locale]/(dashboard)/admin/macros/page.tsx` (create)
- `apps/web/src/app/[locale]/(dashboard)/admin/macros/[id]/page.tsx` (create)

### Implementation Details

#### 5.1 List Page (`macros/page.tsx`)

Same pattern as schedules page:
- Admin role check
- Search filter
- Create/Edit/Delete functionality
- Navigate to detail on row click

#### 5.2 Detail Page (`macros/[id]/page.tsx`)

Features:
- Header with macro info, type badge, action badge
- Edit/Delete/Execute Now buttons
- Tabs: "Assignments" and "Executions"
- Assignments tab: MacroAssignmentList with add/edit/delete
- Executions tab: MacroExecutionLog

### Verification
- [ ] List page loads and displays macros
- [ ] CRUD operations work correctly
- [ ] Detail page loads with tabs
- [ ] Assignments can be added/edited/deleted
- [ ] Execute Now triggers execution
- [ ] Run: `cd apps/web && npm run build` passes

---

## Phase 6: Navigation & Translations

### Files
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (modify)
- `apps/web/messages/en.json` (modify)
- `apps/web/messages/de.json` (modify)

### Implementation Details

#### 6.1 Sidebar Navigation

Add to administration section in `sidebar-nav-config.ts`:

```typescript
import { Clock, Repeat } from 'lucide-react'

// In the administration section items array:
{
  titleKey: 'schedules',
  href: '/admin/schedules',
  icon: Clock,
  roles: ['admin'],
},
{
  titleKey: 'macros',
  href: '/admin/macros',
  icon: Repeat,
  roles: ['admin'],
},
```

#### 6.2 English Translations (`en.json`)

Add nav keys:
```json
{
  "nav": {
    "schedules": "Schedules",
    "macros": "Macros"
  }
}
```

Add adminSchedules namespace:
```json
{
  "adminSchedules": {
    "title": "Schedules",
    "subtitle": "Configure scheduled tasks and timing",
    "newSchedule": "New Schedule",
    "editSchedule": "Edit Schedule",
    "deleteSchedule": "Delete Schedule",
    "deleteDescription": "Are you sure you want to delete schedule \"{name}\"? This action cannot be undone.",
    "searchPlaceholder": "Search schedules...",
    "noSchedules": "No schedules found",
    "neverRun": "Never",
    "columnName": "Name",
    "columnTimingType": "Timing",
    "columnActive": "Active",
    "columnTaskCount": "Tasks",
    "columnLastRun": "Last Run",
    "columnActions": "Actions",
    "actionView": "View",
    "actionEdit": "Edit",
    "actionDelete": "Delete",
    "fieldName": "Name",
    "fieldNamePlaceholder": "Enter schedule name",
    "fieldDescription": "Description",
    "fieldDescriptionPlaceholder": "Optional description",
    "fieldTimingType": "Timing Type",
    "fieldInterval": "Interval",
    "fieldTime": "Time",
    "fieldDayOfWeek": "Day of Week",
    "fieldDayOfMonth": "Day of Month",
    "fieldEnabled": "Enabled",
    "timingTypeSeconds": "Seconds",
    "timingTypeMinutes": "Minutes",
    "timingTypeHours": "Hours",
    "timingTypeDaily": "Daily",
    "timingTypeWeekly": "Weekly",
    "timingTypeMonthly": "Monthly",
    "timingTypeManual": "Manual",
    "timingSeconds": "Every {interval} seconds",
    "timingMinutes": "Every {interval} minutes",
    "timingHours": "Every {interval} hours",
    "timingDaily": "Daily at {time}",
    "timingWeekly": "{day} at {time}",
    "timingMonthly": "Day {day} at {time}",
    "timingManual": "Manual",
    "statusEnabled": "Enabled",
    "statusDisabled": "Disabled",
    "statusPending": "Pending",
    "statusRunning": "Running",
    "statusCompleted": "Completed",
    "statusFailed": "Failed",
    "statusPartial": "Partial",
    "tabTasks": "Tasks",
    "tabExecutions": "Executions",
    "executeNow": "Execute Now",
    "executionStarted": "Schedule execution started",
    "executionFailed": "Failed to start execution",
    "notFound": "Schedule not found",
    "cancel": "Cancel",
    "create": "Create",
    "saveChanges": "Save Changes",
    "delete": "Delete",
    "addTask": "Add Task",
    "editTask": "Edit Task",
    "deleteTask": "Delete Task",
    "taskType": "Task Type",
    "taskParameters": "Parameters",
    "taskSortOrder": "Sort Order",
    "noTasks": "No tasks configured",
    "noExecutions": "No executions yet"
  }
}
```

Add adminMacros namespace:
```json
{
  "adminMacros": {
    "title": "Macros",
    "subtitle": "Configure weekly and monthly automated actions",
    "newMacro": "New Macro",
    "editMacro": "Edit Macro",
    "deleteMacro": "Delete Macro",
    "deleteDescription": "Are you sure you want to delete macro \"{name}\"? This action cannot be undone.",
    "searchPlaceholder": "Search macros...",
    "noMacros": "No macros found",
    "columnName": "Name",
    "columnType": "Type",
    "columnActionType": "Action",
    "columnActive": "Active",
    "columnAssignments": "Assignments",
    "columnActions": "Actions",
    "actionView": "View",
    "actionEdit": "Edit",
    "actionDelete": "Delete",
    "fieldName": "Name",
    "fieldNamePlaceholder": "Enter macro name",
    "fieldDescription": "Description",
    "fieldDescriptionPlaceholder": "Optional description",
    "fieldMacroType": "Macro Type",
    "fieldActionType": "Action Type",
    "fieldActionParams": "Action Parameters",
    "fieldActive": "Active",
    "typeWeekly": "Weekly",
    "typeMonthly": "Monthly",
    "actionLogMessage": "Log Message",
    "actionRecalculateTargetHours": "Recalculate Target Hours",
    "actionResetFlextime": "Reset Flextime",
    "actionCarryForwardBalance": "Carry Forward Balance",
    "statusEnabled": "Enabled",
    "statusDisabled": "Disabled",
    "statusPending": "Pending",
    "statusRunning": "Running",
    "statusCompleted": "Completed",
    "statusFailed": "Failed",
    "tabAssignments": "Assignments",
    "tabExecutions": "Executions",
    "executeNow": "Execute Now",
    "executionStarted": "Macro execution started",
    "executionFailed": "Failed to start execution",
    "notFound": "Macro not found",
    "cancel": "Cancel",
    "create": "Create",
    "saveChanges": "Save Changes",
    "delete": "Delete",
    "addAssignment": "Add Assignment",
    "editAssignment": "Edit Assignment",
    "deleteAssignment": "Delete Assignment",
    "assignmentTarget": "Target",
    "assignmentTargetType": "Target Type",
    "assignByTariff": "By Tariff",
    "assignByEmployee": "By Employee",
    "selectTariff": "Select Tariff",
    "selectEmployee": "Select Employee",
    "executionDay": "Execution Day",
    "noAssignments": "No assignments configured",
    "noExecutions": "No executions yet"
  }
}
```

#### 6.3 German Translations (`de.json`)

Add corresponding German translations for all keys above.

### Verification
- [ ] Sidebar shows Schedules and Macros links for admin users
- [ ] Navigation works correctly
- [ ] All UI text is translated
- [ ] No translation keys shown as raw keys
- [ ] Switch locale and verify German translations work

---

## Phase 7: Integration Testing

### Manual Test Cases

#### 7.1 Schedule CRUD Flow
1. Navigate to /admin/schedules
2. Click "New Schedule"
3. Fill form: name="Daily Backup", timing_type=daily, time="02:00"
4. Save and verify it appears in list
5. Click row to view detail
6. Add a task of type "backup_database"
7. Click "Execute Now" and verify execution appears in log
8. Edit schedule name
9. Delete schedule

#### 7.2 Macro CRUD Flow
1. Navigate to /admin/macros
2. Click "New Macro"
3. Fill form: name="Monthly Flextime Reset", type=monthly, action=reset_flextime
4. Save and verify it appears in list
5. Click row to view detail
6. Add assignment: by tariff, select a tariff, day=1
7. Click "Execute Now" and verify execution log
8. Add assignment by employee
9. Edit macro
10. Delete macro

#### 7.3 Edge Cases
- [ ] Create schedule with each timing type
- [ ] Verify timing config fields change dynamically
- [ ] Test search filtering
- [ ] Test enable/disable toggles
- [ ] Verify execution logs show correct status
- [ ] Test error handling for failed executions

### Verification
- [ ] All CRUD operations work for schedules
- [ ] All CRUD operations work for macros
- [ ] Task management works within schedules
- [ ] Assignment management works within macros
- [ ] Manual execution triggers work
- [ ] Execution logs display correctly
- [ ] Navigation between list and detail works
- [ ] Error states are handled gracefully

---

## Success Criteria

The implementation is complete when:

1. **Pages exist and are accessible:**
   - `/admin/schedules` - List all schedules
   - `/admin/schedules/[id]` - Schedule detail with Tasks/Executions tabs
   - `/admin/macros` - List all macros
   - `/admin/macros/[id]` - Macro detail with Assignments/Executions tabs

2. **Full CRUD operations work:**
   - Schedules: Create, Read, Update, Delete
   - Schedule Tasks: Add, Update, Remove, Reorder
   - Macros: Create, Read, Update, Delete
   - Macro Assignments: Create, Update, Delete

3. **UI features function correctly:**
   - Dynamic timing config fields based on timing_type
   - Task catalog integration for adding tasks
   - Tariff/Employee selector toggle for assignments
   - Execute Now buttons trigger executions
   - Execution logs display with status badges

4. **Navigation and translations:**
   - Sidebar shows Schedules and Macros links (admin only)
   - All text is translatable (en.json, de.json)

5. **Code quality:**
   - TypeScript compiles without errors
   - Lint passes with no warnings
   - Build succeeds
   - Follows existing code patterns

---

## File Summary

### New Files (24)
| Path | Type |
|------|------|
| `apps/web/src/hooks/api/use-schedules.ts` | API hooks |
| `apps/web/src/hooks/api/use-macros.ts` | API hooks |
| `apps/web/src/components/schedules/index.ts` | Export |
| `apps/web/src/components/schedules/schedule-timing-badge.tsx` | Component |
| `apps/web/src/components/schedules/schedule-status-badge.tsx` | Component |
| `apps/web/src/components/schedules/schedule-data-table.tsx` | Component |
| `apps/web/src/components/schedules/schedule-form-sheet.tsx` | Component |
| `apps/web/src/components/schedules/schedule-task-list.tsx` | Component |
| `apps/web/src/components/schedules/schedule-task-form-dialog.tsx` | Component |
| `apps/web/src/components/schedules/schedule-execution-log.tsx` | Component |
| `apps/web/src/components/macros/index.ts` | Export |
| `apps/web/src/components/macros/macro-type-badge.tsx` | Component |
| `apps/web/src/components/macros/macro-action-badge.tsx` | Component |
| `apps/web/src/components/macros/macro-status-badge.tsx` | Component |
| `apps/web/src/components/macros/macro-data-table.tsx` | Component |
| `apps/web/src/components/macros/macro-form-sheet.tsx` | Component |
| `apps/web/src/components/macros/macro-assignment-list.tsx` | Component |
| `apps/web/src/components/macros/macro-assignment-form-dialog.tsx` | Component |
| `apps/web/src/components/macros/macro-execution-log.tsx` | Component |
| `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx` | Page |
| `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx` | Page |
| `apps/web/src/app/[locale]/(dashboard)/admin/macros/page.tsx` | Page |
| `apps/web/src/app/[locale]/(dashboard)/admin/macros/[id]/page.tsx` | Page |

### Modified Files (4)
| Path | Changes |
|------|---------|
| `apps/web/src/hooks/api/index.ts` | Add schedule and macro hook exports |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add nav items |
| `apps/web/messages/en.json` | Add translation keys |
| `apps/web/messages/de.json` | Add translation keys |
