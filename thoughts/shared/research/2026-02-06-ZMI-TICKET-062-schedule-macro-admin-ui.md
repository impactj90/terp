# ZMI-TICKET-062: Schedule & Macro Admin UI - Research Document

## Overview

This document provides comprehensive research for implementing the Schedule & Macro Admin UI feature, which includes:
- Schedule management with CRUD, task management, timing configuration, execution logs
- Macro management with CRUD, assignments (tariff/employee), execution logs
- API hooks for schedules and macros
- Data tables, form sheets, and various UI components

---

## 1. Existing Admin Page Patterns

### 1.1 Page Structure

Admin pages follow a consistent pattern. Reference: `/apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx`

**Standard List Page Pattern:**
```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useOrders, useDeleteOrder } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderDataTable, OrderFormSheet } from '@/components/orders'

export default function OrdersPage() {
  const router = useRouter()
  const t = useTranslations('adminOrders')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // State
  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Order | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Order | null>(null)

  // Data fetching
  const { data, isLoading } = useOrders({ enabled: !authLoading && isAdmin })
  const deleteMutation = useDeleteOrder()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // Filter logic, handlers, render...
}
```

### 1.2 Detail Page with Tabs

Reference: `/apps/web/src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`

**Pattern:**
```tsx
export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('adminOrders')

  const { data: order, isLoading } = useOrder(orderId, !authLoading && isAdmin)

  return (
    <div className="space-y-6">
      {/* Page header with back button, title, actions */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {/* Title, status badge, edit/delete buttons */}
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t('tabDetails')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          {/* Detail cards */}
        </TabsContent>

        <TabsContent value="assignments" className="mt-6 space-y-4">
          {/* Sub-entity management */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

## 2. Backend API Endpoints

### 2.1 Schedule Endpoints

**File:** `/api/paths/schedules.yaml`

| Method | Endpoint | Operation | Description |
|--------|----------|-----------|-------------|
| GET | `/schedules` | `listSchedules` | List all schedules |
| POST | `/schedules` | `createSchedule` | Create schedule |
| GET | `/schedules/{id}` | `getSchedule` | Get schedule with tasks |
| PATCH | `/schedules/{id}` | `updateSchedule` | Update schedule |
| DELETE | `/schedules/{id}` | `deleteSchedule` | Delete schedule |
| GET | `/schedules/{id}/tasks` | `listScheduleTasks` | List tasks |
| POST | `/schedules/{id}/tasks` | `addScheduleTask` | Add task |
| PATCH | `/schedules/{id}/tasks/{taskId}` | `updateScheduleTask` | Update task |
| DELETE | `/schedules/{id}/tasks/{taskId}` | `removeScheduleTask` | Remove task |
| POST | `/schedules/{id}/execute` | `triggerScheduleExecution` | Manual trigger |
| GET | `/schedules/{id}/executions` | `listScheduleExecutions` | List execution logs |
| GET | `/schedule-executions/{id}` | `getScheduleExecution` | Get execution detail |
| GET | `/scheduler/task-catalog` | `getTaskCatalog` | List available task types |

### 2.2 Schedule Schemas

**File:** `/api/schemas/schedules.yaml`

```yaml
Schedule:
  properties:
    id: uuid
    name: string
    description: string (nullable)
    timing_type: enum [seconds, minutes, hours, daily, weekly, monthly, manual]
    timing_config: TimingConfig
    is_enabled: boolean
    last_run_at: date-time (nullable)
    next_run_at: date-time (nullable)
    tasks: ScheduleTask[]

TimingConfig:
  properties:
    interval: integer  # for seconds/minutes/hours
    time: string       # HH:MM for daily/weekly/monthly
    day_of_week: integer (0-6)  # for weekly
    day_of_month: integer (1-31)  # for monthly

ScheduleTask:
  properties:
    id: uuid
    task_type: enum [calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check, terminal_sync, terminal_import]
    sort_order: integer
    parameters: object
    is_enabled: boolean

ScheduleExecution:
  properties:
    id: uuid
    status: enum [pending, running, completed, failed, partial]
    trigger_type: enum [scheduled, manual]
    started_at, completed_at: date-time
    error_message: string (nullable)
    tasks_total, tasks_succeeded, tasks_failed: integer
    task_executions: ScheduleTaskExecution[]

TaskCatalogEntry:
  properties:
    task_type: string
    name: string
    description: string
    parameter_schema: object
```

### 2.3 Macro Endpoints

**File:** `/api/paths/macros.yaml`

| Method | Endpoint | Operation | Description |
|--------|----------|-----------|-------------|
| GET | `/macros` | `listMacros` | List all macros |
| POST | `/macros` | `createMacro` | Create macro |
| GET | `/macros/{id}` | `getMacro` | Get macro |
| PATCH | `/macros/{id}` | `updateMacro` | Update macro |
| DELETE | `/macros/{id}` | `deleteMacro` | Delete macro |
| GET | `/macros/{id}/assignments` | `listMacroAssignments` | List assignments |
| POST | `/macros/{id}/assignments` | `createMacroAssignment` | Create assignment |
| PATCH | `/macros/{id}/assignments/{assignmentId}` | `updateMacroAssignment` | Update assignment |
| DELETE | `/macros/{id}/assignments/{assignmentId}` | `deleteMacroAssignment` | Delete assignment |
| POST | `/macros/{id}/execute` | `triggerMacroExecution` | Manual trigger |
| GET | `/macros/{id}/executions` | `listMacroExecutions` | List executions |
| GET | `/macro-executions/{id}` | `getMacroExecution` | Get execution detail |

### 2.4 Macro Schemas

**File:** `/api/schemas/macros.yaml`

```yaml
Macro:
  properties:
    id: uuid
    name: string
    description: string (nullable)
    macro_type: enum [weekly, monthly]
    action_type: enum [log_message, recalculate_target_hours, reset_flextime, carry_forward_balance]
    action_params: object
    is_active: boolean
    assignments: MacroAssignment[]

MacroAssignment:
  properties:
    id: uuid
    macro_id: uuid
    tariff_id: uuid (nullable)  # mutually exclusive
    employee_id: uuid (nullable)  # mutually exclusive
    execution_day: integer  # 0-6 for weekly, 1-31 for monthly
    is_active: boolean

MacroExecution:
  properties:
    id: uuid
    macro_id: uuid
    assignment_id: uuid (nullable)
    status: enum [pending, running, completed, failed]
    trigger_type: enum [scheduled, manual]
    started_at, completed_at: date-time
    result: object
    error_message: string (nullable)
```

---

## 3. API Hooks Patterns

### 3.1 Base Hooks

**Files:**
- `/apps/web/src/hooks/use-api-query.ts` - Type-safe GET queries
- `/apps/web/src/hooks/use-api-mutation.ts` - Type-safe mutations

**Usage Pattern:**
```typescript
// Query hook
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

// Mutation hook
export function useCreateSchedule() {
  return useApiMutation('/schedules', 'post', {
    invalidateKeys: [['/schedules']],
  })
}

export function useUpdateSchedule() {
  return useApiMutation('/schedules/{id}', 'patch', {
    invalidateKeys: [['/schedules']],
  })
}

export function useDeleteSchedule() {
  return useApiMutation('/schedules/{id}', 'delete', {
    invalidateKeys: [['/schedules']],
  })
}
```

### 3.2 Reference Implementation

**File:** `/apps/web/src/hooks/api/use-orders.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrdersOptions {
  active?: boolean
  status?: 'planned' | 'active' | 'completed' | 'cancelled'
  enabled?: boolean
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { active, status, enabled = true } = options
  return useApiQuery('/orders', {
    params: { active, status },
    enabled,
  })
}

export function useOrder(id: string, enabled = true) {
  return useApiQuery('/orders/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateOrder() {
  return useApiMutation('/orders', 'post', {
    invalidateKeys: [['/orders']],
  })
}

export function useUpdateOrder() {
  return useApiMutation('/orders/{id}', 'patch', {
    invalidateKeys: [['/orders']],
  })
}

export function useDeleteOrder() {
  return useApiMutation('/orders/{id}', 'delete', {
    invalidateKeys: [['/orders']],
  })
}
```

### 3.3 Hooks Index Export

**File:** `/apps/web/src/hooks/api/index.ts`

New hooks must be exported from this index file:
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
} from './use-macros'
```

---

## 4. UI Component Patterns

### 4.1 Data Table Component

**File:** `/apps/web/src/components/orders/order-data-table.tsx`

```tsx
interface OrderDataTableProps {
  items: Order[]
  isLoading: boolean
  onView: (item: Order) => void
  onEdit: (item: Order) => void
  onDelete: (item: Order) => void
}

export function OrderDataTable({ items, isLoading, onView, onEdit, onDelete }: OrderDataTableProps) {
  const t = useTranslations('adminOrders')

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnStatus')}</TableHead>
          {/* ... */}
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
            <TableCell>{item.name}</TableCell>
            <TableCell><OrderStatusBadge status={item.status} /></TableCell>
            {/* ... */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>View</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}>
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
```

### 4.2 Form Sheet Component

**File:** `/apps/web/src/components/orders/order-form-sheet.tsx`

```tsx
interface OrderFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: Order | null
  onSuccess?: () => void
}

export function OrderFormSheet({ open, onOpenChange, order, onSuccess }: OrderFormSheetProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!order
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrder()
  const updateMutation = useUpdateOrder()

  React.useEffect(() => {
    if (open) {
      if (order) {
        setForm({ /* populate from order */ })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, order])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editOrder') : t('newOrder')}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
          {/* Form fields */}
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>{t('cancel')}</Button>
          <Button onClick={handleSubmit}>{isEdit ? t('saveChanges') : t('create')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### 4.3 Badge Component

**File:** `/apps/web/src/components/orders/order-status-badge.tsx`

```tsx
const statusConfig: Record<NonNullable<OrderStatus>, { labelKey: string; className: string }> = {
  planned: {
    labelKey: 'statusPlanned',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
  active: {
    labelKey: 'statusActive',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  // ...
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const t = useTranslations('adminOrders')
  const config = statusConfig[status]
  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}
```

### 4.4 Component Index Export

**File:** `/apps/web/src/components/orders/index.ts`

```typescript
export { OrderStatusBadge } from './order-status-badge'
export { OrderDataTable } from './order-data-table'
export { OrderFormSheet } from './order-form-sheet'
// ... other exports
```

---

## 5. Navigation & Sidebar

### 5.1 Sidebar Configuration

**File:** `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

```typescript
import { Clock, Repeat } from 'lucide-react'

export const navConfig: NavSection[] = [
  // ... existing sections
  {
    titleKey: 'administration',
    roles: ['admin'],
    items: [
      // ... existing items
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
    ],
  },
]
```

### 5.2 Icon Import

Available icons from `lucide-react`:
- `Clock` - Good for schedules/timing
- `Repeat` - Good for macros/recurring actions
- `Timer` - Alternative for schedules
- `Play` - For execute actions
- `Calendar` - For scheduling

---

## 6. Translation Structure

### 6.1 Nav Translations

**File:** `/apps/web/messages/en.json`

Add to `"nav"` section:
```json
{
  "nav": {
    "schedules": "Schedules",
    "macros": "Macros"
  }
}
```

### 6.2 Admin Page Translations

Add new translation namespaces:

```json
{
  "adminSchedules": {
    "title": "Schedules",
    "subtitle": "Configure scheduled tasks and timing",
    "newSchedule": "New Schedule",
    "editSchedule": "Edit Schedule",
    "deleteSchedule": "Delete Schedule",
    "deleteDescription": "Are you sure you want to delete schedule \"{name}\"?",
    "searchPlaceholder": "Search schedules...",
    "columnName": "Name",
    "columnTimingType": "Timing",
    "columnInterval": "Interval",
    "columnActive": "Active",
    "columnTaskCount": "Tasks",
    "columnLastRun": "Last Run",
    "columnActions": "Actions",
    "timingSeconds": "Every {interval} seconds",
    "timingMinutes": "Every {interval} minutes",
    "timingHours": "Every {interval} hours",
    "timingDaily": "Daily at {time}",
    "timingWeekly": "{day} at {time}",
    "timingMonthly": "Day {day} at {time}",
    "timingManual": "Manual",
    "tabTasks": "Tasks",
    "tabExecutions": "Executions",
    "executeNow": "Execute Now",
    "executionStarted": "Execution started",
    "executionFailed": "Execution failed",
    "statusCompleted": "Completed",
    "statusFailed": "Failed",
    "statusRunning": "Running",
    "statusPending": "Pending"
  },
  "adminMacros": {
    "title": "Macros",
    "subtitle": "Configure weekly and monthly automated actions",
    "newMacro": "New Macro",
    "editMacro": "Edit Macro",
    "deleteMacro": "Delete Macro",
    "columnName": "Name",
    "columnType": "Type",
    "columnActionType": "Action",
    "columnActive": "Active",
    "columnAssignments": "Assignments",
    "typeWeekly": "Weekly",
    "typeMonthly": "Monthly",
    "actionLogMessage": "Log Message",
    "actionRecalculateTargetHours": "Recalculate Target Hours",
    "actionResetFlextime": "Reset Flextime",
    "actionCarryForwardBalance": "Carry Forward Balance",
    "tabAssignments": "Assignments",
    "tabExecutions": "Executions",
    "newAssignment": "New Assignment",
    "assignByTariff": "By Tariff",
    "assignByEmployee": "By Employee",
    "executionDay": "Execution Day"
  }
}
```

---

## 7. Implementation Recommendations

### 7.1 File Structure

```
apps/web/src/
├── app/[locale]/(dashboard)/admin/
│   ├── schedules/
│   │   ├── page.tsx                    # List page
│   │   └── [id]/
│   │       └── page.tsx                # Detail page with tabs
│   └── macros/
│       ├── page.tsx                    # List page
│       └── [id]/
│           └── page.tsx                # Detail page with tabs
├── components/
│   ├── schedules/
│   │   ├── index.ts
│   │   ├── schedule-data-table.tsx
│   │   ├── schedule-form-sheet.tsx
│   │   ├── schedule-timing-badge.tsx
│   │   ├── schedule-task-list.tsx
│   │   ├── schedule-task-form-dialog.tsx
│   │   └── schedule-execution-log.tsx
│   └── macros/
│       ├── index.ts
│       ├── macro-data-table.tsx
│       ├── macro-form-sheet.tsx
│       ├── macro-type-badge.tsx
│       ├── macro-action-badge.tsx
│       ├── macro-assignment-list.tsx
│       ├── macro-assignment-form-dialog.tsx
│       └── macro-execution-log.tsx
└── hooks/api/
    ├── use-schedules.ts
    └── use-macros.ts
```

### 7.2 Implementation Order

1. **API Hooks** (prerequisite for everything)
   - Create `use-schedules.ts` with all schedule hooks
   - Create `use-macros.ts` with all macro hooks
   - Export from `hooks/api/index.ts`

2. **Schedule Components**
   - `schedule-timing-badge.tsx` - Badge for timing types
   - `schedule-data-table.tsx` - List view
   - `schedule-form-sheet.tsx` - Create/edit form with dynamic timing config
   - `schedule-task-list.tsx` - Task management within schedule
   - `schedule-task-form-dialog.tsx` - Add/edit task
   - `schedule-execution-log.tsx` - Execution history table

3. **Macro Components**
   - `macro-type-badge.tsx` - Badge for weekly/monthly
   - `macro-action-badge.tsx` - Badge for action types
   - `macro-data-table.tsx` - List view
   - `macro-form-sheet.tsx` - Create/edit form
   - `macro-assignment-list.tsx` - Assignment management
   - `macro-assignment-form-dialog.tsx` - Add/edit assignment
   - `macro-execution-log.tsx` - Execution history

4. **Pages**
   - `/admin/schedules/page.tsx` - Schedule list
   - `/admin/schedules/[id]/page.tsx` - Schedule detail with Tasks/Executions tabs
   - `/admin/macros/page.tsx` - Macro list
   - `/admin/macros/[id]/page.tsx` - Macro detail with Assignments/Executions tabs

5. **Navigation & Translations**
   - Update sidebar-nav-config.ts
   - Add translations to en.json and de.json

### 7.3 Dynamic Form Fields Pattern

For schedule timing config, use conditional rendering based on timing_type:

```tsx
{form.timingType === 'seconds' && (
  <div className="space-y-2">
    <Label>{t('fieldInterval')}</Label>
    <Input type="number" value={form.interval} onChange={...} />
  </div>
)}

{form.timingType === 'daily' && (
  <div className="space-y-2">
    <Label>{t('fieldTime')}</Label>
    <Input type="time" value={form.time} onChange={...} />
  </div>
)}

{form.timingType === 'weekly' && (
  <>
    <div className="space-y-2">
      <Label>{t('fieldDayOfWeek')}</Label>
      <Select value={form.dayOfWeek} onValueChange={...}>
        {/* 0=Sunday to 6=Saturday */}
      </Select>
    </div>
    <div className="space-y-2">
      <Label>{t('fieldTime')}</Label>
      <Input type="time" value={form.time} onChange={...} />
    </div>
  </>
)}
```

### 7.4 Execution Log Pattern

For both schedule and macro execution logs, use a read-only table with status badges:

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>{t('columnStarted')}</TableHead>
      <TableHead>{t('columnCompleted')}</TableHead>
      <TableHead>{t('columnStatus')}</TableHead>
      <TableHead>{t('columnDuration')}</TableHead>
      <TableHead>{t('columnError')}</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {executions.map((exec) => (
      <TableRow key={exec.id}>
        <TableCell>{formatDateTime(exec.started_at)}</TableCell>
        <TableCell>{formatDateTime(exec.completed_at)}</TableCell>
        <TableCell><ExecutionStatusBadge status={exec.status} /></TableCell>
        <TableCell>{calculateDuration(exec)}</TableCell>
        <TableCell className="text-destructive">{exec.error_message}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 7.5 Type Imports

Use generated types from OpenAPI:
```typescript
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']
type ScheduleTask = components['schemas']['ScheduleTask']
type ScheduleExecution = components['schemas']['ScheduleExecution']
type TimingConfig = components['schemas']['TimingConfig']
type TaskCatalogEntry = components['schemas']['TaskCatalogEntry']

type Macro = components['schemas']['Macro']
type MacroAssignment = components['schemas']['MacroAssignment']
type MacroExecution = components['schemas']['MacroExecution']
```

---

## 8. Key References

| Reference | Path |
|-----------|------|
| List page example | `/apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx` |
| Detail page example | `/apps/web/src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` |
| Data table example | `/apps/web/src/components/orders/order-data-table.tsx` |
| Form sheet example | `/apps/web/src/components/orders/order-form-sheet.tsx` |
| Badge example | `/apps/web/src/components/orders/order-status-badge.tsx` |
| API hooks example | `/apps/web/src/hooks/api/use-orders.ts` |
| Sidebar config | `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |
| Schedule API spec | `/api/paths/schedules.yaml` |
| Schedule schemas | `/api/schemas/schedules.yaml` |
| Macro API spec | `/api/paths/macros.yaml` |
| Macro schemas | `/api/schemas/macros.yaml` |
| English translations | `/apps/web/messages/en.json` |
| German translations | `/apps/web/messages/de.json` |
| Generated types | `/apps/web/src/lib/api/types.ts` |
