# Research: ZMI-TICKET-061 - Order & Activity Management UI

**Date**: 2026-02-06
**Ticket**: ZMI-TICKET-061
**Goal**: Provide CRUD pages for orders (projects/work packages), activities, order assignments, and order bookings for project-based time tracking.

---

## 1. Backend API Endpoints

### 1.1 Orders API

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/order.go`

| Method | Endpoint | Operation | Handler |
|--------|----------|-----------|---------|
| GET | `/orders` | List orders | `OrderHandler.List` |
| GET | `/orders/{id}` | Get order by ID | `OrderHandler.Get` |
| POST | `/orders` | Create order | `OrderHandler.Create` |
| PATCH | `/orders/{id}` | Update order | `OrderHandler.Update` |
| DELETE | `/orders/{id}` | Delete order | `OrderHandler.Delete` |

**Query Parameters** (List):
- `active=true` - Filter by active status
- `status` - Filter by status (planned, active, completed, cancelled)

**Request/Response Models** (from `/home/tolga/projects/terp/api/schemas/orders.yaml`):
- `Order` - Full order schema with fields: id, tenant_id, code, name, description, status (enum: planned/active/completed/cancelled), customer, cost_center_id, billing_rate_per_hour, valid_from, valid_to, is_active, created_at, updated_at
- `CreateOrderRequest` - Required: code, name
- `UpdateOrderRequest` - All optional fields
- `OrderList` - Response wrapper with data array

### 1.2 Activities API

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/activity.go`

| Method | Endpoint | Operation | Handler |
|--------|----------|-----------|---------|
| GET | `/activities` | List activities | `ActivityHandler.List` |
| GET | `/activities/{id}` | Get activity by ID | `ActivityHandler.Get` |
| POST | `/activities` | Create activity | `ActivityHandler.Create` |
| PATCH | `/activities/{id}` | Update activity | `ActivityHandler.Update` |
| DELETE | `/activities/{id}` | Delete activity | `ActivityHandler.Delete` |

**Query Parameters** (List):
- `active=true` - Filter by active status

**Request/Response Models** (from `/home/tolga/projects/terp/api/schemas/activities.yaml`):
- `Activity` - Fields: id, tenant_id, code, name, description, is_active, created_at, updated_at
- `CreateActivityRequest` - Required: code, name
- `UpdateActivityRequest` - All optional fields
- `ActivityList` - Response wrapper with data array

### 1.3 Order Assignments API

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/order_assignment.go`

| Method | Endpoint | Operation | Handler |
|--------|----------|-----------|---------|
| GET | `/order-assignments` | List all assignments | `OrderAssignmentHandler.List` |
| GET | `/order-assignments/{id}` | Get assignment by ID | `OrderAssignmentHandler.Get` |
| POST | `/order-assignments` | Create assignment | `OrderAssignmentHandler.Create` |
| PATCH | `/order-assignments/{id}` | Update assignment | `OrderAssignmentHandler.Update` |
| DELETE | `/order-assignments/{id}` | Delete assignment | `OrderAssignmentHandler.Delete` |
| GET | `/orders/{id}/assignments` | List by order | `OrderAssignmentHandler.ListByOrder` |

**Query Parameters** (List):
- `order_id` - Filter by order
- `employee_id` - Filter by employee

**Request/Response Models** (from `/home/tolga/projects/terp/api/schemas/order-assignments.yaml`):
- `OrderAssignment` - Fields: id, tenant_id, order_id, employee_id, role (enum: worker/leader/sales), valid_from, valid_to, is_active, created_at, updated_at
- `CreateOrderAssignmentRequest` - Required: order_id, employee_id
- `UpdateOrderAssignmentRequest` - Optional: role, valid_from, valid_to, is_active
- `OrderAssignmentList` - Response wrapper with data array

### 1.4 Order Bookings API

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/order_booking.go`

| Method | Endpoint | Operation | Handler |
|--------|----------|-----------|---------|
| GET | `/order-bookings` | List bookings | `OrderBookingHandler.List` |
| GET | `/order-bookings/{id}` | Get booking by ID | `OrderBookingHandler.Get` |
| POST | `/order-bookings` | Create booking | `OrderBookingHandler.Create` |
| PATCH | `/order-bookings/{id}` | Update booking | `OrderBookingHandler.Update` |
| DELETE | `/order-bookings/{id}` | Delete booking | `OrderBookingHandler.Delete` |

**Query Parameters** (List):
- `employee_id` - Filter by employee
- `order_id` - Filter by order
- `date_from` - Filter bookings from date (YYYY-MM-DD)
- `date_to` - Filter bookings to date (YYYY-MM-DD)

**Request/Response Models** (from `/home/tolga/projects/terp/api/schemas/order-bookings.yaml`):
- `OrderBooking` - Fields: id, tenant_id, employee_id, order_id, activity_id, booking_date, time_minutes, description, source (enum: manual/auto/import), created_at, updated_at, created_by, updated_by
- `CreateOrderBookingRequest` - Required: employee_id, order_id, booking_date, time_minutes
- `UpdateOrderBookingRequest` - Optional: order_id, activity_id, booking_date, time_minutes, description
- `OrderBookingList` - Response wrapper with data array

---

## 2. Related API Endpoints for Selectors

### 2.1 Cost Centers API

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-cost-centers.ts`

```typescript
// List cost centers
useCostCenters(options?: { enabled?: boolean })
// Response: { data: CostCenter[] }

// Get single cost center
useCostCenter(id: string, enabled?: boolean)
```

### 2.2 Employees API

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
// List employees with optional filters
useEmployees(options?: {
  limit?: number
  page?: number
  search?: string
  departmentId?: string
  active?: boolean
  enabled?: boolean
})
// Response: { data: Employee[] }

// Get single employee
useEmployee(id: string, enabled?: boolean)
```

---

## 3. UI Patterns

### 3.1 Page with Tabs Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`

Key patterns:
- Page-level tab state: `const [activeTab, setActiveTab] = React.useState<'tab1' | 'tab2'>('tab1')`
- Dynamic "Add" button based on active tab
- Separate state and filtering for each tab
- Tabs component usage:

```tsx
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
  <TabsList>
    <TabsTrigger value="orders">{t('tabOrders')}</TabsTrigger>
    <TabsTrigger value="activities">{t('tabActivities')}</TabsTrigger>
  </TabsList>

  <TabsContent value="orders" className="space-y-6">
    {/* Orders content */}
  </TabsContent>

  <TabsContent value="activities" className="space-y-6">
    {/* Activities content */}
  </TabsContent>
</Tabs>
```

### 3.2 Detail Page with Tabs Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Key patterns:
- Page header with back button and entity info
- Tabs for different sections (Overview, Assignments, Bookings)
- Edit/Delete actions in header
- Loading skeleton component
- Not found handling

```tsx
<Tabs defaultValue="details">
  <TabsList>
    <TabsTrigger value="details">{t('tabDetails')}</TabsTrigger>
    <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
    <TabsTrigger value="bookings">{t('tabBookings')}</TabsTrigger>
  </TabsList>

  <TabsContent value="details" className="mt-6">
    {/* Order detail cards */}
  </TabsContent>

  <TabsContent value="assignments" className="mt-6">
    <OrderAssignmentDataTable ... />
  </TabsContent>

  <TabsContent value="bookings" className="mt-6">
    <OrderBookingDataTable ... />
  </TabsContent>
</Tabs>
```

### 3.3 Data Table Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/cost-centers/cost-center-data-table.tsx`

Key patterns:
- Props interface with items array, loading state, and callbacks
- Row click for view, dropdown menu for actions
- Badge component for status display
- Skeleton loading state

```tsx
interface OrderDataTableProps {
  items: Order[]
  isLoading: boolean
  onView: (item: Order) => void
  onEdit: (item: Order) => void
  onDelete: (item: Order) => void
}
```

Columns implementation:
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-24">{t('columnCode')}</TableHead>
      <TableHead>{t('columnName')}</TableHead>
      <TableHead>{t('columnStatus')}</TableHead>
      {/* ... more columns */}
      <TableHead className="w-16">
        <span className="sr-only">{t('columnActions')}</span>
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map((item) => (
      <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
        {/* cells */}
        <TableCell onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            {/* actions */}
          </DropdownMenu>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 3.4 Form Sheet Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`

Key patterns:
- Sheet component with right slide-in
- Form state with initial values
- Create vs Edit mode detection (`const isEdit = !!entity`)
- Validation function
- Error handling with Alert component
- ScrollArea for long forms
- Footer with Cancel/Save buttons

```tsx
interface OrderFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: Order | null
  onSuccess?: () => void
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  // ...
}
```

### 3.5 Form Dialog Pattern (for inline records like assignments)

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`

Key patterns:
- Dialog component for smaller forms
- Used for child records (assignments)
- Same form handling patterns as sheets
- DialogHeader, DialogFooter components

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
    </DialogHeader>
    {/* form fields */}
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        {t('cancel')}
      </Button>
      <Button onClick={handleSave}>
        {t('save')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 4. Status Badge Patterns

### 4.1 Employee Status Badge

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/employees/status-badge.tsx`

```tsx
export function StatusBadge({ isActive, exitDate, className }: StatusBadgeProps) {
  const t = useTranslations('adminEmployees')
  const hasExited = exitDate ? new Date(exitDate) < new Date() : false

  if (hasExited) {
    return <Badge variant="destructive">{t('statusExited')}</Badge>
  }

  if (!isActive) {
    return <Badge variant="secondary">{t('statusInactive')}</Badge>
  }

  return (
    <Badge variant="default" className="bg-green-600 hover:bg-green-600/90">
      {t('statusActive')}
    </Badge>
  )
}
```

### 4.2 Role Badge (for team members)

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/teams/member-role-badge.tsx`

```tsx
const roleConfig: Record<TeamMemberRole, { labelKey: string; className: string }> = {
  lead: {
    labelKey: 'roleLead',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  deputy: {
    labelKey: 'roleDeputy',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  member: {
    labelKey: 'roleMember',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
}

export function MemberRoleBadge({ role }: { role: TeamMemberRole }) {
  const t = useTranslations('adminTeams')
  const config = roleConfig[role]

  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}
```

**Order Status Badge Implementation**:
```tsx
// Suggested color mapping for order statuses
const orderStatusConfig = {
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
```

**Order Assignment Role Badge Implementation**:
```tsx
// Suggested color mapping for assignment roles
const assignmentRoleConfig = {
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
```

---

## 5. API Hooks Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-cost-centers.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

// List hook
export function useOrders(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  return useApiQuery('/orders', { enabled })
}

// Get by ID hook
export function useOrder(id: string, enabled = true) {
  return useApiQuery('/orders/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Create hook
export function useCreateOrder() {
  return useApiMutation('/orders', 'post', {
    invalidateKeys: [['/orders']],
  })
}

// Update hook
export function useUpdateOrder() {
  return useApiMutation('/orders/{id}', 'patch', {
    invalidateKeys: [['/orders']],
  })
}

// Delete hook
export function useDeleteOrder() {
  return useApiMutation('/orders/{id}', 'delete', {
    invalidateKeys: [['/orders']],
  })
}
```

**Export in index.ts**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`
```typescript
// Orders
export {
  useOrders,
  useOrder,
  useCreateOrder,
  useUpdateOrder,
  useDeleteOrder,
} from './use-orders'
```

---

## 6. Navigation Configuration

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add to "management" section:
```typescript
{
  titleKey: 'orders',
  href: '/admin/orders',
  icon: Package, // from lucide-react
  roles: ['admin'],
},
```

**Translation key in nav namespace**:
```json
{
  "nav": {
    "orders": "Orders"
  }
}
```

---

## 7. Translation Structure

**Reference**: `/home/tolga/projects/terp/apps/web/messages/en.json`

Namespace conventions:
- Admin pages use `admin{Entity}` namespace (e.g., `adminOrders`, `adminActivities`)
- Keys follow camelCase

Example structure for orders:
```json
{
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
    "countSingular": "{count} order",
    "countPlural": "{count} orders",
    "columnCode": "Code",
    "columnName": "Name",
    "columnStatus": "Status",
    "columnCustomer": "Customer",
    "columnCostCenter": "Cost Center",
    "columnValidFrom": "Valid From",
    "columnValidTo": "Valid To",
    "columnActions": "Actions",
    "statusPlanned": "Planned",
    "statusActive": "Active",
    "statusCompleted": "Completed",
    "statusCancelled": "Cancelled",
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
    "sectionBasicInfo": "Basic Information",
    "sectionValidity": "Validity Period",
    "sectionBilling": "Billing",
    "emptyTitle": "No orders",
    "emptyGetStarted": "Get started by creating your first order.",
    "emptyFilterHint": "Try adjusting your filters.",
    "viewDetails": "View Details",
    "edit": "Edit",
    "delete": "Delete",
    "cancel": "Cancel",
    "create": "Create",
    "saving": "Saving...",
    "saveChanges": "Save Changes",
    "failedCreate": "Failed to create order",
    "failedUpdate": "Failed to update order",
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required"
  }
}
```

---

## 8. Component Index Pattern

**Reference**: `/home/tolga/projects/terp/apps/web/src/components/cost-centers/index.ts`

```typescript
export { OrderDataTable } from './order-data-table'
export { OrderFormSheet } from './order-form-sheet'
export { OrderDetailPage } from './order-detail-page'
// etc.
```

---

## 9. File Structure Summary

### New Files Required

**Pages**:
- `apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx`
- `apps/web/src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`

**Components** (in `apps/web/src/components/orders/`):
- `index.ts`
- `order-data-table.tsx`
- `order-form-sheet.tsx`
- `order-detail-page.tsx`
- `order-status-badge.tsx`
- `order-assignment-data-table.tsx`
- `order-assignment-form-dialog.tsx`
- `order-assignment-role-badge.tsx`
- `order-booking-data-table.tsx`
- `order-booking-form-sheet.tsx`

**Components** (in `apps/web/src/components/activities/`):
- `index.ts`
- `activity-data-table.tsx`
- `activity-form-sheet.tsx`

**Hooks** (in `apps/web/src/hooks/api/`):
- `use-orders.ts`
- `use-activities.ts`
- Update `index.ts`

**Translations**:
- Update `apps/web/messages/en.json` with `adminOrders`, `adminActivities` namespaces
- Update `apps/web/messages/de.json` with German translations

**Navigation**:
- Update `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

---

## 10. Time Formatting Pattern

Order bookings use `time_minutes` (integer). Format as HH:MM for display:

```tsx
function formatTimeMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}
```

---

## 11. Summary

All backend APIs for orders, activities, order assignments, and order bookings are fully implemented and follow standard CRUD patterns. The frontend implementation should follow existing patterns:

1. **List Page with Tabs**: Use booking-types page as reference for Orders/Activities tabs
2. **Detail Page with Tabs**: Use employee detail page as reference for order detail with Assignments/Bookings tabs
3. **Data Tables**: Use cost-center-data-table as reference
4. **Form Sheets**: Use cost-center-form-sheet as reference for orders and activities
5. **Form Dialogs**: Use shift-assignment-form-dialog as reference for order assignments
6. **Status Badges**: Create order-status-badge following member-role-badge pattern
7. **API Hooks**: Follow use-cost-centers pattern with useApiQuery/useApiMutation
8. **Navigation**: Add to sidebar-nav-config.ts management section
9. **Translations**: Create adminOrders, adminActivities namespaces
