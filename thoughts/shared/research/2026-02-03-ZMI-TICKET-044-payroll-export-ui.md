# Research: ZMI-TICKET-044 Payroll Export UI

Date: 2026-02-03
Ticket: ZMI-TICKET-044

---

## 1. Backend API Endpoints (OpenAPI Spec)

### 1.1 Payroll Export Endpoints

All endpoint definitions are in `/home/tolga/projects/terp/api/paths/payroll-exports.yaml`.

| Method | Path | Operation ID | Description | Response |
|--------|------|-------------|-------------|----------|
| GET | `/payroll-exports` | `listPayrollExports` | List exports with filters: `year`, `month`, `status`, `limit`, `cursor` | `PayrollExportList` (200) |
| POST | `/payroll-exports` | `generatePayrollExport` | Start async export generation | `PayrollExport` (202), ProblemDetails (409 = month not closed) |
| GET | `/payroll-exports/{id}` | `getPayrollExport` | Get single export by ID | `PayrollExport` (200) |
| DELETE | `/payroll-exports/{id}` | `deletePayrollExport` | Delete export | 204 |
| GET | `/payroll-exports/{id}/download` | `downloadPayrollExport` | Download export file (binary) | file (200), ProblemDetails (409 = not ready) |
| GET | `/payroll-exports/{id}/preview` | `previewPayrollExport` | Preview export data as JSON | inline object with `lines[]` + `summary` (200), ProblemDetails (409 = not ready) |

### 1.2 Export Interface Endpoints (for interface selection dropdown)

Definitions in `/home/tolga/projects/terp/api/paths/export-interfaces.yaml`.

| Method | Path | Operation ID | Description |
|--------|------|-------------|-------------|
| GET | `/export-interfaces` | `listExportInterfaces` | List interfaces (param: `active_only`) |
| GET | `/export-interfaces/{id}` | `getExportInterface` | Get single interface |

### 1.3 Schemas

#### PayrollExport (response object)

Schema in `/home/tolga/projects/terp/api/schemas/payroll-exports.yaml`.

```
properties:
  id: uuid (required)
  tenant_id: uuid (required)
  export_interface_id: uuid (nullable)
  year: integer (required)
  month: integer 1-12 (required)
  status: enum [pending, generating, completed, failed] (required)
  export_type: enum [standard, datev, sage, custom]
  parameters: object { employee_ids: uuid[], department_ids: uuid[], include_accounts: uuid[] }
  format: enum [csv, xlsx, xml, json]
  file_url: uri (nullable)
  file_size: integer (nullable)
  row_count: integer (nullable)
  employee_count: integer
  total_hours: decimal
  total_overtime: decimal
  requested_at: date-time
  started_at: date-time (nullable)
  completed_at: date-time (nullable)
  error_message: string (nullable)
  created_by: uuid (nullable)
  created_at: date-time
  updated_at: date-time
```

#### GeneratePayrollExportRequest (request body)

```
required: [year, month, format]
properties:
  year: integer
  month: integer 1-12
  export_type: enum [standard, datev, sage, custom] (default: standard)
  format: enum [csv, xlsx, xml, json]
  export_interface_id: uuid (optional)
  parameters: object { employee_ids: uuid[], department_ids: uuid[], include_accounts: uuid[] }
```

#### PayrollExportList

```
properties:
  data: PayrollExport[]
  meta: PaginationMeta
```

#### PayrollExportLine (preview response - inline in v3 types)

```
properties:
  employee_id: uuid (required)
  personnel_number: string (required)
  first_name: string
  last_name: string
  department_code: string
  cost_center_code: string
  target_hours: decimal
  worked_hours: decimal
  overtime_hours: decimal
  account_values: object (key: string account code -> value: decimal hours)
  vacation_days: decimal
  sick_days: decimal
  other_absence_days: decimal
```

#### Preview Response (inline)

```
properties:
  lines: PayrollExportLine[]
  summary: { employee_count: int, total_hours: decimal, total_overtime: decimal }
```

#### ExportInterface (for dropdown)

```
properties:
  id: uuid
  tenant_id: uuid
  interface_number: integer
  name: string
  mandant_number: string (nullable)
  export_script: string (nullable)
  export_path: string (nullable)
  output_filename: string (nullable)
  is_active: boolean
  accounts: ExportInterfaceAccount[]
  created_at: date-time
  updated_at: date-time
```

### 1.4 TypeScript Types (Generated)

The OpenAPI v3 bundled spec at `/home/tolga/projects/terp/api/openapi.bundled.v3.yaml` has been converted to TypeScript types at `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`.

Available typed schemas (accessible via `components['schemas']`):
- `PayrollExport` (line 8176)
- `GeneratePayrollExportRequest` (line 8241)
- `PayrollExportList` (line 8262)
- `ExportInterface` (line 8113)
- `ExportInterfaceList` (line 8170)

Available typed operations:
- `listPayrollExports` (line 15740)
- `generatePayrollExport` (line 15770)
- `getPayrollExport` (line 15805)
- `deletePayrollExport` (line 15829)
- `downloadPayrollExport` (line 15851)
- `previewPayrollExport` (line 15892)

**NOTE**: The `PayrollExportLine` schema is NOT a separate named schema in the v3 types. The preview response defines lines inline. The preview response type is inlined in the `previewPayrollExport` operation at line 15909.

**NOTE**: The `generatePayrollExport` returns HTTP 202 (not 200/201). The `useApiMutation` hook only infers return types from 200/201 responses, so the return type will resolve to `void`. A custom hook with manual typing will be needed (same pattern as `useRecalculateMonthlyValues` in `use-admin-monthly-values.ts`).

### 1.5 Generated Go Models

Located in `/home/tolga/projects/terp/apps/api/gen/models/`:

- `payroll_export.go` - `PayrollExport` struct with nested `PayrollExportParameters`
- `payroll_export_list.go` - `PayrollExportList` struct with `[]*PayrollExport` data and `*PaginationMeta`
- `generate_payroll_export_request.go` - `GeneratePayrollExportRequest` with nested `GeneratePayrollExportRequestParameters`
- `export_interface.go` - `ExportInterface` struct

No `PayrollExportLine` Go model exists (preview endpoint uses inline schema).

---

## 2. Frontend Architecture Patterns

### 2.1 App Router Structure

```
apps/web/src/app/[locale]/(dashboard)/
  layout.tsx                    -- ProtectedRoute + TenantProvider + TenantGuard + AppLayout
  admin/
    monthly-values/page.tsx     -- Example: complex admin list page with filters, selection, batch actions
    correction-assistant/page.tsx -- Example: tabbed admin page with pagination
    booking-types/page.tsx      -- Example: simpler CRUD list page
    employee-day-plans/page.tsx -- Example: calendar-based admin page
    employees/
      page.tsx
      [id]/page.tsx             -- Example: detail route
    ...
```

All admin pages use `'use client'` directive and follow this pattern:
1. Import hooks, UI components
2. Auth guard via `useHasRole(['admin'])` + `useEffect` redirect
3. State management for filters, selection, dialogs
4. Conditional rendering: skeleton -> empty state -> data table
5. Sheet/dialog overlays managed via boolean state

### 2.2 Page Pattern (from monthly-values/page.tsx - closest match)

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { /* domain hooks */ } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { /* domain components */ } from '@/components/domain-name'

export default function PageName() {
  const router = useRouter()
  const t = useTranslations('namespace')
  const locale = useLocale()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // State for filters
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  // ... more filter state

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const enabled = !authLoading && isAdmin

  // Queries
  const { data, isLoading } = useSomeHook({ ...params, enabled })

  // Auth loading state
  if (authLoading) return <PageSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>
      <ToolbarComponent ... />
      <Card>
        <CardContent className="p-0">
          {isLoading ? <DataTable items={[]} isLoading={true} ... />
           : items.length === 0 ? <EmptyState />
           : <DataTable items={items} ... />}
        </CardContent>
      </Card>
      <DetailSheet ... />
      <Dialogs ... />
    </div>
  )
}
```

### 2.3 Component Organization

Each admin domain has its own component directory:

```
apps/web/src/components/monthly-values/
  index.ts                         -- barrel exports
  monthly-values-data-table.tsx    -- Table component with Row type export
  monthly-values-toolbar.tsx       -- Filter controls (year/month nav, dropdowns, search)
  monthly-values-detail-sheet.tsx  -- Side sheet for item details
  monthly-values-batch-actions.tsx -- Selection action bar
  batch-close-dialog.tsx           -- Complex dialog with state machine
  batch-reopen-dialog.tsx          -- Simpler dialog
  recalculate-dialog.tsx           -- Simpler dialog
  monthly-values-skeleton.tsx      -- Loading skeleton
```

The barrel `index.ts` exports all public components and types:
```ts
export { MonthlyValuesDataTable } from './monthly-values-data-table'
export type { MonthlyValueRow } from './monthly-values-data-table'
export { MonthlyValuesToolbar } from './monthly-values-toolbar'
// ... etc
```

---

## 3. API Hooks Patterns

### 3.1 Two Hook Systems

The codebase has TWO hook patterns used in parallel:

**Pattern A: `useApiQuery` / `useApiMutation` (openapi-fetch typed)**
- Used by most hooks (booking-types, admin-monthly-values, employees, etc.)
- Located in `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts` and `use-api-mutation.ts`
- Wraps `openapi-fetch` client with `@tanstack/react-query`
- Fully type-safe against OpenAPI spec
- Example (`use-booking-types.ts`):

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

export function useBookingTypes(options = {}) {
  return useApiQuery('/booking-types', { params: { active }, enabled })
}

export function useDeleteBookingType() {
  return useApiMutation('/booking-types/{id}', 'delete', {
    invalidateKeys: [['/booking-types']],
  })
}
```

**Pattern B: Manual `apiRequest` helper (raw fetch)**
- Used by correction-assistant and monthly-values hooks
- Each hook file defines its own `apiRequest()` function
- Manually constructs URLs with query params
- Manually defines TypeScript interfaces
- Example (`use-correction-assistant.ts`):

```ts
async function apiRequest(url: string, options?: RequestInit) { ... }

export function useCorrectionAssistantItems(options = {}) {
  const queryParams = new URLSearchParams()
  // ... build query string manually
  return useQuery<CorrectionAssistantList>({
    queryKey: ['correction-assistant', params],
    queryFn: () => apiRequest(url),
    enabled,
  })
}
```

**Recommendation for new hooks**: Use Pattern A (`useApiQuery`/`useApiMutation`) as it's the standard approach with full type safety. Use Pattern B only for endpoints with non-standard response codes (like 202).

### 3.2 Hook File Structure

Located in `/home/tolga/projects/terp/apps/web/src/hooks/api/`.

Index file at `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts` re-exports all hooks.

Pattern for new hook file (`use-payroll-exports.ts`):
- Define TypeScript interfaces if using manual pattern
- Export query hooks (usePayrollExports, usePayrollExport)
- Export mutation hooks (useGeneratePayrollExport, useDeletePayrollExport)
- Export custom hooks for special cases (download blob, preview)

### 3.3 Special Cases for Payroll Exports

1. **`generatePayrollExport` returns 202**: The `useApiMutation` type helper only infers from 200/201 responses. Same situation as `useRecalculateMonthlyValues` in `use-admin-monthly-values.ts` which uses a custom `useMutation` with manual typing:

```ts
export function useRecalculateMonthlyValues() {
  const queryClient = useQueryClient()
  return useMutation<
    { message?: string; affected_employees?: number },
    Error,
    { body: { year: number; month: number; ... } }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/monthly-values/recalculate' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as { ... }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/payroll-exports'] })
    },
  })
}
```

2. **Download endpoint returns binary file**: The openapi-fetch client returns string content types. A custom hook using raw `fetch` with blob response handling will be needed.

3. **Polling for async status**: Use React Query's `refetchInterval` option on `useApiQuery`:
```ts
useApiQuery('/payroll-exports/{id}', {
  path: { id },
  refetchInterval: (query) => {
    const status = query.state.data?.status
    return (status === 'pending' || status === 'generating') ? 3000 : false
  },
})
```

### 3.4 API Client Infrastructure

- **Client**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts` - openapi-fetch with auth + tenant middleware
- **Types**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` - generated from OpenAPI v3 bundled spec
- **Errors**: `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts` - `ProblemDetails` (RFC 7807), `ApiError`, `parseApiError()`, `isHttpStatus()`, `getErrorMessage()`
- **Index**: `/home/tolga/projects/terp/apps/web/src/lib/api/index.ts` - barrel exports `api`, `authStorage`, `tenantIdStorage`, types, error utilities

---

## 4. Navigation / Sidebar

### 4.1 Configuration

File: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Navigation is organized into sections defined in `navConfig: NavSection[]`:

```ts
export interface NavItem {
  titleKey: string    // Translation key in 'nav' namespace
  href: string        // Route path
  icon: LucideIcon    // Lucide icon component
  roles?: UserRole[]  // Required roles (undefined = all)
  badge?: number      // Optional badge count
}

export interface NavSection {
  titleKey: string    // Translation key in 'nav' namespace
  roles?: UserRole[]  // Required roles for entire section
  items: NavItem[]
}
```

Current sections:
1. **`main`** - Dashboard, Team Overview, Time Clock, Timesheet, Absences, Vacation, Monthly Evaluation, Year Overview
2. **`management`** (`roles: ['admin']`) - Approvals, Employees, Teams, Departments, Employment Types, Day Plans, Employee Day Plans, Week Plans, Tariffs, Holidays, Absence Types, Booking Types, Accounts, Correction Assistant, Monthly Values
3. **`administration`** (`roles: ['admin']`) - Users, User Groups, Reports, Settings, Tenants

The ticket specifies payroll exports should go in the "Administration" section. Currently this section has: Users, User Groups, Reports, Settings, Tenants.

### 4.2 Adding a Navigation Item

To add payroll exports to the sidebar:

1. Import the icon (`FileOutput` from lucide-react) in `sidebar-nav-config.ts`
2. Add entry to the `administration` section items array:
```ts
{
  titleKey: 'payrollExports',
  href: '/admin/payroll-exports',
  icon: FileOutput,
  roles: ['admin'],
}
```
3. Add translation key `payrollExports` to `nav` namespace in both `en.json` and `de.json`

### 4.3 Sidebar Components

- `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav.tsx` - Renders sections with role-based filtering
- `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-item.tsx` - Individual nav item with active state, collapsed tooltip
- `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-context.tsx` - Sidebar collapse state

---

## 5. Translation Structure

### 5.1 Files

- English: `/home/tolga/projects/terp/apps/web/messages/en.json`
- German: `/home/tolga/projects/terp/apps/web/messages/de.json`

### 5.2 Usage Pattern

Translations use `next-intl` with namespace-based keys:

```tsx
const t = useTranslations('monthlyValues')  // namespace
t('page.title')                              // nested key
t('count.items', { count: filteredRows.length })  // interpolation
```

### 5.3 Translation Key Structure (pattern from `monthlyValues` namespace)

```json
{
  "monthlyValues": {
    "page": {
      "title": "Monthly Values",
      "subtitle": "View and manage monthly values for all employees"
    },
    "toolbar": {
      "allDepartments": "All Departments",
      "allStatuses": "All Statuses",
      "searchPlaceholder": "Search employee...",
      "clearFilters": "Clear filters"
    },
    "status": {
      "open": "Open",
      "closed": "Closed"
    },
    "table": {
      "employee": "Employee",
      "status": "Status"
    },
    "batch": {
      "selectAll": "Select all",
      "selectedCount": "{count} selected"
    },
    "empty": {
      "title": "No monthly values",
      "description": "No monthly values found for the selected filters."
    },
    "count": {
      "item": "{count} item",
      "items": "{count} items"
    },
    "detail": {
      "timeSummary": "Time Summary",
      "close": "Close"
    }
  }
}
```

### 5.4 Nav Translation Keys

Both `en.json` and `de.json` have a `nav` section. Currently includes keys like:
```json
"nav": {
  "monthlyValues": "Monthly Values",
  "correctionAssistant": "Correction Assistant",
  ...
}
```

A new key `payrollExports` needs to be added to `nav` in both language files.

---

## 6. UI Component Patterns

### 6.1 Data Table Pattern

File: `/home/tolga/projects/terp/apps/web/src/components/monthly-values/monthly-values-data-table.tsx`

Structure:
- Define a `Row` interface (exported for use by page and detail sheet)
- Accept `items: Row[]`, `isLoading: boolean`, callbacks
- Use `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table`
- Show skeleton variant when `isLoading` (10 skeleton rows)
- Status badges via `Badge` component with color variants
- Checkbox column for selection
- Row click handlers with `e.stopPropagation()` on checkbox cell

Available UI table components:
- `/home/tolga/projects/terp/apps/web/src/components/ui/table.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/ui/badge.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/ui/checkbox.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/ui/skeleton.tsx`

### 6.2 Toolbar Pattern

File: `/home/tolga/projects/terp/apps/web/src/components/monthly-values/monthly-values-toolbar.tsx`

Structure:
- Grid layout: `<div className="grid gap-4 md:grid-cols-4 md:items-end">`
- Month/year navigator: chevron buttons wrapping a label
- Filter dropdowns: `Select` > `SelectTrigger` > `SelectContent` > `SelectItem`
- Search input with icon
- Clear filters button when `hasFilters`

### 6.3 Detail Sheet Pattern

File: `/home/tolga/projects/terp/apps/web/src/components/monthly-values/monthly-values-detail-sheet.tsx`

Structure:
- `Sheet` from `@/components/ui/sheet` (side="right", max-w-lg)
- `SheetHeader` with `SheetTitle` and `SheetDescription`
- `ScrollArea` for body content (flex-1, negative margin for edge-to-edge)
- Sectioned content with `rounded-lg border p-4` cards
- `SheetFooter` with action buttons (close, domain actions)

### 6.4 Dialog Pattern (Complex)

File: `/home/tolga/projects/terp/apps/web/src/components/monthly-values/batch-close-dialog.tsx`

The "generate export" dialog is analogous to the batch close dialog. Pattern:
- Uses `Sheet` (not `Dialog`) with `side="right"`
- State machine pattern: `type DialogState = 'confirming' | 'processing' | 'results'`
- ScrollArea body with conditional content based on state
- Footer buttons change per state
- Error display via `Alert` component
- Reset state on close

For simpler confirmations (delete export):
- File: `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`
- Uses `Sheet` with `side="bottom"` and `sm:max-w-md`
- Props: `title`, `description`, `confirmLabel`, `variant`, `isLoading`, `onConfirm`

### 6.5 Dialog UI Component

File: `/home/tolga/projects/terp/apps/web/src/components/ui/dialog.tsx`
- Radix Dialog primitive with `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`
- Centered modal with max-w-lg
- Animations and close button included
- This is available but existing pages prefer Sheet components for side panels and bottom sheets

### 6.6 Skeleton Pattern

File: `/home/tolga/projects/terp/apps/web/src/components/monthly-values/monthly-values-skeleton.tsx`

Simple full-page skeleton with placeholder blocks matching the page layout:
```tsx
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />    {/* Title */}
        <Skeleton className="h-4 w-72" />    {/* Subtitle */}
      </div>
      <div className="grid gap-4 md:grid-cols-4">  {/* Toolbar */}
        <Skeleton className="h-9" />
        ...
      </div>
      <Skeleton className="h-[500px]" />     {/* Table */}
    </div>
  )
}
```

---

## 7. Existing Reusable Components

### 7.1 UI Components (from `@/components/ui/`)

| Component | File | Usage Notes |
|-----------|------|-------------|
| `Table` + parts | `table.tsx` | TableHeader, TableBody, TableRow, TableHead, TableCell |
| `Badge` | `badge.tsx` | Status badges with `variant` prop |
| `Button` | `button.tsx` | With variant, size props |
| `Card` + `CardContent` | `card.tsx` | Wrapper for tables |
| `Dialog` + parts | `dialog.tsx` | Radix dialog (centered modal) |
| `Sheet` + parts | `sheet.tsx` | Radix dialog as side/bottom sheet |
| `Select` + parts | `select.tsx` | Dropdown select |
| `Input` | `input.tsx` | Text input |
| `Label` | `label.tsx` | Form labels |
| `Checkbox` | `checkbox.tsx` | For selection |
| `Skeleton` | `skeleton.tsx` | Loading placeholder |
| `ScrollArea` | `scroll-area.tsx` | Scrollable container |
| `Alert` + `AlertDescription` | `alert.tsx` | Error/warning messages |
| `ConfirmDialog` | `confirm-dialog.tsx` | Reusable confirmation (Sheet-based) |
| `SearchInput` | `search-input.tsx` | Search input with icon + clear |
| `Pagination` | `pagination.tsx` | Page + limit controls |
| `Tabs` + parts | `tabs.tsx` | Tab navigation |
| `Separator` | `separator.tsx` | Visual divider |
| `Tooltip` + parts | `tooltip.tsx` | Hover tooltips |
| `DropdownMenu` + parts | `dropdown-menu.tsx` | Context menus for actions |
| `Popover` + parts | `popover.tsx` | Floating content |

### 7.2 Domain Components Available for Reuse

| Component | Source | Potential Reuse |
|-----------|--------|----------------|
| `TimeDisplay` | `@/components/timesheet` | Formatting time values |
| Month/year navigator | `monthly-values-toolbar.tsx` | Year/month navigation pattern |
| Status badge helper | `monthly-values-data-table.tsx` | Status-to-badge mapping pattern |
| `ConfirmDialog` | `@/components/ui/confirm-dialog.tsx` | Delete confirmation |

---

## 8. Key Files to Create/Modify

### 8.1 New Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx` | Page component |
| `apps/web/src/hooks/api/use-payroll-exports.ts` | API hooks |
| `apps/web/src/components/payroll-exports/index.ts` | Barrel exports |
| `apps/web/src/components/payroll-exports/payroll-export-data-table.tsx` | Export list table |
| `apps/web/src/components/payroll-exports/payroll-export-toolbar.tsx` | Filters + generate button |
| `apps/web/src/components/payroll-exports/generate-export-dialog.tsx` | Generate export form dialog |
| `apps/web/src/components/payroll-exports/payroll-export-preview.tsx` | Preview table with dynamic columns |
| `apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx` | Export metadata detail sheet |
| `apps/web/src/components/payroll-exports/payroll-export-skeleton.tsx` | Loading skeleton |

### 8.2 Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/hooks/api/index.ts` | Add exports for payroll export hooks |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add payroll exports nav item to administration section |
| `apps/web/messages/en.json` | Add `nav.payrollExports` + `payrollExports` namespace |
| `apps/web/messages/de.json` | Add `nav.payrollExports` + `payrollExports` namespace (German) |

---

## 9. Technical Considerations

### 9.1 Async Export Polling

The export generation is async. After POST returns 202, the UI needs to poll GET `/payroll-exports/{id}` until status transitions from `pending`/`generating` to `completed` or `failed`.

React Query's `refetchInterval` supports this:
```ts
refetchInterval: (query) => {
  const status = query.state.data?.status
  return (status === 'pending' || status === 'generating') ? 3000 : false
}
```

Additionally, the list query should also poll if any item has `pending` or `generating` status to keep the list up to date.

### 9.2 File Download (Blob)

The `/payroll-exports/{id}/download` endpoint returns binary data. The openapi-fetch client cannot handle blob responses natively. A custom download hook using raw `fetch` is needed:

```ts
// Pattern: direct fetch for blob download
const downloadExport = async (id: string) => {
  const token = authStorage.getToken()
  const tenantId = tenantIdStorage.getTenantId()
  const response = await fetch(`${clientEnv.apiUrl}/payroll-exports/${id}/download`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
    },
  })
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition')
  const filename = disposition?.match(/filename="?(.+)"?/)?.[1] ?? 'export'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### 9.3 HTTP 409 Handling

Two 409 scenarios:
1. **Generate export**: Month not closed for all employees. Show error message from ProblemDetails.
2. **Download/Preview**: Export not ready (still generating). Disable download/preview buttons when status is not `completed`.

Error handling uses the existing `ProblemDetails` type from `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts`.

### 9.4 Preview Table with Dynamic Columns

The preview response includes `account_values` as a dynamic key-value object. The preview table needs to:
1. Collect all unique account codes from all lines
2. Generate dynamic column headers for each account
3. Render decimal values per account per employee

### 9.5 Export Interface Selection

The generate dialog should optionally allow selecting an export interface from `/export-interfaces`. A hook `useExportInterfaces` will be needed (using `useApiQuery('/export-interfaces', { params: { active_only: true } })`). This could be a simple `useApiQuery` call inside the generate dialog or in the new hook file.

---

## 10. Existing Backend Handler Reference

For verifying the API is implemented, check:
- `/home/tolga/projects/terp/apps/api/internal/handler/` for payroll export handlers
- `/home/tolga/projects/terp/apps/api/internal/service/` for payroll export service
- `/home/tolga/projects/terp/apps/api/cmd/server/main.go` for route registration
