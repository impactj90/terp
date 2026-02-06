# Order & Activity Management UI Implementation Plan

## Overview

Implement CRUD pages for orders (projects/work packages), activities, order assignments, and order bookings for project-based time tracking. This enables admins to manage project-based work items, assign employees to orders with specific roles, and track time bookings against orders and activities.

## Current State Analysis

### Backend APIs (Already Implemented)
All backend APIs are fully implemented per ZMI-TICKET-017:

- **Orders API**: `/orders` - Full CRUD with status (planned/active/completed/cancelled), cost center linking, billing rate
- **Activities API**: `/activities` - Full CRUD with code, name, description
- **Order Assignments API**: `/order-assignments` - Links employees to orders with roles (worker/leader/sales)
- **Order Bookings API**: `/order-bookings` - Time entries with employee, order, activity, duration in minutes

### Key Discoveries
- Reference pattern for tabbed list page: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx` (line 44-45: tab state management)
- Reference pattern for detail page with tabs: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` (line 123: Tabs component)
- Reference pattern for data table: `/home/tolga/projects/terp/apps/web/src/components/cost-centers/cost-center-data-table.tsx`
- Reference pattern for form sheet: `/home/tolga/projects/terp/apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`
- Reference pattern for form dialog: `/home/tolga/projects/terp/apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`
- Reference pattern for role badge: `/home/tolga/projects/terp/apps/web/src/components/teams/member-role-badge.tsx`
- Reference pattern for API hooks: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-cost-centers.ts`

## Desired End State

After implementation:
1. Admin can navigate to `/admin/orders` and see a tabbed page with Orders and Activities lists
2. Admin can CRUD orders with status management (planned/active/completed/cancelled)
3. Admin can CRUD activities for categorizing work
4. Admin can click on an order to view its detail page with tabs for Details, Assignments, and Bookings
5. Admin can assign employees to orders with roles (worker/leader/sales)
6. Admin can record time bookings against orders with activity and duration
7. All lists support search filtering and proper empty states
8. Status and role badges display with appropriate colors

## What We're NOT Doing

- Order reporting/analytics (covered by ZMI-TICKET-051)
- Billing/invoicing features
- Project budgeting/cost tracking
- Order hierarchy/sub-orders
- Bulk import/export of orders
- Calendar view of bookings

## Implementation Approach

Follow existing patterns for consistency:
1. Create API hooks first (foundation for all components)
2. Build badge components (reusable across tables)
3. Create data tables (display layer)
4. Create form components (input layer)
5. Build pages (orchestration layer)
6. Add navigation and translations (final integration)

---

## Phase 1: API Hooks

### Overview
Create React hooks for all order-related API endpoints using the established `useApiQuery` and `useApiMutation` patterns.

### Changes Required

#### 1. Orders API Hooks
**File**: `apps/web/src/hooks/api/use-orders.ts`
**Changes**: Create new file with order CRUD hooks

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
    query: { active, status },
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

#### 2. Activities API Hooks
**File**: `apps/web/src/hooks/api/use-activities.ts`
**Changes**: Create new file with activity CRUD hooks

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseActivitiesOptions {
  active?: boolean
  enabled?: boolean
}

export function useActivities(options: UseActivitiesOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/activities', {
    query: { active },
    enabled,
  })
}

export function useActivity(id: string, enabled = true) {
  return useApiQuery('/activities/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateActivity() {
  return useApiMutation('/activities', 'post', {
    invalidateKeys: [['/activities']],
  })
}

export function useUpdateActivity() {
  return useApiMutation('/activities/{id}', 'patch', {
    invalidateKeys: [['/activities']],
  })
}

export function useDeleteActivity() {
  return useApiMutation('/activities/{id}', 'delete', {
    invalidateKeys: [['/activities']],
  })
}
```

#### 3. Order Assignments API Hooks
**File**: `apps/web/src/hooks/api/use-order-assignments.ts`
**Changes**: Create new file with order assignment CRUD hooks

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrderAssignmentsOptions {
  orderId?: string
  employeeId?: string
  enabled?: boolean
}

export function useOrderAssignments(options: UseOrderAssignmentsOptions = {}) {
  const { orderId, employeeId, enabled = true } = options

  return useApiQuery('/order-assignments', {
    query: { order_id: orderId, employee_id: employeeId },
    enabled,
  })
}

export function useOrderAssignmentsByOrder(orderId: string, enabled = true) {
  return useApiQuery('/orders/{id}/assignments', {
    path: { id: orderId },
    enabled: enabled && !!orderId,
  })
}

export function useOrderAssignment(id: string, enabled = true) {
  return useApiQuery('/order-assignments/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateOrderAssignment() {
  return useApiMutation('/order-assignments', 'post', {
    invalidateKeys: [['/order-assignments'], ['/orders']],
  })
}

export function useUpdateOrderAssignment() {
  return useApiMutation('/order-assignments/{id}', 'patch', {
    invalidateKeys: [['/order-assignments'], ['/orders']],
  })
}

export function useDeleteOrderAssignment() {
  return useApiMutation('/order-assignments/{id}', 'delete', {
    invalidateKeys: [['/order-assignments'], ['/orders']],
  })
}
```

#### 4. Order Bookings API Hooks
**File**: `apps/web/src/hooks/api/use-order-bookings.ts`
**Changes**: Create new file with order booking CRUD hooks

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrderBookingsOptions {
  employeeId?: string
  orderId?: string
  dateFrom?: string
  dateTo?: string
  enabled?: boolean
}

export function useOrderBookings(options: UseOrderBookingsOptions = {}) {
  const { employeeId, orderId, dateFrom, dateTo, enabled = true } = options

  return useApiQuery('/order-bookings', {
    query: {
      employee_id: employeeId,
      order_id: orderId,
      date_from: dateFrom,
      date_to: dateTo,
    },
    enabled,
  })
}

export function useOrderBooking(id: string, enabled = true) {
  return useApiQuery('/order-bookings/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateOrderBooking() {
  return useApiMutation('/order-bookings', 'post', {
    invalidateKeys: [['/order-bookings'], ['/orders']],
  })
}

export function useUpdateOrderBooking() {
  return useApiMutation('/order-bookings/{id}', 'patch', {
    invalidateKeys: [['/order-bookings'], ['/orders']],
  })
}

export function useDeleteOrderBooking() {
  return useApiMutation('/order-bookings/{id}', 'delete', {
    invalidateKeys: [['/order-bookings'], ['/orders']],
  })
}
```

#### 5. Export Hooks in Index
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add exports for new hooks at end of file

```typescript
// Orders
export {
  useOrders,
  useOrder,
  useCreateOrder,
  useUpdateOrder,
  useDeleteOrder,
} from './use-orders'

// Activities
export {
  useActivities,
  useActivity,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
} from './use-activities'

// Order Assignments
export {
  useOrderAssignments,
  useOrderAssignmentsByOrder,
  useOrderAssignment,
  useCreateOrderAssignment,
  useUpdateOrderAssignment,
  useDeleteOrderAssignment,
} from './use-order-assignments'

// Order Bookings
export {
  useOrderBookings,
  useOrderBooking,
  useCreateOrderBooking,
  useUpdateOrderBooking,
  useDeleteOrderBooking,
} from './use-order-bookings'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`

#### Manual Verification:
- [ ] Hooks can be imported and used in components

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Badge Components

### Overview
Create reusable badge components for order status and assignment roles following the `member-role-badge.tsx` pattern.

### Changes Required

#### 1. Order Status Badge
**File**: `apps/web/src/components/orders/order-status-badge.tsx`
**Changes**: Create new badge component for order status

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { components } from '@/lib/api/types'

type OrderStatus = components['schemas']['Order']['status']

interface OrderStatusBadgeProps {
  status: OrderStatus
}

const statusConfig: Record<NonNullable<OrderStatus>, { labelKey: string; className: string }> = {
  planned: {
    labelKey: 'statusPlanned',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
  active: {
    labelKey: 'statusActive',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  completed: {
    labelKey: 'statusCompleted',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  cancelled: {
    labelKey: 'statusCancelled',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const t = useTranslations('adminOrders')

  if (!status) {
    return <Badge variant="secondary">{t('statusUnknown')}</Badge>
  }

  const config = statusConfig[status]

  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey as keyof IntlMessages['adminOrders'])}
    </Badge>
  )
}
```

#### 2. Order Assignment Role Badge
**File**: `apps/web/src/components/orders/order-assignment-role-badge.tsx`
**Changes**: Create new badge component for assignment roles

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { components } from '@/lib/api/types'

type AssignmentRole = components['schemas']['OrderAssignment']['role']

interface OrderAssignmentRoleBadgeProps {
  role: AssignmentRole
}

const roleConfig: Record<NonNullable<AssignmentRole>, { labelKey: string; className: string }> = {
  worker: {
    labelKey: 'roleWorker',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  leader: {
    labelKey: 'roleLeader',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  sales: {
    labelKey: 'roleSales',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
}

export function OrderAssignmentRoleBadge({ role }: OrderAssignmentRoleBadgeProps) {
  const t = useTranslations('adminOrders')

  if (!role) {
    return <Badge variant="secondary">{t('roleWorker')}</Badge>
  }

  const config = roleConfig[role]

  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey as keyof IntlMessages['adminOrders'])}
    </Badge>
  )
}
```

#### 3. Component Index
**File**: `apps/web/src/components/orders/index.ts`
**Changes**: Create index file exporting all order components

```typescript
export { OrderStatusBadge } from './order-status-badge'
export { OrderAssignmentRoleBadge } from './order-assignment-role-badge'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`

#### Manual Verification:
- [ ] Badge components render correctly with different status/role values

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Data Table Components

### Overview
Create data table components for displaying orders, activities, assignments, and bookings following the `cost-center-data-table.tsx` pattern.

### Changes Required

#### 1. Order Data Table
**File**: `apps/web/src/components/orders/order-data-table.tsx`
**Changes**: Create data table for orders list

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Package, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
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
import { Skeleton } from '@/components/ui/skeleton'
import { OrderStatusBadge } from './order-status-badge'
import type { components } from '@/lib/api/types'

type Order = components['schemas']['Order']

interface OrderDataTableProps {
  items: Order[]
  isLoading: boolean
  onView: (item: Order) => void
  onEdit: (item: Order) => void
  onDelete: (item: Order) => void
}

export function OrderDataTable({
  items,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: OrderDataTableProps) {
  const t = useTranslations('adminOrders')

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (isLoading) {
    return <OrderDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-28">{t('columnStatus')}</TableHead>
          <TableHead>{t('columnCustomer')}</TableHead>
          <TableHead className="w-28">{t('columnValidFrom')}</TableHead>
          <TableHead className="w-28">{t('columnValidTo')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className="cursor-pointer"
            onClick={() => onView(item)}
          >
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Package className="h-4 w-4" />
                </div>
                <span className="font-medium">{item.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={item.status} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.customer || '-'}
            </TableCell>
            <TableCell className="text-sm">{formatDate(item.valid_from)}</TableCell>
            <TableCell className="text-sm">{formatDate(item.valid_to)}</TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
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

function OrderDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### 2. Activity Data Table
**File**: `apps/web/src/components/activities/activity-data-table.tsx`
**Changes**: Create data table for activities list

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Activity, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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

type ActivityType = components['schemas']['Activity']

interface ActivityDataTableProps {
  items: ActivityType[]
  isLoading: boolean
  onEdit: (item: ActivityType) => void
  onDelete: (item: ActivityType) => void
}

export function ActivityDataTable({
  items,
  isLoading,
  onEdit,
  onDelete,
}: ActivityDataTableProps) {
  const t = useTranslations('adminActivities')

  if (isLoading) {
    return <ActivityDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnDescription')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Activity className="h-4 w-4" />
                </div>
                <span className="font-medium">{item.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
              {item.description || '-'}
            </TableCell>
            <TableCell>
              <Badge variant={item.is_active ? 'default' : 'secondary'}>
                {item.is_active ? t('statusActive') : t('statusInactive')}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
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

function ActivityDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### 3. Order Assignment Data Table
**File**: `apps/web/src/components/orders/order-assignment-data-table.tsx`
**Changes**: Create data table for order assignments

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
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
import { Skeleton } from '@/components/ui/skeleton'
import { OrderAssignmentRoleBadge } from './order-assignment-role-badge'
import type { components } from '@/lib/api/types'

type OrderAssignment = components['schemas']['OrderAssignment']

interface OrderAssignmentDataTableProps {
  items: OrderAssignment[]
  isLoading: boolean
  onEdit: (item: OrderAssignment) => void
  onDelete: (item: OrderAssignment) => void
}

export function OrderAssignmentDataTable({
  items,
  isLoading,
  onEdit,
  onDelete,
}: OrderAssignmentDataTableProps) {
  const t = useTranslations('adminOrders')

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (isLoading) {
    return <OrderAssignmentDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnEmployee')}</TableHead>
          <TableHead className="w-24">{t('columnRole')}</TableHead>
          <TableHead className="w-28">{t('columnValidFrom')}</TableHead>
          <TableHead className="w-28">{t('columnValidTo')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">
              {item.employee?.first_name} {item.employee?.last_name}
            </TableCell>
            <TableCell>
              <OrderAssignmentRoleBadge role={item.role} />
            </TableCell>
            <TableCell className="text-sm">{formatDate(item.valid_from)}</TableCell>
            <TableCell className="text-sm">{formatDate(item.valid_to)}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
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

function OrderAssignmentDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### 4. Order Booking Data Table
**File**: `apps/web/src/components/orders/order-booking-data-table.tsx`
**Changes**: Create data table for order bookings

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
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

type OrderBooking = components['schemas']['OrderBooking']

interface OrderBookingDataTableProps {
  items: OrderBooking[]
  isLoading: boolean
  onEdit: (item: OrderBooking) => void
  onDelete: (item: OrderBooking) => void
}

function formatTimeMinutes(minutes: number | undefined): string {
  if (!minutes) return '0:00'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

export function OrderBookingDataTable({
  items,
  isLoading,
  onEdit,
  onDelete,
}: OrderBookingDataTableProps) {
  const t = useTranslations('adminOrders')

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  const getSourceBadge = (source: string | undefined) => {
    switch (source) {
      case 'manual':
        return <Badge variant="secondary" className="bg-green-100 text-green-700">{t('sourceManual')}</Badge>
      case 'auto':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">{t('sourceAuto')}</Badge>
      case 'import':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-700">{t('sourceImport')}</Badge>
      default:
        return <Badge variant="secondary">{source || '-'}</Badge>
    }
  }

  if (isLoading) {
    return <OrderBookingDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">{t('columnDate')}</TableHead>
          <TableHead>{t('columnEmployee')}</TableHead>
          <TableHead>{t('columnActivity')}</TableHead>
          <TableHead className="w-20">{t('columnTime')}</TableHead>
          <TableHead>{t('columnDescription')}</TableHead>
          <TableHead className="w-20">{t('columnSource')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="text-sm">{formatDate(item.booking_date)}</TableCell>
            <TableCell className="font-medium">
              {item.employee?.first_name} {item.employee?.last_name}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.activity?.name || '-'}
            </TableCell>
            <TableCell className="font-mono text-sm">
              {formatTimeMinutes(item.time_minutes)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
              {item.description || '-'}
            </TableCell>
            <TableCell>{getSourceBadge(item.source)}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
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

function OrderBookingDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### 5. Update Component Indexes
**File**: `apps/web/src/components/orders/index.ts`
**Changes**: Add data table exports

```typescript
export { OrderStatusBadge } from './order-status-badge'
export { OrderAssignmentRoleBadge } from './order-assignment-role-badge'
export { OrderDataTable } from './order-data-table'
export { OrderAssignmentDataTable } from './order-assignment-data-table'
export { OrderBookingDataTable } from './order-booking-data-table'
```

**File**: `apps/web/src/components/activities/index.ts`
**Changes**: Create index file

```typescript
export { ActivityDataTable } from './activity-data-table'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`

#### Manual Verification:
- [ ] Data tables render correctly with sample data
- [ ] Dropdown menus work properly
- [ ] Loading skeletons display correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Form Components

### Overview
Create form components for creating and editing orders, activities, assignments, and bookings.

### Changes Required

#### 1. Order Form Sheet
**File**: `apps/web/src/components/orders/order-form-sheet.tsx`
**Changes**: Create form sheet for order create/edit

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  useCreateOrder,
  useUpdateOrder,
  useCostCenters,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Order = components['schemas']['Order']

interface OrderFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: Order | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  status: 'planned' | 'active' | 'completed' | 'cancelled'
  customer: string
  costCenterId: string
  billingRatePerHour: string
  validFrom: string
  validTo: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  status: 'planned',
  customer: '',
  costCenterId: '',
  billingRatePerHour: '',
  validFrom: '',
  validTo: '',
  isActive: true,
}

export function OrderFormSheet({
  open,
  onOpenChange,
  order,
  onSuccess,
}: OrderFormSheetProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!order
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrder()
  const updateMutation = useUpdateOrder()
  const { data: costCentersData } = useCostCenters({ enabled: open })
  const costCenters = costCentersData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (order) {
        setForm({
          code: order.code || '',
          name: order.name || '',
          description: order.description || '',
          status: order.status || 'planned',
          customer: order.customer || '',
          costCenterId: order.cost_center_id || '',
          billingRatePerHour: order.billing_rate_per_hour?.toString() || '',
          validFrom: order.valid_from?.split('T')[0] || '',
          validTo: order.valid_to?.split('T')[0] || '',
          isActive: order.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, order])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && order) {
        await updateMutation.mutateAsync({
          path: { id: order.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            status: form.status,
            customer: form.customer.trim() || undefined,
            cost_center_id: form.costCenterId || undefined,
            billing_rate_per_hour: form.billingRatePerHour ? parseFloat(form.billingRatePerHour) : undefined,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            status: form.status,
            customer: form.customer.trim() || undefined,
            cost_center_id: form.costCenterId || undefined,
            billing_rate_per_hour: form.billingRatePerHour ? parseFloat(form.billingRatePerHour) : undefined,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
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
          <SheetTitle>{isEdit ? t('editOrder') : t('newOrder')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting || isEdit}
                  placeholder={t('codePlaceholder')}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">{t('fieldStatus')}</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: value as FormState['status'] }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">{t('statusPlanned')}</SelectItem>
                    <SelectItem value="active">{t('statusActive')}</SelectItem>
                    <SelectItem value="completed">{t('statusCompleted')}</SelectItem>
                    <SelectItem value="cancelled">{t('statusCancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer">{t('fieldCustomer')}</Label>
                <Input
                  id="customer"
                  value={form.customer}
                  onChange={(e) => setForm((prev) => ({ ...prev, customer: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('customerPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="costCenter">{t('fieldCostCenter')}</Label>
                <Select
                  value={form.costCenterId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, costCenterId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="costCenter">
                    <SelectValue placeholder={t('costCenterPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noCostCenter')}</SelectItem>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.code} - {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Billing */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBilling')}</h3>

              <div className="space-y-2">
                <Label htmlFor="billingRate">{t('fieldBillingRate')}</Label>
                <Input
                  id="billingRate"
                  type="number"
                  step="0.01"
                  value={form.billingRatePerHour}
                  onChange={(e) => setForm((prev) => ({ ...prev, billingRatePerHour: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Validity Period */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionValidity')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">{t('fieldValidFrom')}</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validTo">{t('fieldValidTo')}</Label>
                  <Input
                    id="validTo"
                    type="date"
                    value={form.validTo}
                    onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Status (only for edit) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('fieldActiveDescription')}
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

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
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 2. Activity Form Sheet
**File**: `apps/web/src/components/activities/activity-form-sheet.tsx`
**Changes**: Create form sheet for activity create/edit

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  useCreateActivity,
  useUpdateActivity,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Activity = components['schemas']['Activity']

interface ActivityFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activity?: Activity | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  isActive: true,
}

export function ActivityFormSheet({
  open,
  onOpenChange,
  activity,
  onSuccess,
}: ActivityFormSheetProps) {
  const t = useTranslations('adminActivities')
  const isEdit = !!activity
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity()

  React.useEffect(() => {
    if (open) {
      if (activity) {
        setForm({
          code: activity.code || '',
          name: activity.name || '',
          description: activity.description || '',
          isActive: activity.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, activity])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && activity) {
        await updateMutation.mutateAsync({
          path: { id: activity.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editActivity') : t('newActivity')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting || isEdit}
                  placeholder={t('codePlaceholder')}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              {isEdit && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('fieldActiveDescription')}
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 3. Order Assignment Form Dialog
**File**: `apps/web/src/components/orders/order-assignment-form-dialog.tsx`
**Changes**: Create dialog for order assignment create/edit

```typescript
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateOrderAssignment,
  useUpdateOrderAssignment,
  useEmployees,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type OrderAssignment = components['schemas']['OrderAssignment']

interface OrderAssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  assignment?: OrderAssignment | null
  onSuccess?: () => void
}

interface FormState {
  employeeId: string
  role: 'worker' | 'leader' | 'sales'
  validFrom: string
  validTo: string
}

const INITIAL_STATE: FormState = {
  employeeId: '',
  role: 'worker',
  validFrom: '',
  validTo: '',
}

export function OrderAssignmentFormDialog({
  open,
  onOpenChange,
  orderId,
  assignment,
  onSuccess,
}: OrderAssignmentFormDialogProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!assignment
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrderAssignment()
  const updateMutation = useUpdateOrderAssignment()
  const { data: employeesData } = useEmployees({ active: true, enabled: open })
  const employees = employeesData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (assignment) {
        setForm({
          employeeId: assignment.employee_id || '',
          role: assignment.role || 'worker',
          validFrom: assignment.valid_from?.split('T')[0] || '',
          validTo: assignment.valid_to?.split('T')[0] || '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, assignment])

  const handleSave = async () => {
    setError(null)

    if (!form.employeeId) {
      setError(t('validationEmployeeRequired'))
      return
    }

    try {
      if (isEdit && assignment) {
        await updateMutation.mutateAsync({
          path: { id: assignment.id },
          body: {
            role: form.role,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            order_id: orderId,
            employee_id: form.employeeId,
            role: form.role,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
          },
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('assignmentSaveError'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('editAssignment') : t('newAssignment')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('fieldEmployee')} *</Label>
            <Select
              value={form.employeeId || '__none__'}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, employeeId: value === '__none__' ? '' : value }))
              }
              disabled={isPending || isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('employeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('selectEmployee')}</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.personnel_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('fieldRole')}</Label>
            <Select
              value={form.role}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, role: value as FormState['role'] }))
              }
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">{t('roleWorker')}</SelectItem>
                <SelectItem value="leader">{t('roleLeader')}</SelectItem>
                <SelectItem value="sales">{t('roleSales')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('fieldValidFrom')}</Label>
              <Input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('fieldValidTo')}</Label>
              <Input
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### 4. Order Booking Form Sheet
**File**: `apps/web/src/components/orders/order-booking-form-sheet.tsx`
**Changes**: Create form sheet for booking create/edit

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  useCreateOrderBooking,
  useUpdateOrderBooking,
  useEmployees,
  useActivities,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type OrderBooking = components['schemas']['OrderBooking']

interface OrderBookingFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  booking?: OrderBooking | null
  onSuccess?: () => void
}

interface FormState {
  employeeId: string
  activityId: string
  bookingDate: string
  hours: string
  minutes: string
  description: string
}

const INITIAL_STATE: FormState = {
  employeeId: '',
  activityId: '',
  bookingDate: new Date().toISOString().split('T')[0],
  hours: '0',
  minutes: '0',
  description: '',
}

export function OrderBookingFormSheet({
  open,
  onOpenChange,
  orderId,
  booking,
  onSuccess,
}: OrderBookingFormSheetProps) {
  const t = useTranslations('adminOrders')
  const isEdit = !!booking
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrderBooking()
  const updateMutation = useUpdateOrderBooking()
  const { data: employeesData } = useEmployees({ active: true, enabled: open })
  const { data: activitiesData } = useActivities({ active: true, enabled: open })
  const employees = employeesData?.data ?? []
  const activities = activitiesData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (booking) {
        const totalMinutes = booking.time_minutes || 0
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        setForm({
          employeeId: booking.employee_id || '',
          activityId: booking.activity_id || '',
          bookingDate: booking.booking_date?.split('T')[0] || '',
          hours: hours.toString(),
          minutes: minutes.toString(),
          description: booking.description || '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, booking])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.employeeId) {
      errors.push(t('validationEmployeeRequired'))
    }

    if (!formData.bookingDate) {
      errors.push(t('validationDateRequired'))
    }

    const totalMinutes = parseInt(formData.hours || '0') * 60 + parseInt(formData.minutes || '0')
    if (totalMinutes <= 0) {
      errors.push(t('validationTimeRequired'))
    }

    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    const timeMinutes = parseInt(form.hours || '0') * 60 + parseInt(form.minutes || '0')

    try {
      if (isEdit && booking) {
        await updateMutation.mutateAsync({
          path: { id: booking.id },
          body: {
            activity_id: form.activityId || undefined,
            booking_date: form.bookingDate,
            time_minutes: timeMinutes,
            description: form.description.trim() || undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            order_id: orderId,
            employee_id: form.employeeId,
            activity_id: form.activityId || undefined,
            booking_date: form.bookingDate,
            time_minutes: timeMinutes,
            description: form.description.trim() || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editBooking') : t('newBooking')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editBookingDescription') : t('createBookingDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('fieldEmployee')} *</Label>
                <Select
                  value={form.employeeId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, employeeId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('employeePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('selectEmployee')}</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldActivity')}</Label>
                <Select
                  value={form.activityId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, activityId: value === '__none__' ? '' : value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('activityPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noActivity')}</SelectItem>
                    {activities.map((act) => (
                      <SelectItem key={act.id} value={act.id}>
                        {act.code} - {act.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldDate')} *</Label>
                <Input
                  type="date"
                  value={form.bookingDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, bookingDate: e.target.value }))}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('fieldTime')} *</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={form.hours}
                      onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('hours')}</p>
                  </div>
                  <span className="text-lg font-medium">:</span>
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={form.minutes}
                      onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('minutes')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldDescription')}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

#### 5. Update Component Indexes
**File**: `apps/web/src/components/orders/index.ts`
**Changes**: Add form component exports

```typescript
export { OrderStatusBadge } from './order-status-badge'
export { OrderAssignmentRoleBadge } from './order-assignment-role-badge'
export { OrderDataTable } from './order-data-table'
export { OrderAssignmentDataTable } from './order-assignment-data-table'
export { OrderBookingDataTable } from './order-booking-data-table'
export { OrderFormSheet } from './order-form-sheet'
export { OrderAssignmentFormDialog } from './order-assignment-form-dialog'
export { OrderBookingFormSheet } from './order-booking-form-sheet'
```

**File**: `apps/web/src/components/activities/index.ts`
**Changes**: Add form sheet export

```typescript
export { ActivityDataTable } from './activity-data-table'
export { ActivityFormSheet } from './activity-form-sheet'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`

#### Manual Verification:
- [ ] Form sheets open and close correctly
- [ ] Form validation displays errors
- [ ] Create and edit modes work correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Pages

### Overview
Create the main orders page with tabs for Orders/Activities and the order detail page with tabs for Details/Assignments/Bookings.

### Changes Required

#### 1. Orders List Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx`
**Changes**: Create new page with Orders and Activities tabs

This should follow the pattern from `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`:
- Page-level tab state for 'orders' | 'activities'
- Separate search state for each tab
- Dynamic Add button based on active tab
- Data tables with CRUD operations
- Form sheets and confirmation dialogs
- Empty states for each tab

#### 2. Order Detail Page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`
**Changes**: Create detail page with Details/Assignments/Bookings tabs

This should follow the pattern from `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`:
- Page header with back button, order info, status badge
- Action buttons (Edit, Delete)
- Tabs for Details, Assignments, Bookings
- Details tab shows order info in cards
- Assignments tab shows assignment table with add/edit/delete
- Bookings tab shows booking table with add/edit/delete
- Not found handling

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`

#### Manual Verification:
- [ ] Orders list page loads and displays tabs
- [ ] Can switch between Orders and Activities tabs
- [ ] Order detail page loads with correct data
- [ ] All tabs on detail page work correctly
- [ ] CRUD operations work end-to-end

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Navigation and Translations

### Overview
Add navigation entry for orders and create translation files for English and German.

### Changes Required

#### 1. Navigation Configuration
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
**Changes**: Add orders to management section

Add after shiftPlanning entry (around line 252):
```typescript
{
  titleKey: 'orders',
  href: '/admin/orders',
  icon: Package,
  roles: ['admin'],
},
```

Also add import at top:
```typescript
import { Package } from 'lucide-react'
```

#### 2. English Translations
**File**: `apps/web/messages/en.json`
**Changes**: Add adminOrders and adminActivities namespaces

```json
{
  "nav": {
    "orders": "Orders"
  },
  "adminOrders": {
    "title": "Orders",
    "subtitle": "Manage orders and project-based time tracking",
    "tabOrders": "Orders",
    "tabActivities": "Activities",
    "newOrder": "New Order",
    "editOrder": "Edit Order",
    "deleteOrder": "Delete Order",
    "deleteDescription": "Are you sure you want to delete order \"{name}\"? This action cannot be undone.",
    "searchPlaceholder": "Search orders...",
    "clearFilters": "Clear Filters",
    "orderCount": "{count} order",
    "ordersCount": "{count} orders",
    "columnCode": "Code",
    "columnName": "Name",
    "columnStatus": "Status",
    "columnCustomer": "Customer",
    "columnCostCenter": "Cost Center",
    "columnValidFrom": "Valid From",
    "columnValidTo": "Valid To",
    "columnActions": "Actions",
    "columnEmployee": "Employee",
    "columnRole": "Role",
    "columnDate": "Date",
    "columnTime": "Time",
    "columnActivity": "Activity",
    "columnDescription": "Description",
    "columnSource": "Source",
    "statusPlanned": "Planned",
    "statusActive": "Active",
    "statusCompleted": "Completed",
    "statusCancelled": "Cancelled",
    "statusUnknown": "Unknown",
    "roleWorker": "Worker",
    "roleLeader": "Leader",
    "roleSales": "Sales",
    "sourceManual": "Manual",
    "sourceAuto": "Auto",
    "sourceImport": "Import",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "fieldStatus": "Status",
    "fieldCustomer": "Customer",
    "fieldCostCenter": "Cost Center",
    "fieldBillingRate": "Billing Rate per Hour",
    "fieldValidFrom": "Valid From",
    "fieldValidTo": "Valid To",
    "fieldActive": "Active",
    "fieldEmployee": "Employee",
    "fieldRole": "Role",
    "fieldActivity": "Activity",
    "fieldDate": "Date",
    "fieldTime": "Time",
    "sectionBasicInfo": "Basic Information",
    "sectionValidity": "Validity Period",
    "sectionBilling": "Billing",
    "sectionStatus": "Status",
    "sectionDetails": "Details",
    "sectionAssignments": "Assignments",
    "sectionBookings": "Bookings",
    "emptyTitle": "No orders",
    "emptyGetStarted": "Get started by creating your first order.",
    "emptyFilterHint": "Try adjusting your filters.",
    "emptyAssignments": "No assignments yet",
    "emptyAssignmentsHint": "Assign employees to this order.",
    "emptyBookings": "No bookings yet",
    "emptyBookingsHint": "Record time bookings for this order.",
    "viewDetails": "View Details",
    "edit": "Edit",
    "delete": "Delete",
    "cancel": "Cancel",
    "create": "Create",
    "save": "Save",
    "saving": "Saving...",
    "saveChanges": "Save Changes",
    "failedCreate": "Failed to create order",
    "failedUpdate": "Failed to update order",
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",
    "validationEmployeeRequired": "Employee is required",
    "validationDateRequired": "Date is required",
    "validationTimeRequired": "Time must be greater than 0",
    "codePlaceholder": "e.g., PRJ-001",
    "namePlaceholder": "Order name",
    "descriptionPlaceholder": "Optional description",
    "customerPlaceholder": "Customer name",
    "costCenterPlaceholder": "Select cost center",
    "noCostCenter": "No cost center",
    "selectEmployee": "Select employee",
    "employeePlaceholder": "Select an employee",
    "activityPlaceholder": "Select activity",
    "noActivity": "No activity",
    "hours": "Hours",
    "minutes": "Minutes",
    "createDescription": "Fill in the details to create a new order.",
    "editDescription": "Update the order details.",
    "fieldActiveDescription": "Inactive orders are hidden from most views.",
    "tabDetails": "Details",
    "tabAssignments": "Assignments",
    "tabBookings": "Bookings",
    "newAssignment": "New Assignment",
    "editAssignment": "Edit Assignment",
    "deleteAssignment": "Delete Assignment",
    "assignmentSaveError": "Failed to save assignment",
    "newBooking": "New Booking",
    "editBooking": "Edit Booking",
    "deleteBooking": "Delete Booking",
    "createBookingDescription": "Record time spent on this order.",
    "editBookingDescription": "Update the booking details.",
    "orderNotFound": "Order not found",
    "backToOrders": "Back to Orders"
  },
  "adminActivities": {
    "title": "Activities",
    "subtitle": "Manage activity types for order bookings",
    "newActivity": "New Activity",
    "editActivity": "Edit Activity",
    "deleteActivity": "Delete Activity",
    "deleteDescription": "Are you sure you want to delete activity \"{name}\"? This action cannot be undone.",
    "searchPlaceholder": "Search activities...",
    "clearFilters": "Clear Filters",
    "activityCount": "{count} activity",
    "activitiesCount": "{count} activities",
    "columnCode": "Code",
    "columnName": "Name",
    "columnDescription": "Description",
    "columnStatus": "Status",
    "columnActions": "Actions",
    "statusActive": "Active",
    "statusInactive": "Inactive",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "fieldActive": "Active",
    "emptyTitle": "No activities",
    "emptyGetStarted": "Get started by creating your first activity.",
    "emptyFilterHint": "Try adjusting your filters.",
    "edit": "Edit",
    "delete": "Delete",
    "cancel": "Cancel",
    "create": "Create",
    "saving": "Saving...",
    "saveChanges": "Save Changes",
    "failedCreate": "Failed to create activity",
    "failedUpdate": "Failed to update activity",
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",
    "codePlaceholder": "e.g., DEV",
    "namePlaceholder": "Activity name",
    "descriptionPlaceholder": "Optional description",
    "createDescription": "Fill in the details to create a new activity.",
    "editDescription": "Update the activity details.",
    "fieldActiveDescription": "Inactive activities are hidden from selection."
  }
}
```

#### 3. German Translations
**File**: `apps/web/messages/de.json`
**Changes**: Add German translations for adminOrders and adminActivities namespaces

Add German equivalents of all keys from adminOrders and adminActivities namespaces.

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npm run typecheck`
- [ ] Linting passes: `cd apps/web && npm run lint`

#### Manual Verification:
- [ ] Orders link appears in sidebar navigation
- [ ] All text displays correctly in English
- [ ] All text displays correctly in German (switch locale)
- [ ] No missing translation warnings in console

**Implementation Note**: After completing this phase and all automated verification passes, the feature is complete.

---

## Testing Strategy

### Unit Tests
- Order status badge renders correct colors
- Assignment role badge renders correct labels
- Time formatting displays correctly (minutes to HH:MM)
- Form validation catches required fields

### Integration Tests
- Create order with all fields
- Assign employee to order with role
- Record booking with activity and time
- Update order status
- Delete order and verify cascade

### Manual Testing Steps
1. Navigate to Orders page via sidebar
2. Create a new order with code "TEST-001"
3. Verify order appears in list with "Planned" badge
4. Click order to view detail page
5. Switch to Assignments tab
6. Add employee assignment with "Leader" role
7. Verify assignment appears with correct badge
8. Switch to Bookings tab
9. Add booking with 2 hours (120 minutes)
10. Verify booking shows "2:00" in time column
11. Edit order, change status to "Active"
12. Verify status badge updates
13. Switch to Activities tab
14. Create activity "DEV - Development"
15. Edit booking to use new activity
16. Delete booking, assignment, and order
17. Verify all deletions work correctly

## Performance Considerations

- Order list should use pagination for large datasets
- Assignment/booking tables embedded in detail page are typically small, no pagination needed
- Cost center and employee selectors should load efficiently
- Consider caching cost centers and activities since they change infrequently

## Migration Notes

No database migrations required - all backend APIs are already implemented per ZMI-TICKET-017.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-061-order-activity-management-ui.md`
- Research document: `thoughts/shared/research/2026-02-06-ZMI-TICKET-061-order-activity-management-ui.md`
- Backend ticket: ZMI-TICKET-017 (ZMI Auftrag Module)
- Similar implementations:
  - Tabbed list page: `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`
  - Detail page with tabs: `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`
  - Data table: `apps/web/src/components/cost-centers/cost-center-data-table.tsx`
  - Form sheet: `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`
  - Form dialog: `apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`
  - Role badge: `apps/web/src/components/teams/member-role-badge.tsx`
