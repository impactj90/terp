# Research: ZMI-TICKET-042 Employee Day Plan Assignment UI

Date: 2026-02-02
Ticket: ZMI-TICKET-042

---

## 1. Employee Day Plan Backend APIs

### 1.1 OpenAPI Endpoints

All endpoint definitions are in `/home/tolga/projects/terp/api/paths/employee-day-plans.yaml`.

| Method | Path | Operation ID | Description |
|--------|------|-------------|-------------|
| GET | `/employee-day-plans` | `listEmployeeDayPlans` | List with filters: `employee_id`, `from`, `to`, `source`, `limit`, `cursor` |
| POST | `/employee-day-plans` | `createEmployeeDayPlan` | Create single assignment (409 on duplicate employee+date) |
| POST | `/employee-day-plans/bulk` | `bulkCreateEmployeeDayPlans` | Bulk create/upsert multiple plans |
| POST | `/employee-day-plans/delete-range` | `deleteEmployeeDayPlanRange` | Delete plans in date range for employee |
| GET | `/employee-day-plans/{id}` | `getEmployeeDayPlan` | Get by ID |
| PUT | `/employee-day-plans/{id}` | `updateEmployeeDayPlan` | Update by ID |
| DELETE | `/employee-day-plans/{id}` | `deleteEmployeeDayPlan` | Delete by ID |
| GET | `/employees/{employee_id}/day-plans` | `getEmployeeDayPlansForEmployee` | Get plans in date range (requires `from`, `to`) |
| GET | `/employees/{employee_id}/day-plans/{date}` | `getEmployeeDayPlanForDate` | Get plan for specific date |
| PUT | `/employees/{employee_id}/day-plans/{date}` | `upsertEmployeeDayPlanForDate` | Upsert plan for specific date |

### 1.2 Schemas

All schemas are in `/home/tolga/projects/terp/api/schemas/employee-day-plans.yaml`.

**EmployeeDayPlanSource** (enum): `tariff`, `manual`, `holiday`

**EmployeeDayPlan** (response object):
```yaml
properties:
  id: uuid
  tenant_id: uuid
  employee_id: uuid
  plan_date: date
  day_plan_id: uuid (nullable - null means off day)
  source: EmployeeDayPlanSource
  notes: string
  created_at: date-time
  updated_at: date-time
  day_plan: $ref DayPlan (nested relation)
required: [id, tenant_id, employee_id, plan_date, source]
```

**EmployeeDayPlanList**:
```yaml
properties:
  items: EmployeeDayPlan[]
  next_cursor: string
required: [items]
```

**CreateEmployeeDayPlanRequest**:
```yaml
properties:
  employee_id: uuid (required)
  plan_date: date (required)
  day_plan_id: uuid (nullable)
  source: EmployeeDayPlanSource
  notes: string
```

**UpdateEmployeeDayPlanRequest**:
```yaml
properties:
  day_plan_id: uuid (nullable)
  source: EmployeeDayPlanSource
  notes: string
```

**BulkCreateEmployeeDayPlanRequest**:
```yaml
properties:
  plans: array of {
    employee_id: uuid (required)
    plan_date: date (required)
    day_plan_id: uuid
    source: EmployeeDayPlanSource
    notes: string
  }
required: [plans]
```
Response: `{ created: integer, updated: integer }`

**DeleteRangeRequest**:
```yaml
properties:
  employee_id: uuid (required)
  from: date (required)
  to: date (required)
```
Response: `{ deleted: integer }`

### 1.3 Day Plan Schema (referenced)

File: `/home/tolga/projects/terp/api/schemas/day-plans.yaml`

Key fields used in the grid: `id`, `code`, `name`, `plan_type` (fixed/flextime), `regular_hours`, `is_active`.

**DayPlanSummary** (lightweight reference): `id`, `code`, `name`, `plan_type`.

### 1.4 Generated TypeScript Types

The generated types in `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` already include all employee-day-plan schemas:

```typescript
components['schemas']['EmployeeDayPlan']
components['schemas']['EmployeeDayPlanSource']  // "tariff" | "manual" | "holiday"
components['schemas']['EmployeeDayPlanList']
components['schemas']['CreateEmployeeDayPlanRequest']
components['schemas']['UpdateEmployeeDayPlanRequest']
components['schemas']['BulkCreateEmployeeDayPlanRequest']
components['schemas']['DeleteRangeRequest']
```

The generated `paths` object includes all endpoint type information for type-safe API calls.

---

## 2. Existing Frontend Patterns

### 2.1 Admin Page Pattern

All admin pages follow a consistent pattern. Reference pages:

- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx`

**Standard admin page structure:**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import type { components } from '@/lib/api/types'

type SomeType = components['schemas']['SomeType']

export default function SomePage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminSomething')

  // State: filters, dialog open/close, selected items
  // Hooks: data fetching with useApiQuery wrappers
  // Effects: redirect if not admin, reset page on filter change

  if (authLoading) return <PageSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* Page header: title + subtitle + action button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={...}>{t('action')}</Button>
      </div>

      {/* Filters bar: search + select filters + clear button */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput ... />
        <Select ... />
        {hasFilters && <Button variant="ghost">Clear</Button>}
      </div>

      {/* Data display: Card wrapping table/grid */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? <Skeleton /> : data.length === 0 ? <EmptyState /> : <DataTable />}
        </CardContent>
      </Card>

      {/* Dialogs/Sheets for create, edit, delete, etc. */}
    </div>
  )
}
```

### 2.2 API Hook Pattern

Base hooks in `/home/tolga/projects/terp/apps/web/src/hooks/`:
- `use-api-query.ts` - Wraps `@tanstack/react-query` `useQuery`
- `use-api-mutation.ts` - Wraps `@tanstack/react-query` `useMutation`

Exported from `/home/tolga/projects/terp/apps/web/src/hooks/index.ts`.

Domain hooks are in `/home/tolga/projects/terp/apps/web/src/hooks/api/` and exported from `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`.

**Query hook pattern** (example from `use-employees.ts`):
```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

export function useEmployees(options: UseEmployeesOptions = {}) {
  const { limit = 20, page, search, departmentId, active, enabled = true } = options
  return useApiQuery('/employees', {
    params: { limit, page, q: search, department_id: departmentId, active },
    enabled,
  })
}
```

**Mutation hook pattern** (example from `use-employees.ts`):
```typescript
export function useCreateEmployee() {
  return useApiMutation('/employees', 'post', {
    invalidateKeys: [['/employees']],
  })
}
```

**Query key structure**: `[path, params, pathParams]` (set automatically by useApiQuery).

**Invalidation**: Pass `invalidateKeys` as arrays of query key prefixes. The mutation hook invalidates all matching queries on success.

**Existing hooks to use:**
- `useEmployees` from `use-employees.ts` - employees list with search and department filter
- `useDayPlans` from `use-day-plans.ts` - day plans list for dropdown selector
- `useDepartments` from `use-departments.ts` - departments for filter dropdown

**No existing hooks for employee-day-plans** - these need to be created in a new file `use-employee-day-plans.ts`.

### 2.3 Dialog/Popover/Sheet Patterns

**Dialog** (`/home/tolga/projects/terp/apps/web/src/components/ui/dialog.tsx`): Radix UI Dialog (`@radix-ui/react-dialog`). Full-screen centered modal.

**ConfirmDialog** (`/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`): Uses Sheet with `side="bottom"`. Has `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` (default/destructive), `isLoading`, `onConfirm`.

**Popover** (`/home/tolga/projects/terp/apps/web/src/components/ui/popover.tsx`): Radix UI Popover (`@radix-ui/react-popover`). Components: `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`, `PopoverClose`.

**Sheet** (`/home/tolga/projects/terp/apps/web/src/components/ui/sheet.tsx`): Used for side panels and bottom modals. The project uses Sheet as the main form container pattern (e.g., `DayPlanFormSheet`, `EmployeeFormSheet`).

**Example dialog implementations:**
- `/home/tolga/projects/terp/apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-copy-dialog.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx`

### 2.4 Date Pickers and Calendar Components

**Calendar** (`/home/tolga/projects/terp/apps/web/src/components/ui/calendar.tsx`):
- Custom component (not a library dependency)
- Supports `mode: 'single' | 'range'`
- Props: `month`, `onMonthChange`, `selected`, `onSelect`, `holidays`, `absences`, `minDate`, `maxDate`, `disabledDates`
- Uses `next-intl` for locale-aware weekday names
- Uses `@/lib/time-utils` for date utilities

**DateRangePicker** (`/home/tolga/projects/terp/apps/web/src/components/ui/date-range-picker.tsx`):
- Combines Popover + Calendar in range mode
- Props: `value` (DateRange), `onChange`, `placeholder`, `holidays`, `absences`
- Auto-closes when range is complete
- Export: `DateRange` type (`{ from?: Date; to?: Date }`)

**HolidayYearCalendar** (`/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-year-calendar.tsx`):
- Year-grid view with 12 mini-month calendars (4x3 grid)
- Color-coded cells for holidays by category
- Pattern for rendering a grid of dates with custom cell content
- Uses `parseISODate`, `isWeekend`, `isToday` from time-utils

### 2.5 Sidebar Navigation

File: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

**Structure:**
```typescript
export interface NavItem {
  titleKey: string    // Translation key in 'nav' namespace
  href: string        // Route path
  icon: LucideIcon    // Icon component
  roles?: UserRole[]  // Access control
}

export interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}
```

**Current "management" section** (where new entry would go):
```typescript
{
  titleKey: 'management',
  roles: ['admin'],
  items: [
    { titleKey: 'approvals', href: '/admin/approvals', icon: ClipboardCheck, roles: ['admin'] },
    { titleKey: 'employees', href: '/admin/employees', icon: Users, roles: ['admin'] },
    // ... 10 more items ...
    { titleKey: 'correctionAssistant', href: '/admin/correction-assistant', icon: AlertTriangle, roles: ['admin'] },
  ],
}
```

Available icons already imported: `CalendarDays` is imported but used for day-plans. Could use `CalendarDays` for employee-day-plans too, or import a different icon like `LayoutGrid` or `CalendarClock`.

### 2.6 Breadcrumb Configuration

File: `/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`

The `segmentToKey` mapping converts URL segments to translation keys in the `breadcrumbs` namespace:
```typescript
const segmentToKey: Record<string, string> = {
  // existing entries...
  'day-plans': 'dayPlans',
  // new entry needed:
  // 'employee-day-plans': 'employeeDayPlans',
}
```

### 2.7 Translation/i18n Setup

**Framework**: `next-intl` v4.7.0

**Locale routing** (`/home/tolga/projects/terp/apps/web/src/i18n/routing.ts`):
```typescript
export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'as-needed',
})
```

**Message files:**
- `/home/tolga/projects/terp/apps/web/messages/en.json`
- `/home/tolga/projects/terp/apps/web/messages/de.json`

**Translation namespace pattern:**
- Each page/feature uses a top-level key as namespace
- Example: `adminDayPlans`, `adminEmployees`, `teamOverview`
- Usage: `const t = useTranslations('adminDayPlans')`, then `t('title')`
- Global keys: `common`, `nav`, `sidebar`, `breadcrumbs`, `header`, `calendar`

**For this ticket**, a new namespace key like `employeeDayPlans` should be added with sub-keys for the page title, grid labels, toolbar buttons, dialog labels, etc.

---

## 3. UI Component Library

### 3.1 Library Stack

- **Component system**: shadcn/ui pattern (hand-maintained components in `apps/web/src/components/ui/`)
- **Primitives**: Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-select`, etc.)
- **Styling**: Tailwind CSS v4 with `class-variance-authority` (CVA) for variants, `tailwind-merge` for class merging
- **Icons**: `lucide-react`
- **Data fetching**: `@tanstack/react-query` v5
- **API client**: `openapi-fetch` (type-safe from generated types)
- **Date utility**: Custom `time-utils.ts` + `date-fns` v4 available in deps

### 3.2 Existing UI Components

All in `/home/tolga/projects/terp/apps/web/src/components/ui/`:

| Component | File | Description |
|-----------|------|-------------|
| Badge | `badge.tsx` | Variants: default, secondary, destructive, outline, ghost, link. CVA-based. |
| Table | `table.tsx` | Forwarded-ref components: Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| Grid | `grid.tsx` | Layout grid with `cols` (1-6, 12) and `gap` props. Uses Tailwind grid classes. |
| Skeleton | `skeleton.tsx` | Simple animated div with `bg-accent animate-pulse rounded-md` |
| Popover | `popover.tsx` | Radix Popover with portal, animation. |
| Dialog | `dialog.tsx` | Radix Dialog with overlay, centered content. |
| Calendar | `calendar.tsx` | Custom month calendar with range/single selection. |
| DateRangePicker | `date-range-picker.tsx` | Popover + Calendar combo. |
| SearchInput | `search-input.tsx` | Debounced search with icon and clear. |
| Select | `select.tsx` | Radix Select with trigger, content, items. |
| ConfirmDialog | `confirm-dialog.tsx` | Sheet-based confirmation with destructive variant. |
| Sheet | `sheet.tsx` | Radix Dialog-based side/bottom panel. |

### 3.3 Existing Badge Usage for Reference

**Employee StatusBadge** (`/home/tolga/projects/terp/apps/web/src/components/employees/status-badge.tsx`):
```tsx
<Badge variant="default" className={cn('bg-green-600 hover:bg-green-600/90', className)}>
  {t('statusActive')}
</Badge>
```
Uses Badge with custom bg color class for green. Destructive variant for "exited", secondary for "inactive".

**DayPlan type badge** (in data table):
```tsx
<Badge variant={dayPlan.plan_type === 'fixed' ? 'secondary' : 'outline'}>
  {dayPlan.plan_type === 'fixed' ? t('typeFixed') : t('typeFlextime')}
</Badge>
```

**Pattern for source badges in the grid:**
- `tariff` -> blue background (e.g., `className="bg-blue-500 text-white"`)
- `manual` -> green background (e.g., `className="bg-green-500 text-white"`)
- `holiday` -> orange background (e.g., `className="bg-orange-500 text-white"`)
- Holiday calendar uses similar color-coding pattern in `holiday-year-calendar.tsx`

### 3.4 Loading Skeleton Components

**LoadingSkeleton** (`/home/tolga/projects/terp/apps/web/src/components/layout/loading-skeleton.tsx`):
Full layout skeleton used as auth loading fallback.

**Page-level skeletons**: Each admin page defines its own skeleton function that mimics the page layout:
```tsx
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
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
```

---

## 4. Existing Employee & Day Plan Hooks

### 4.1 useEmployees

File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
function useEmployees(options?: {
  limit?: number      // default 20
  page?: number
  search?: string     // query param 'q'
  departmentId?: string
  active?: boolean
  enabled?: boolean
}): UseQueryResult<EmployeeList>
```

Returns `{ data: { data: Employee[], total, page, limit }, isLoading, isFetching }`.

### 4.2 useDayPlans

File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-day-plans.ts`

```typescript
function useDayPlans(options?: {
  active?: boolean
  planType?: 'fixed' | 'flextime'
  enabled?: boolean
}): UseQueryResult<DayPlanList>
```

Returns `{ data: { data: DayPlan[] }, isLoading }`.

### 4.3 useDepartments

File: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`

```typescript
function useDepartments(options?: {
  enabled?: boolean
  active?: boolean
  parentId?: string
}): UseQueryResult<DepartmentList>
```

Returns `{ data: { data: Department[] }, isLoading }`.

### 4.4 Employee Day Plan Hooks (NOT YET CREATED)

No hooks exist at `apps/web/src/hooks/api/use-employee-day-plans.ts`. This file needs to be created.

Based on the existing pattern and API spec, the following hooks are needed:

```typescript
// Query hooks
useEmployeeDayPlans(params?)          // GET /employee-day-plans
useEmployeeDayPlansForEmployee(id, from, to)  // GET /employees/{id}/day-plans

// Mutation hooks
useCreateEmployeeDayPlan()            // POST /employee-day-plans
useUpsertEmployeeDayPlan()            // PUT /employees/{id}/day-plans/{date}
useBulkCreateEmployeeDayPlans()       // POST /employee-day-plans/bulk
useDeleteEmployeeDayPlanRange()       // POST /employee-day-plans/delete-range
useDeleteEmployeeDayPlan()            // DELETE /employee-day-plans/{id}
```

### 4.5 Hooks Index Export

File: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

All domain hooks are exported from this barrel file. New hooks need to be added here.

---

## 5. Similar Page Implementations

### 5.1 Most Similar: Team Overview Page

File: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx`

This is the closest existing pattern to the calendar-grid view because:
- Uses DateRangePicker for date range selection
- Fetches data for multiple employees across a date range
- Uses `getWeekRange()` from time-utils for default week range
- Uses `formatDate()` to convert dates to API-compatible strings

Key patterns from team-overview:
```typescript
const defaultRange = useMemo(() => {
  const { start, end } = getWeekRange(new Date())
  return { from: start, to: end }
}, [])
const [range, setRange] = useState<DateRange>(defaultRange)
const rangeFrom = range?.from ?? defaultRange.from
const rangeTo = range?.to ?? rangeFrom
const rangeFromDate = formatDate(rangeFrom)
const rangeToDate = formatDate(rangeTo)
```

### 5.2 Most Similar Grid: Holiday Year Calendar

File: `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-year-calendar.tsx`

The holiday calendar is the closest existing component to a date-based grid because:
- Renders a grid of date cells with custom content
- Color-codes cells based on data (holiday categories)
- Uses `parseISODate()`, `isWeekend()`, `isToday()`
- Has click handlers for individual cells
- Uses `useMemo` for grid computation

Key pattern for grid rendering:
```tsx
<div className="grid grid-cols-7 gap-px">
  {week.map((date, dayIndex) => {
    if (!date) return <div key={dayIndex} className="h-5" />
    const holiday = getHoliday(date)
    return (
      <button
        key={dayIndex}
        onClick={() => handleClick(date)}
        className={cn(
          'h-5 w-full text-[10px] rounded-sm transition-colors',
          isHolidayDate && getHolidayCategoryClasses(holidayCategory)
        )}
        title={holiday?.name}
      >
        {date.getDate()}
      </button>
    )
  })}
</div>
```

### 5.3 Data Table Pattern

File: `/home/tolga/projects/terp/apps/web/src/components/day-plans/day-plan-data-table.tsx`

Standard data table pattern using the Table component:
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>{t('columnCode')}</TableHead>
      ...
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map((item) => (
      <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
        <TableCell>{item.code}</TableCell>
        ...
        <TableCell onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>...</DropdownMenu>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 5.4 Employees Page with Bulk Actions

File: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/employees/page.tsx`

The employees page has a `BulkActions` component pattern with multi-select:
```tsx
const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

{selectedIds.size > 0 && (
  <BulkActions
    selectedCount={selectedIds.size}
    selectedIds={selectedIds}
    onClear={() => setSelectedIds(new Set())}
    filters={{ search, isActive: activeFilter }}
  />
)}
```

---

## 6. Routing, Layout, and Access Control

### 6.1 Next.js App Directory Structure

```
apps/web/src/app/[locale]/(dashboard)/
  layout.tsx           -- ProtectedRoute + TenantProvider + AppLayout
  dashboard/page.tsx
  admin/
    employees/page.tsx
    day-plans/page.tsx
    ...
    employee-day-plans/page.tsx  -- NEW (to be created)
```

### 6.2 Dashboard Layout

File: `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/layout.tsx`

```tsx
export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute loadingFallback={<LoadingSkeleton />}>
      <TenantProvider>
        <TenantGuard loadingFallback={<LoadingSkeleton />}>
          <AppLayout>{children}</AppLayout>
        </TenantGuard>
      </TenantProvider>
    </ProtectedRoute>
  )
}
```

Authentication is handled at the layout level. Individual pages do NOT need to wrap themselves in ProtectedRoute.

### 6.3 Role-Based Access Control (Frontend)

Hooks from `/home/tolga/projects/terp/apps/web/src/hooks/use-has-role.ts`:

```typescript
const isAdmin = useHasRole(['admin'])
```

Every admin page follows this pattern:
```typescript
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

// Redirect non-admins
React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])

// Disable queries for non-admins
const { data } = useSomething({ enabled: !authLoading && isAdmin })

// Guard rendering
if (authLoading) return <Skeleton />
if (!isAdmin) return null
```

Available roles: `'user' | 'admin'` (from `UserRole` type).

### 6.4 Sidebar Navigation Entry

The new entry should be added to the `management` section in `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`:

```typescript
{
  titleKey: 'employeeDayPlans',
  href: '/admin/employee-day-plans',
  icon: CalendarDays,  // or another appropriate icon
  roles: ['admin'],
}
```

Needs a corresponding translation key in `nav` namespace in both `en.json` and `de.json`.

### 6.5 Breadcrumb Entry

Add to `segmentToKey` in `/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`:
```typescript
'employee-day-plans': 'employeeDayPlans',
```

Add `employeeDayPlans` key to `breadcrumbs` namespace in both message files.

---

## 7. Time Utilities Available

File: `/home/tolga/projects/terp/apps/web/src/lib/time-utils.ts`

Key functions for the calendar grid:

| Function | Description |
|----------|-------------|
| `getWeekStart(date)` | Monday of the week |
| `getWeekEnd(date)` | Sunday of the week |
| `getWeekRange(date)` | `{ start, end }` for Monday-Sunday |
| `getWeekDates(date)` | Array of 7 Date objects for the week |
| `getMonthRange(date)` | `{ start, end }` for the month |
| `getMonthDates(date)` | Array of Date objects for every day in the month |
| `formatDate(date)` | ISO date string `YYYY-MM-DD` |
| `formatDisplayDate(date, format, locale)` | Localized display: 'short' (DD.MM), 'long', 'weekday' |
| `parseISODate(dateString)` | Parse `YYYY-MM-DD` to Date object (local time, no TZ issues) |
| `isSameDay(date1, date2)` | Check if same calendar day |
| `isToday(date)` | Check if today |
| `isWeekend(date)` | Check if Saturday or Sunday |
| `formatTime(minutesSinceMidnight)` | Format minutes to `HH:MM` |
| `formatDuration(minutes)` | Format minutes to `8h 30m` |

---

## 8. Summary of Files to Create/Modify

### New Files
1. `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx` -- page component
2. `apps/web/src/hooks/api/use-employee-day-plans.ts` -- API hooks
3. `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx` -- main grid
4. `apps/web/src/components/employee-day-plans/day-plan-cell.tsx` -- cell component
5. `apps/web/src/components/employee-day-plans/day-plan-cell-edit-popover.tsx` -- cell edit
6. `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` -- bulk dialog
7. `apps/web/src/components/employee-day-plans/delete-range-dialog.tsx` -- delete range dialog
8. `apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx` -- toolbar
9. `apps/web/src/components/employee-day-plans/day-plan-grid-skeleton.tsx` -- skeleton

### Files to Modify
1. `apps/web/src/hooks/api/index.ts` -- export new hooks
2. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` -- add nav entry
3. `apps/web/src/components/layout/breadcrumbs.tsx` -- add segment mapping
4. `apps/web/messages/en.json` -- add `employeeDayPlans` namespace + nav/breadcrumb keys
5. `apps/web/messages/de.json` -- add `employeeDayPlans` namespace + nav/breadcrumb keys
