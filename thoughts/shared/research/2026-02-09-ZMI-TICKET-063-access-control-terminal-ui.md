# Research: ZMI-TICKET-063 - Access Control & Terminal UI

**Date**: 2026-02-09
**Ticket**: ZMI-TICKET-063
**Backend tickets**: ZMI-TICKET-028 (Access Control), ZMI-TICKET-027 (Terminal Integration)

---

## 1. Admin Page Structure

### File location pattern
All admin pages live at:
```
apps/web/src/app/[locale]/(dashboard)/admin/<feature>/page.tsx
```

### Standard single-entity page (e.g., Schedules, Macros)
File: `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx`

Structure:
1. `'use client'` directive at top
2. Import `useRouter`, `useTranslations`, icons from `lucide-react`
3. Import `useAuth` from `@/providers/auth-provider`
4. Import `useHasRole` from `@/hooks`
5. Import API hooks from `@/hooks/api`
6. Import UI components: `Button`, `Card`, `CardContent`, `SearchInput`, `ConfirmDialog`, `Skeleton`, `Tabs`/`TabsContent`/`TabsList`/`TabsTrigger`
7. Import domain components from `@/components/<feature>`
8. Import types from `@/lib/api/types` using `type { components }`

Key patterns:
- Type alias: `type Schedule = components['schemas']['Schedule']`
- State: `search`, `createOpen`, `editItem`, `deleteItem`
- Auth guard: `useEffect` redirect to `/dashboard` if not admin
- Data fetching: `const { data, isLoading } = useSchedules({ enabled: !authLoading && isAdmin })`
- Data extraction: `const schedules = data?.data ?? []`
- Client-side filtering via `useMemo`
- Skeleton component for loading state
- Empty state component with icon and create button
- Count text with singular/plural: `t('scheduleCount')` / `t('schedulesCount')`

### Multi-tab page (e.g., Orders with tabs)
File: `apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx`

Pattern for page-level tabs:
```tsx
const [activeTab, setActiveTab] = React.useState<'orders' | 'activities'>('orders')

<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'orders' | 'activities')}>
  <TabsList>
    <TabsTrigger value="orders">{t('tabOrders')}</TabsTrigger>
    <TabsTrigger value="activities">{t('tabActivities')}</TabsTrigger>
  </TabsList>
  <TabsContent value="orders" className="space-y-6">
    {/* Search, count, Card with DataTable */}
  </TabsContent>
  <TabsContent value="activities" className="space-y-6">
    {/* Search, count, Card with DataTable */}
  </TabsContent>
</Tabs>
```

Each tab has its own search state, data fetching, and CRUD state. Form sheets and confirm dialogs are placed outside the Tabs component. The "New" button in the header adapts based on `activeTab`.

### Multi-tab page with extracted tab components (e.g., Vacation Config)
File: `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx`

For pages with many tabs, each tab is extracted into a self-contained component:
```tsx
import { SpecialCalculationsTab, CalculationGroupsTab, ... } from '@/components/vacation-config'

<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VacationConfigTab)}>
  <TabsList className="h-auto flex-wrap gap-1">
    <TabsTrigger value="special-calculations">{t('tabSpecialCalculations')}</TabsTrigger>
    ...
  </TabsList>
  <TabsContent value="special-calculations" className="space-y-6">
    <SpecialCalculationsTab />
  </TabsContent>
  ...
</Tabs>
```

Each tab component (e.g., `SpecialCalculationsTab`) is fully self-contained with its own:
- Data fetching hooks
- CRUD state (search, createOpen, editItem, deleteItem)
- Toolbar (Button + SearchInput + optional filters)
- Count text
- Card with Table
- FormSheet (inline or separate component)
- ConfirmDialog

Tab components are organized at `apps/web/src/components/vacation-config/` with an `index.ts` barrel export.

---

## 2. Data Table Pattern

### File location
```
apps/web/src/components/<feature>/<feature>-data-table.tsx
```

### Structure (from `order-data-table.tsx`, `schedule-data-table.tsx`)

```tsx
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react'
import type { components } from '@/lib/api/types'

type Order = components['schemas']['Order']

interface OrderDataTableProps {
  items: Order[]
  isLoading: boolean
  onView: (item: Order) => void
  onEdit: (item: Order) => void
  onDelete: (item: Order) => void
}

export function OrderDataTable({ items, isLoading, onView, onEdit, onDelete }: OrderDataTableProps) {
  const t = useTranslations('adminOrders')

  if (isLoading) return <OrderDataTableSkeleton />
  if (items.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnCode')}</TableHead>
          ...
          <TableHead className="w-16"><span className="sr-only">{t('columnActions')}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
            <TableCell>{item.code}</TableCell>
            ...
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>
                    <Eye className="mr-2 h-4 w-4" />{t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />{t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(item)}>
                    <Trash2 className="mr-2 h-4 w-4" />{t('delete')}
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

Key details:
- **No tanstack/react-table** is used -- tables are built with raw `<Table>` components from `@/components/ui/table`
- No built-in sorting/pagination/column-visibility -- it is all manual via `useMemo` at the page level
- Each data table includes a `*Skeleton` companion function
- Row actions use `DropdownMenu` with `MoreHorizontal` icon
- `onClick={(e) => e.stopPropagation()}` on action cells to prevent row click
- Status displayed using Badge components (e.g., `OrderStatusBadge`)
- Dates formatted with `date-fns` `format(new Date(date), 'dd.MM.yyyy')`
- Toggle switches (e.g., enable/disable) use `Switch` component directly in table cells
- Props: `items`, `isLoading`, callback functions (`onView`, `onEdit`, `onDelete`, etc.)

### Status badge pattern
File: `apps/web/src/components/orders/order-status-badge.tsx`

```tsx
const statusConfig: Record<Status, { labelKey: string; className: string }> = {
  planned: { labelKey: 'statusPlanned', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  active: { labelKey: 'statusActive', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  ...
}

export function OrderStatusBadge({ status }) {
  const config = statusConfig[status]
  return <Badge variant="secondary" className={config.className}>{t(config.labelKey)}</Badge>
}
```

---

## 3. Form Sheet Pattern

### File location
```
apps/web/src/components/<feature>/<feature>-form-sheet.tsx
```

### Structure (from `order-form-sheet.tsx`)

```tsx
interface OrderFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: Order | null       // null = create mode, object = edit mode
  onSuccess?: () => void
}

interface FormState { code: string; name: string; ... }
const INITIAL_STATE: FormState = { code: '', name: '', ... }

export function OrderFormSheet({ open, onOpenChange, order, onSuccess }) {
  const isEdit = !!order
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateOrder()
  const updateMutation = useUpdateOrder()

  // Reset form when sheet opens
  React.useEffect(() => {
    if (open) {
      if (order) { setForm({ ...map from order... }) }
      else { setForm(INITIAL_STATE) }
      setError(null)
    }
  }, [open, order])

  // Validation + submit
  const handleSubmit = async () => {
    // validate
    // isEdit ? updateMutation.mutateAsync(...) : createMutation.mutateAsync(...)
    onSuccess?.()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editOrder') : t('newOrder')}</SheetTitle>
          <SheetDescription>...</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Form sections with <Label>, <Input>, <Select>, <Switch>, etc. */}
            {error && <Alert variant="destructive">...</Alert>}
          </div>
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" ...>Cancel</Button>
          <Button ...>{isSubmitting && <Loader2 />} Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

Key details:
- Uses `Sheet` (right side panel), not `Dialog`
- `SheetContent side="right" className="w-full sm:max-w-lg flex flex-col"`
- `ScrollArea` for scrollable form body
- Form sections separated by `<h3 className="text-sm font-medium text-muted-foreground">`
- `Label htmlFor` + `Input id` matching
- Error display in `<Alert variant="destructive">`
- Footer with Cancel/Submit buttons, both `className="flex-1"`
- Loading state: `<Loader2 className="mr-2 h-4 w-4 animate-spin" />`
- Code field disabled on edit (`disabled={isSubmitting || isEdit}`)
- Related data fetched conditionally: `useCostCenters({ enabled: open })`

---

## 4. Form Dialog Pattern

### File location
```
apps/web/src/components/<feature>/<feature>-form-dialog.tsx
```

### Structure (from `order-assignment-form-dialog.tsx`)

Used for simpler forms (e.g., assignments):

```tsx
interface OrderAssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  assignment?: OrderAssignment | null
  onSuccess?: () => void
}

export function OrderAssignmentFormDialog({ open, onOpenChange, orderId, assignment, onSuccess }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>...</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Form fields */}
        </div>
        {error && <Alert variant="destructive">...</Alert>}
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>{isPending && <Loader2 />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Key differences from FormSheet:
- Uses `Dialog`/`DialogContent` instead of `Sheet`/`SheetContent`
- No `ScrollArea` needed (simpler forms)
- `className="sm:max-w-md"` for dialog width
- Employee select loads via `useEmployees({ active: true, enabled: open })`
- Select `__none__` sentinel value for "no selection"

---

## 5. API Hook Pattern

### File location
```
apps/web/src/hooks/api/use-<feature>.ts
```

### Structure (from `use-orders.ts`, `use-schedules.ts`, `use-macros.ts`)

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseOrdersOptions {
  active?: boolean
  status?: 'planned' | 'active' | 'completed' | 'cancelled'
  enabled?: boolean
}

// List
export function useOrders(options: UseOrdersOptions = {}) {
  const { active, status, enabled = true } = options
  return useApiQuery('/orders', { params: { active, status }, enabled })
}

// Get by ID
export function useOrder(id: string, enabled = true) {
  return useApiQuery('/orders/{id}', { path: { id }, enabled: enabled && !!id })
}

// Create
export function useCreateOrder() {
  return useApiMutation('/orders', 'post', { invalidateKeys: [['/orders']] })
}

// Update
export function useUpdateOrder() {
  return useApiMutation('/orders/{id}', 'patch', { invalidateKeys: [['/orders']] })
}

// Delete
export function useDeleteOrder() {
  return useApiMutation('/orders/{id}', 'delete', { invalidateKeys: [['/orders']] })
}
```

### Underlying hooks
- `useApiQuery` (at `apps/web/src/hooks/use-api-query.ts`): wraps `@tanstack/react-query` `useQuery`. Type-safe via OpenAPI path inference. Takes `path`, optional `params` (query), `path` (path params), plus standard `useQuery` options.
- `useApiMutation` (at `apps/web/src/hooks/use-api-mutation.ts`): wraps `useMutation`. Takes OpenAPI path, HTTP method, and options including `invalidateKeys` for cache invalidation. Mutations are called with `{ body, path }` variables.

### Barrel export
All hooks are re-exported from `apps/web/src/hooks/api/index.ts`.

### Query hooks with filters (from `use-evaluations.ts`)
```tsx
export function useEvaluationTerminalBookings(options = {}) {
  const { from, to, employee_id, ..., enabled = true } = options
  return useApiQuery('/evaluations/terminal-bookings', {
    params: { from: from!, to: to!, employee_id, ... },
    enabled: enabled && !!from && !!to,
  })
}
```

---

## 6. Sidebar Navigation

### File
`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

### Structure
```tsx
export interface NavItem {
  titleKey: string   // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
}

export interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [
  { titleKey: 'main', items: [...] },
  { titleKey: 'management', roles: ['admin'], items: [...] },
  { titleKey: 'administration', roles: ['admin'], items: [...] },
]
```

### Current sections
1. **main** (no role restriction) - Dashboard, Team Overview, Time Clock, Timesheet, Absences, Vacation, Monthly Evaluation, Year Overview
2. **management** (admin only) - Approvals, Employees, Teams, Departments, Cost Centers, Locations, Employment Types, Day Plans, Week Plans, Tariffs, Holidays, Absence Types, Booking Types, Contact Types, Calculation Rules, Accounts, Correction Assistant, Evaluations, Monthly Values, Vacation Balances, Vacation Config, Shift Planning, Orders
3. **administration** (admin only) - Users, User Groups, Reports, Audit Logs, Settings, Tenants, Payroll Exports, Export Interfaces, Monthly Evaluations, Schedules, Macros

### Icons imported from lucide-react
Already imported in sidebar-nav-config.ts: `Shield`, `ShieldCheck`, `Timer`, `Repeat`, etc.
Available for use: `Shield` (already used for Tenants), `ShieldCheck` (already used for User Groups).

### Translation keys
Translation keys for nav items use camelCase in the `nav` namespace:
- `nav.accessControl`, `nav.terminalBookings` (to be added)

---

## 7. Translation / i18n Pattern

### Files
- `apps/web/messages/en.json` - English translations
- `apps/web/messages/de.json` - German translations

### Library
`next-intl` with `useTranslations` hook.

### Usage
```tsx
const t = useTranslations('adminOrders')
t('title')       // -> "Orders"
t('subtitle')    // -> "Manage orders and project-based time tracking"
t('ordersCount', { count: filteredOrders.length })  // -> "5 orders"
```

### Top-level key naming convention
- `adminOrders` for `/admin/orders` page
- `adminSchedules` for `/admin/schedules` page
- `nav` for navigation labels
- `common` for shared strings

### Translation key structure for a typical CRUD page (from `adminOrders`)
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
    "deleteDescription": "Are you sure you want to delete order \"{name}\"?",
    "searchPlaceholder": "Search orders...",
    "clearFilters": "Clear Filters",
    "orderCount": "{count} order",
    "ordersCount": "{count} orders",
    "columnCode": "Code",
    "columnName": "Name",
    "columnStatus": "Status",
    "columnActions": "Actions",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",
    "saving": "Saving...",
    "saveChanges": "Save Changes",
    "create": "Create",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    ...
  }
}
```

For multi-tab pages with extracted tab components (vacation-config pattern), translations use dot notation within the same namespace:
```json
{
  "adminVacationConfig": {
    "title": "Vacation Configuration",
    "tabSpecialCalculations": "Special Calculations",
    "specialCalc.new": "New Special Calculation",
    "specialCalc.searchPlaceholder": "Search...",
    "specialCalc.columnType": "Type",
    ...
  }
}
```

---

## 8. Tabs Implementation

### UI component
`apps/web/src/components/ui/tabs.tsx` - wraps `@radix-ui/react-tabs`.

Exports: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`

### Usage patterns

#### Simple tabs (page-level state)
```tsx
const [activeTab, setActiveTab] = React.useState<'orders' | 'activities'>('orders')

<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ...)}>
  <TabsList>
    <TabsTrigger value="orders">{t('tabOrders')}</TabsTrigger>
    <TabsTrigger value="activities">{t('tabActivities')}</TabsTrigger>
  </TabsList>
  <TabsContent value="orders" className="space-y-6">...</TabsContent>
  <TabsContent value="activities" className="space-y-6">...</TabsContent>
</Tabs>
```

#### Many tabs with wrapping
```tsx
<TabsList className="h-auto flex-wrap gap-1">
  <TabsTrigger value="special-calculations">...</TabsTrigger>
  <TabsTrigger value="calculation-groups">...</TabsTrigger>
  ...
</TabsList>
```

#### Tabs as inline filter (within a tab content area)
```tsx
<Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
  <TabsList>
    <TabsTrigger value="all">All</TabsTrigger>
    <TabsTrigger value="age">Age</TabsTrigger>
    ...
  </TabsList>
</Tabs>
```

---

## 9. UI Component Library

### Base
The project uses **shadcn/ui** components stored in `apps/web/src/components/ui/`. These are local, customizable copies (not from a package).

### Available components (relevant to this ticket)
| Component | Path |
|-----------|------|
| Alert | `ui/alert.tsx` |
| Badge | `ui/badge.tsx` |
| Button | `ui/button.tsx` |
| Calendar | `ui/calendar.tsx` |
| Card | `ui/card.tsx` |
| Checkbox | `ui/checkbox.tsx` |
| ConfirmDialog | `ui/confirm-dialog.tsx` |
| DateRangePicker | `ui/date-range-picker.tsx` |
| Dialog | `ui/dialog.tsx` |
| DropdownMenu | `ui/dropdown-menu.tsx` |
| Input | `ui/input.tsx` |
| Label | `ui/label.tsx` |
| Pagination | `ui/pagination.tsx` |
| ScrollArea | `ui/scroll-area.tsx` |
| SearchInput | `ui/search-input.tsx` |
| Select | `ui/select.tsx` |
| Sheet | `ui/sheet.tsx` |
| Skeleton | `ui/skeleton.tsx` |
| Switch | `ui/switch.tsx` |
| Table | `ui/table.tsx` |
| Tabs | `ui/tabs.tsx` |
| Textarea | `ui/textarea.tsx` |
| Tooltip | `ui/tooltip.tsx` |

### Badge variants
From `badge.tsx`: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`

### ConfirmDialog
Uses `Sheet` with `side="bottom"`, not a `Dialog`. Has `variant: 'default' | 'destructive'` prop.

---

## 10. Component Organization & Barrel Exports

### Directory structure per feature
```
apps/web/src/components/<feature>/
  index.ts                        # Barrel exports
  <feature>-data-table.tsx        # Data table
  <feature>-form-sheet.tsx        # CRUD form (Sheet)
  <feature>-status-badge.tsx      # Status badge (optional)
  <feature>-*-form-dialog.tsx     # Sub-entity form (Dialog, optional)
  <feature>-*-data-table.tsx      # Sub-entity table (optional)
```

### Barrel export example (`orders/index.ts`)
```tsx
export { OrderStatusBadge } from './order-status-badge'
export { OrderAssignmentRoleBadge } from './order-assignment-role-badge'
export { OrderDataTable } from './order-data-table'
export { OrderAssignmentDataTable } from './order-assignment-data-table'
export { OrderFormSheet } from './order-form-sheet'
export { OrderAssignmentFormDialog } from './order-assignment-form-dialog'
```

---

## 11. Available API Endpoints (from OpenAPI types)

### Access Zones
| Endpoint | Method | Schema |
|----------|--------|--------|
| `/access-zones` | GET | `AccessZoneList` (no pagination meta) |
| `/access-zones` | POST | `CreateAccessZoneRequest` -> `AccessZone` |
| `/access-zones/{id}` | GET | `AccessZone` |
| `/access-zones/{id}` | PATCH | `UpdateAccessZoneRequest` -> `AccessZone` |
| `/access-zones/{id}` | DELETE | 204 |

**AccessZone schema**: `id`, `tenant_id`, `code`, `name`, `description?`, `is_active?`, `sort_order?`, `created_at?`, `updated_at?`
**CreateAccessZoneRequest**: `code`, `name`, `description?`, `sort_order?`
**UpdateAccessZoneRequest**: `name?`, `description?`, `is_active?`, `sort_order?`

### Access Profiles
| Endpoint | Method | Schema |
|----------|--------|--------|
| `/access-profiles` | GET | `AccessProfileList` (no pagination meta) |
| `/access-profiles` | POST | `CreateAccessProfileRequest` -> `AccessProfile` |
| `/access-profiles/{id}` | GET | `AccessProfile` |
| `/access-profiles/{id}` | PATCH | `UpdateAccessProfileRequest` -> `AccessProfile` |
| `/access-profiles/{id}` | DELETE | 204 (fails if referenced) |

**AccessProfile schema**: `id`, `tenant_id`, `code`, `name`, `description?`, `is_active?`, `created_at?`, `updated_at?`
**CreateAccessProfileRequest**: `code`, `name`, `description?`
**UpdateAccessProfileRequest**: `name?`, `description?`, `is_active?`

### Employee Access Assignments
| Endpoint | Method | Schema |
|----------|--------|--------|
| `/employee-access-assignments` | GET | `EmployeeAccessAssignmentList` (no pagination) |
| `/employee-access-assignments` | POST | `CreateEmployeeAccessAssignmentRequest` -> `EmployeeAccessAssignment` |
| `/employee-access-assignments/{id}` | GET | `EmployeeAccessAssignment` |
| `/employee-access-assignments/{id}` | PATCH | `UpdateEmployeeAccessAssignmentRequest` -> `EmployeeAccessAssignment` |
| `/employee-access-assignments/{id}` | DELETE | 204 |

**EmployeeAccessAssignment schema**: `id`, `tenant_id`, `employee_id`, `access_profile_id`, `valid_from?`, `valid_to?`, `is_active?`, `created_at?`, `updated_at?`
**CreateEmployeeAccessAssignmentRequest**: `employee_id`, `access_profile_id`, `valid_from?`, `valid_to?`
**UpdateEmployeeAccessAssignmentRequest**: `valid_from?`, `valid_to?`, `is_active?`

### Terminal Bookings
| Endpoint | Method | Schema |
|----------|--------|--------|
| `/terminal-bookings` | GET | `RawTerminalBookingList` (with `PaginationMeta`) |
| `/terminal-bookings/import` | POST | `TriggerTerminalImportRequest` -> `TriggerTerminalImportResponse` |

**Query params for GET**: `from` (required), `to` (required), `terminal_id?`, `employee_id?`, `status?` (pending/processed/failed/skipped), `import_batch_id?`, `limit?`, `page?`

**RawTerminalBooking schema**: `id`, `tenant_id`, `import_batch_id`, `terminal_id`, `employee_pin`, `employee_id?`, `raw_timestamp`, `raw_booking_code`, `booking_date`, `booking_type_id?`, `processed_booking_id?`, `status` (enum: pending/processed/failed/skipped), `error_message?`, `employee?` (EmployeeSummary), `booking_type?` (BookingTypeSummary), `created_at?`, `updated_at?`

**TriggerTerminalImportRequest**: `batch_reference`, `terminal_id`, `bookings[]` (each: `employee_pin`, `raw_timestamp`, `raw_booking_code`)
**TriggerTerminalImportResponse**: `batch` (ImportBatch), `message?`, `was_duplicate?`

### Import Batches
| Endpoint | Method | Schema |
|----------|--------|--------|
| `/import-batches` | GET | `ImportBatchList` (with `PaginationMeta`) |
| `/import-batches/{id}` | GET | `ImportBatch` |

**Query params for GET**: `status?` (pending/processing/completed/failed), `terminal_id?`, `limit?`, `page?`

**ImportBatch schema**: `id`, `tenant_id`, `batch_reference`, `source`, `terminal_id?`, `status` (enum: pending/processing/completed/failed), `records_total?`, `records_imported?`, `records_failed?`, `error_message?`, `started_at?`, `completed_at?`, `created_at?`, `updated_at?`

Note: The `ImportBatch` schema does not have a `records_skipped` field. The ticket mentions "Skipped" in the import batch table but the schema only has `records_total`, `records_imported`, `records_failed`.

---

## 12. Auth & Role Guard Pattern

```tsx
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'

const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])

// Data fetching gated on auth
const { data, isLoading } = useOrders({ enabled: !authLoading && isAdmin })

// Early returns
if (authLoading) return <PageSkeleton />
if (!isAdmin) return null
```

---

## 13. Key Files Summary

| Purpose | Path |
|---------|------|
| Sidebar nav config | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |
| API hooks barrel | `apps/web/src/hooks/api/index.ts` |
| useApiQuery | `apps/web/src/hooks/use-api-query.ts` |
| useApiMutation | `apps/web/src/hooks/use-api-mutation.ts` |
| OpenAPI types | `apps/web/src/lib/api/types.ts` |
| API client | `apps/web/src/lib/api/client.ts` |
| EN translations | `apps/web/messages/en.json` |
| DE translations | `apps/web/messages/de.json` |
| Tab page example (inline) | `apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx` |
| Tab page example (extracted) | `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx` |
| Data table example | `apps/web/src/components/orders/order-data-table.tsx` |
| Form sheet example | `apps/web/src/components/orders/order-form-sheet.tsx` |
| Form dialog example | `apps/web/src/components/orders/order-assignment-form-dialog.tsx` |
| Status badge example | `apps/web/src/components/orders/order-status-badge.tsx` |
| API hook example (simple CRUD) | `apps/web/src/hooks/api/use-orders.ts` |
| API hook example (with sub-resources) | `apps/web/src/hooks/api/use-schedules.ts` |
| API hook example (with filters) | `apps/web/src/hooks/api/use-evaluations.ts` |
| Self-contained tab example | `apps/web/src/components/vacation-config/special-calculations-tab.tsx` |
| DateRangePicker component | `apps/web/src/components/ui/date-range-picker.tsx` |
| ConfirmDialog component | `apps/web/src/components/ui/confirm-dialog.tsx` |
| useHasRole hook | `apps/web/src/hooks/use-has-role.ts` |
