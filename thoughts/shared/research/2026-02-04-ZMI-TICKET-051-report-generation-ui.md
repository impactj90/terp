# Research: ZMI-TICKET-051 - Report Generation UI

## 1. Frontend Architecture

### Next.js App Structure
- **Framework**: Next.js with App Router, internationalized routing via `[locale]` segment
- **Route pattern**: `/apps/web/src/app/[locale]/(dashboard)/admin/<feature>/page.tsx`
- **Layout group**: `(dashboard)` wraps all authenticated pages with sidebar layout
- **Target route**: `/apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`

### Page Pattern (from payroll-exports page)
Pages are `'use client'` components that:
1. Import hooks from `@/hooks/api` and `@/hooks`
2. Use `useTranslations('namespace')` from `next-intl`
3. Guard with `useAuth()` + `useHasRole(['admin'])`
4. Manage filter state with `React.useState`
5. Manage overlay state (dialogs, sheets, delete confirmations)
6. Delegate rendering to child components (toolbar, data table, detail sheet, dialog)
7. Wrap data table in `<Card><CardContent className="p-0">`

### Component Organization
- Feature components live in `/apps/web/src/components/<feature>/`
- Each feature has an `index.ts` barrel export
- Components follow naming: `<feature>-data-table.tsx`, `<feature>-toolbar.tsx`, `<feature>-detail-sheet.tsx`, `<feature>-skeleton.tsx`

### Key File Paths
- Page: `/apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx` (TO CREATE)
- Components: `/apps/web/src/components/reports/` (TO CREATE)
- Hooks: `/apps/web/src/hooks/api/use-reports.ts` (TO CREATE)

---

## 2. Best Example to Model After: Payroll Exports

The payroll exports page is the closest analog. It has:
- Data table with status badges, actions dropdown
- Generate dialog (Sheet-based)
- Detail sheet (right side Sheet)
- Confirm delete dialog
- Preview sheet
- Async polling via `refetchInterval`
- File download via raw fetch (blob)

### Key Reference Files
| Component | Path |
|-----------|------|
| Page | `/apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx` |
| Data Table | `/apps/web/src/components/payroll-exports/payroll-export-data-table.tsx` |
| Generate Dialog | `/apps/web/src/components/payroll-exports/generate-export-dialog.tsx` |
| Detail Sheet | `/apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx` |
| Toolbar | `/apps/web/src/components/payroll-exports/payroll-export-toolbar.tsx` |
| Skeleton | `/apps/web/src/components/payroll-exports/payroll-export-skeleton.tsx` |
| Preview | `/apps/web/src/components/payroll-exports/payroll-export-preview.tsx` |
| Index | `/apps/web/src/components/payroll-exports/index.ts` |
| API Hooks | `/apps/web/src/hooks/api/use-payroll-exports.ts` |
| Translations | `/apps/web/messages/en.json` (key: `payrollExports`) |

### Page Structure Pattern
```tsx
// page.tsx structure
export default function ReportsPage() {
  // Auth guard
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters (useState)
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Overlays (useState)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ReportRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReportRow | null>(null)

  // Queries with polling
  const { data, isLoading } = useReports({ ... })
  const { data: fullReport } = useReport(selectedItem?.id)

  // Mutations
  const deleteMutation = useDeleteReport()
  const downloadMutation = useDownloadReport()

  return (
    <div className="space-y-6">
      {/* Page header */}
      <Toolbar />
      <Card><CardContent><DataTable /></CardContent></Card>
      <DetailSheet />
      <ConfirmDialog />
      <GenerateDialog />
    </div>
  )
}
```

---

## 3. UI Component Library (shadcn/ui)

### Available Components
All in `/apps/web/src/components/ui/`:

| Component | File | Used For |
|-----------|------|----------|
| Button | `button.tsx` | Actions, toolbar buttons |
| Badge | `badge.tsx` | Status badges, type badges |
| Card | `card.tsx` | Table wrapper |
| Table | `table.tsx` | Data tables (Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter) |
| Sheet | `sheet.tsx` | Side panels (detail sheet, generate dialog) |
| Dialog | `dialog.tsx` | Modal dialogs |
| Select | `select.tsx` | Dropdowns (report type, format, status filter) |
| Input | `input.tsx` | Text inputs |
| Label | `label.tsx` | Form labels |
| Skeleton | `skeleton.tsx` | Loading states |
| DropdownMenu | `dropdown-menu.tsx` | Row action menus |
| ScrollArea | `scroll-area.tsx` | Scrollable sheet content |
| Alert | `alert.tsx` | Error messages |
| Popover | `popover.tsx` | Popover containers |
| Calendar | `calendar.tsx` | Date picking |
| DateRangePicker | `date-range-picker.tsx` | Date range selection (from_date/to_date) |
| ConfirmDialog | `confirm-dialog.tsx` | Delete confirmation (Sheet-based bottom panel) |
| Checkbox | `checkbox.tsx` | Multi-select options |
| Pagination | `pagination.tsx` | Page navigation |
| SearchInput | `search-input.tsx` | Search fields |
| Tabs | `tabs.tsx` | Tab navigation |
| Separator | `separator.tsx` | Visual dividers |
| Tooltip | `tooltip.tsx` | Hover info |

### Notable: No Combobox/MultiSelect
There is no combobox or multi-select component in the UI library. For the employee/department/team/cost-center multi-select filters in the generate dialog, options are:
1. Use comma-separated UUID text inputs (current payroll exports pattern)
2. Build a custom multi-select using Popover + Checkbox list
3. Use multiple Select dropdowns

The payroll exports generate dialog uses **plain text inputs for comma-separated IDs** in the advanced parameters section. The reports generate dialog should improve on this with proper multi-select dropdowns using the existing data hooks.

---

## 4. API Hook Patterns (React Query / TanStack Query)

### Core Hooks
- `/apps/web/src/hooks/use-api-query.ts` - Type-safe GET wrapper around `useQuery`
- `/apps/web/src/hooks/use-api-mutation.ts` - Type-safe POST/PUT/PATCH/DELETE wrapper around `useMutation`

### useApiQuery Pattern
```typescript
// Simple query
const { data, isLoading } = useApiQuery('/reports')

// With query parameters
const { data } = useApiQuery('/reports', {
  params: { report_type: 'monthly_overview', status: 'completed', limit: 20, cursor: 'abc' }
})

// With path parameters
const { data } = useApiQuery('/reports/{id}', {
  path: { id: '123' },
  enabled: !!id,
})
```

### useApiMutation Pattern
```typescript
// POST mutation
const generateReport = useApiMutation('/reports', 'post', {
  invalidateKeys: [['/reports']],
})

// DELETE mutation
const deleteReport = useApiMutation('/reports/{id}', 'delete', {
  invalidateKeys: [['/reports']],
})
```

### Async Polling Pattern (from payroll-exports)
```typescript
// Poll list when items are in-progress
refetchInterval: (query) => {
  const items = (query.state.data as { data?: Array<{ status?: string }> })?.data
  const hasInProgress = items?.some(
    (item) => item.status === 'pending' || item.status === 'generating'
  )
  return hasInProgress ? 3000 : false
}

// Poll single item
refetchInterval: (query) => {
  const status = (query.state.data as { status?: string })?.status
  return (status === 'pending' || status === 'generating') ? 3000 : false
}
```

### 202 Response Pattern
The `generateReport` operation returns 202. `useApiMutation` only infers types from 200/201, so a custom `useMutation` is needed (same pattern as `useGeneratePayrollExport`):

```typescript
export function useGenerateReport() {
  const queryClient = useQueryClient()
  return useMutation<
    components['schemas']['Report'],
    Error,
    { body: components['schemas']['GenerateReportRequest'] }
  >({
    mutationFn: async (variables) => {
      const { data, error } = await api.POST('/reports' as never, {
        body: variables.body,
      } as never)
      if (error) throw error
      return data as components['schemas']['Report']
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/reports'] })
    },
  })
}
```

### File Download Pattern (from payroll-exports)
```typescript
export function useDownloadReport() {
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const token = authStorage.getToken()
      const tenantId = tenantIdStorage.getTenantId()
      const response = await fetch(
        `${clientEnv.apiUrl}/reports/${id}/download`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
          },
        }
      )
      if (!response.ok) { throw new Error(...) }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition')
      const extractedName = disposition?.match(/filename="?(.+?)"?$/)?.[1]
      const downloadName = extractedName ?? filename ?? 'report'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}
```

### Hook Registration
All hooks are exported from `/apps/web/src/hooks/api/index.ts`. New report hooks must be added there.

---

## 5. Translation / i18n System

### Setup
- Library: `next-intl`
- Message files: `/apps/web/messages/en.json` and `/apps/web/messages/de.json`
- Usage: `const t = useTranslations('namespace')`
- Navigation: `@/i18n/navigation` provides locale-aware `Link` component

### Existing Nav/Breadcrumb Keys
- `nav.reports` = "Reports" (line 81 in en.json) - sidebar nav label
- `breadcrumb.reports` = "Reports" (line 166 in en.json) - breadcrumb label
- Both already exist -- no sidebar or breadcrumb changes needed.

### Translation Namespace Pattern
Each feature uses a top-level key in the JSON. For reports, use key `reports`:
```json
{
  "reports": {
    "page": { "title": "Reports", "subtitle": "..." },
    "toolbar": { "allTypes": "...", "allStatuses": "...", "generateReport": "..." },
    "status": { "pending": "...", "generating": "...", "completed": "...", "failed": "..." },
    "table": { "name": "...", "reportType": "...", ... },
    "types": { "daily_overview": "...", "monthly_overview": "...", ... },
    "format": { "json": "...", "csv": "...", "xlsx": "...", "pdf": "..." },
    "generate": { "title": "...", "description": "...", ... },
    "detail": { "title": "...", ... },
    "delete": { "title": "...", "description": "...", "confirm": "..." },
    "empty": { "title": "...", "description": "...", "generateButton": "..." },
    "count": { "item": "...", "items": "..." }
  }
}
```

### Key Groups Needed
- `reports.page.*` - Page header
- `reports.toolbar.*` - Toolbar labels
- `reports.status.*` - Status badge labels
- `reports.table.*` - Table column headers
- `reports.types.*` - Report type labels (10 types)
- `reports.typeGroups.*` - Report type category labels (Master Data, Monthly, etc.)
- `reports.format.*` - Format labels
- `reports.generate.*` - Generate dialog labels, validation
- `reports.detail.*` - Detail sheet labels
- `reports.delete.*` - Delete confirmation
- `reports.download.*` - Download messages
- `reports.empty.*` - Empty state
- `reports.count.*` - Count display

---

## 6. Backend Reporting API Status -- FULLY IMPLEMENTED

### Summary
The backend reporting API is **complete and production-ready**. All endpoints, models, service logic, repository, and migrations exist.

### Endpoints (registered in routes.go)
| Method | Path | Handler | Permission |
|--------|------|---------|------------|
| GET | `/reports` | `List` | `reports.view` |
| POST | `/reports` | `Generate` | `reports.manage` |
| GET | `/reports/{id}` | `Get` | `reports.view` |
| DELETE | `/reports/{id}` | `Delete` | `reports.manage` |
| GET | `/reports/{id}/download` | `Download` | `reports.view` |

Route registration: `/apps/api/internal/handler/routes.go` lines 1105-1124
Main server wiring: `/apps/api/cmd/server/main.go` line 548

### Backend Files
| Layer | File |
|-------|------|
| Handler | `/apps/api/internal/handler/report.go` |
| Service | `/apps/api/internal/service/report.go` |
| Service Tests | `/apps/api/internal/service/report_test.go` |
| Repository | `/apps/api/internal/repository/report.go` |
| Domain Model | `/apps/api/internal/model/report.go` |
| Migration | `/db/migrations/000066_create_reports.up.sql` |

### Generated Models (Go)
| Model | File |
|-------|------|
| Report | `/apps/api/gen/models/report.go` |
| GenerateReportRequest | `/apps/api/gen/models/generate_report_request.go` |
| ReportList | `/apps/api/gen/models/report_list.go` |

### OpenAPI Spec
| File | Content |
|------|---------|
| Paths | `/api/paths/reports.yaml` |
| Schemas | `/api/schemas/reports.yaml` |

### Generated Frontend Types
All types are generated in `/apps/web/src/lib/api/types.ts`:
- `components["schemas"]["Report"]` - Full report type with all fields
- `components["schemas"]["GenerateReportRequest"]` - Request body type
- `components["schemas"]["ReportList"]` - { data: Report[], meta: PaginationMeta }
- Operations: `listReports`, `generateReport`, `getReport`, `deleteReport`, `downloadReport`

### Report Types (10 types)
```
daily_overview, weekly_overview, monthly_overview,
employee_timesheet, department_summary,
absence_report, vacation_report,
overtime_report, account_balances, custom
```

### Report Formats
```
json, csv, xlsx, pdf
```

### Report Statuses
```
pending, generating, completed, failed
```

### Service Behavior
- `Generate()` creates report record with `status=pending`, then generates **synchronously** within the same request
- Report transitions: pending -> generating -> completed/failed
- On failure, record is saved with `status=failed` and `error_message`
- Returns 202 even though generation is synchronous (designed for future async)
- `GetDownloadContent()` returns file bytes, content-type, and filename
- File stored as BYTEA in database column `file_content`

### Query Filters
- `report_type` - filter by type
- `status` - filter by status
- `limit` - pagination limit (default 20, max 100)
- `cursor` - cursor-based pagination (UUID)

---

## 7. Reusable Filter Components

### Existing Data Hooks for Filters
| Filter | Hook | File | Data Access |
|--------|------|------|-------------|
| Employees | `useEmployees({ search?, departmentId?, active? })` | `/apps/web/src/hooks/api/use-employees.ts` | `data?.data ?? []` |
| Departments | `useDepartments({ active? })` | `/apps/web/src/hooks/api/use-departments.ts` | `data?.data ?? []` |
| Cost Centers | `useCostCenters()` | `/apps/web/src/hooks/api/use-cost-centers.ts` | `data?.data ?? []` |
| Teams | `useTeams({ departmentId?, isActive? })` | `/apps/web/src/hooks/api/use-teams.ts` | `data?.data ?? []` |

### Existing Selector Components
- **TeamSelector**: `/apps/web/src/components/team-overview/team-selector.tsx`
  - Simple `<Select>` dropdown using `components['schemas']['Team']` type
  - Single-select only, shows team name + member count

### No Existing Multi-Select Components
The codebase does not have a reusable multi-select or combobox component. For the report generate dialog parameters:
- **Current payroll pattern**: Plain text `<Input>` with comma-separated UUIDs (poor UX)
- **Recommended approach**: Build simple multi-select using Popover + ScrollArea + Checkbox pattern
- Alternatively, use individual Select dropdowns per entity

### Date Range Picker
`/apps/web/src/components/ui/date-range-picker.tsx`
- Fully built component with calendar popover
- Props: `value?: DateRange`, `onChange?: (range) => void`, `placeholder?`, `minDate?`, `maxDate?`
- Returns `{ from: Date, to: Date }` as DateRange type
- Has clear button built in
- Perfect for the report parameters `from_date` / `to_date`

---

## 8. File Download Pattern

### Existing Pattern (from payroll-exports)
File: `/apps/web/src/hooks/api/use-payroll-exports.ts` - `useDownloadPayrollExport()`

Key implementation details:
1. Uses raw `fetch()` (not openapi-fetch) because openapi-fetch cannot handle blob responses
2. Manually adds auth headers from `authStorage.getToken()` and `tenantIdStorage.getTenantId()`
3. Calls `.blob()` on response
4. Extracts filename from `Content-Disposition` header
5. Creates temporary `<a>` element for browser download
6. Cleans up with `URL.revokeObjectURL()`

```typescript
import { api, authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'

// Pattern: useMutation wrapping raw fetch for blob download
export function useDownloadReport() {
  return useMutation<void, Error, { id: string; filename?: string }>({
    mutationFn: async ({ id, filename }) => {
      const token = authStorage.getToken()
      const tenantId = tenantIdStorage.getTenantId()
      const response = await fetch(
        `${clientEnv.apiUrl}/reports/${id}/download`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
          },
        }
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail ?? errorData?.title ?? `Download failed (${response.status})`)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition')
      const extractedName = disposition?.match(/filename="?(.+?)"?$/)?.[1]
      const downloadName = extractedName ?? filename ?? 'report'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}
```

### Error Handling for Downloads
- Non-ok response: Parse JSON error body, throw with detail/title message
- Import `clientEnv` from `/apps/web/src/config/env.ts` for API base URL

---

## 9. Sidebar Navigation

### Already Configured
The sidebar nav config already includes a "Reports" entry:

File: `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (lines 235-239)
```typescript
{
  titleKey: 'reports',
  href: '/admin/reports',
  icon: FileText,
  roles: ['admin'],
}
```

Located in the "Administration" section (`titleKey: 'administration'`), which requires `roles: ['admin']`.

No changes needed to sidebar or navigation config.

---

## 10. Implementation Plan Summary

### Files to Create

1. **API Hook**: `/apps/web/src/hooks/api/use-reports.ts`
   - `useReports(options?)` - List with filters + polling
   - `useReport(id)` - Single report + polling
   - `useGenerateReport()` - POST /reports (custom useMutation for 202)
   - `useDeleteReport()` - DELETE /reports/{id}
   - `useDownloadReport()` - Raw fetch blob download

2. **Page**: `/apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`
   - Follow payroll-exports page pattern exactly

3. **Components** (in `/apps/web/src/components/reports/`):
   - `report-data-table.tsx` - Table with type/status badges, actions dropdown
   - `generate-report-dialog.tsx` - Sheet with report type, format, name, date range, entity filters
   - `report-detail-sheet.tsx` - Right-side Sheet with all metadata
   - `report-toolbar.tsx` - Type filter, status filter, generate button
   - `report-skeleton.tsx` - Loading skeleton
   - `index.ts` - Barrel exports

### Files to Modify

4. **Hook index**: `/apps/web/src/hooks/api/index.ts` - Add report hook exports
5. **Translations**: `/apps/web/messages/en.json` - Add `reports` namespace
6. **Translations**: `/apps/web/messages/de.json` - Add `reports` namespace (German)

### Key Differences from Payroll Exports

| Aspect | Payroll Exports | Reports |
|--------|-----------------|---------|
| Filters | Year/month navigator | Report type + status dropdowns |
| Generate form | Year, month, export type, format | Report type (grouped), name, format, date range, entity filters |
| Entity filters | Comma-separated UUID text inputs | Should use proper multi-select with data from useEmployees, useDepartments, etc. |
| Date selection | Year/month pickers | DateRangePicker component (already available) |
| Preview | Has data preview sheet | Not in scope (per ticket spec) |
| Download | Same pattern | Same pattern (reuse approach) |
| Polling | Same 3s interval | Same 3s interval |

### Report Type Grouping for Generate Dialog
```
Master Data:
  - daily_overview
  - weekly_overview
  - employee_timesheet

Monthly:
  - monthly_overview
  - department_summary

Absence/Vacation:
  - absence_report
  - vacation_report

Time Analysis:
  - overtime_report
  - account_balances

Other:
  - custom
```

### Date Range Requirements by Report Type
Most types require `from_date` and `to_date` (per service `requiresDateRange()`):
- Required: daily_overview, weekly_overview, monthly_overview, employee_timesheet, absence_report, overtime_report, department_summary, account_balances
- Not required: vacation_report (uses year from from_date), custom
