# Implementation Plan: ZMI-TICKET-051 - Report Generation UI

**Ticket**: ZMI-TICKET-051
**Date**: 2026-02-04
**Status**: Ready for implementation
**Backend**: Fully implemented (ZMI-TICKET-020) -- all endpoints, models, migrations exist

---

## Overview

Build the Report Generation UI page at `/admin/reports` with:
- Data table listing reports with status badges, type badges, actions
- Generate dialog (Sheet) with report type selector (grouped), format, name, date range, entity filters
- Detail sheet showing all report metadata
- Async status polling (3s interval via React Query `refetchInterval`)
- File download (blob via raw fetch)
- Delete confirmation
- Full i18n (EN + DE)

**Primary model**: Payroll Exports page (closest analog in codebase)

---

## Dependencies & Backend Status

### Backend API -- COMPLETE
All endpoints are registered and functional:

| Method | Path | Status |
|--------|------|--------|
| GET | `/reports` | Implemented |
| POST | `/reports` | Implemented (returns 202) |
| GET | `/reports/{id}` | Implemented |
| DELETE | `/reports/{id}` | Implemented |
| GET | `/reports/{id}/download` | Implemented |

### Frontend Type Generation -- COMPLETE
Types available in `/apps/web/src/lib/api/types.ts`:
- `components["schemas"]["Report"]` -- full report with all fields
- `components["schemas"]["GenerateReportRequest"]` -- request body
- `components["schemas"]["ReportList"]` -- `{ data: Report[], meta: PaginationMeta }`
- Operations: `listReports`, `generateReport`, `getReport`, `deleteReport`, `downloadReport`

### Entity Data Hooks -- COMPLETE (for filter dropdowns)
- `useEmployees()` from `/apps/web/src/hooks/api/use-employees.ts`
- `useDepartments()` from `/apps/web/src/hooks/api/use-departments.ts`
- `useCostCenters()` from `/apps/web/src/hooks/api/use-cost-centers.ts`
- `useTeams()` from `/apps/web/src/hooks/api/use-teams.ts`

### Navigation -- COMPLETE
- Sidebar entry exists at `/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` lines 235-239
- Translation keys `nav.reports` and `breadcrumb.reports` already exist in both `en.json` and `de.json`

---

## Phase 1: Translations (EN + DE)

### Files to Modify

1. **`/apps/web/messages/en.json`** -- Add `reports` namespace before closing `}`
2. **`/apps/web/messages/de.json`** -- Add `reports` namespace before closing `}`

### Pattern
Follow the `payrollExports` namespace structure (en.json lines 2525-2653). The reports namespace goes as a new top-level key at the end of the JSON, just before the closing `}`.

### Translation Keys Required

```json
{
  "reports": {
    "page": {
      "title": "Reports",
      "subtitle": "Generate, download, and manage reports"
    },
    "toolbar": {
      "allTypes": "All Types",
      "allStatuses": "All Statuses",
      "generateReport": "Generate Report"
    },
    "status": {
      "pending": "Pending",
      "generating": "Generating",
      "completed": "Completed",
      "failed": "Failed"
    },
    "table": {
      "name": "Name",
      "reportType": "Type",
      "format": "Format",
      "status": "Status",
      "rowCount": "Rows",
      "fileSize": "Size",
      "generatedAt": "Generated At",
      "actions": "Actions"
    },
    "types": {
      "daily_overview": "Daily Overview",
      "weekly_overview": "Weekly Overview",
      "monthly_overview": "Monthly Overview",
      "employee_timesheet": "Employee Timesheet",
      "department_summary": "Department Summary",
      "absence_report": "Absence Report",
      "vacation_report": "Vacation Report",
      "overtime_report": "Overtime Report",
      "account_balances": "Account Balances",
      "custom": "Custom"
    },
    "typeGroups": {
      "masterData": "Master Data",
      "monthly": "Monthly",
      "absenceVacation": "Absence / Vacation",
      "timeAnalysis": "Time Analysis",
      "other": "Other"
    },
    "format": {
      "json": "JSON",
      "csv": "CSV",
      "xlsx": "Excel",
      "pdf": "PDF"
    },
    "actions": {
      "download": "Download",
      "delete": "Delete",
      "viewDetails": "View Details"
    },
    "generate": {
      "title": "Generate Report",
      "description": "Configure and generate a new report",
      "reportTypeLabel": "Report Type",
      "reportTypePlaceholder": "Select report type",
      "nameLabel": "Report Name",
      "namePlaceholder": "Auto-generated if empty",
      "formatLabel": "Format",
      "dateRangeLabel": "Date Range",
      "dateRangeRequired": "Date range is required for this report type",
      "employeeFilterLabel": "Employees",
      "employeeFilterPlaceholder": "All employees",
      "departmentFilterLabel": "Departments",
      "departmentFilterPlaceholder": "All departments",
      "costCenterFilterLabel": "Cost Centers",
      "costCenterFilterPlaceholder": "All cost centers",
      "teamFilterLabel": "Teams",
      "teamFilterPlaceholder": "All teams",
      "filtersSection": "Filters",
      "submit": "Generate Report",
      "validationReportTypeRequired": "Report type is required",
      "validationFormatRequired": "Format is required",
      "error": "Failed to generate report"
    },
    "detail": {
      "title": "Report Details",
      "reportInfo": "Report Information",
      "type": "Type",
      "format": "Format",
      "name": "Name",
      "statusInfo": "Status",
      "status": "Status",
      "requestedAt": "Requested At",
      "startedAt": "Started At",
      "completedAt": "Completed At",
      "results": "Results",
      "rowCount": "Rows",
      "fileSize": "File Size",
      "parameters": "Parameters",
      "dateRange": "Date Range",
      "employees": "Employees",
      "departments": "Departments",
      "costCenters": "Cost Centers",
      "teams": "Teams",
      "errorMessage": "Error",
      "close": "Close",
      "download": "Download",
      "delete": "Delete",
      "noParameters": "No filter parameters"
    },
    "delete": {
      "title": "Delete Report",
      "description": "Are you sure you want to delete this report? This action cannot be undone.",
      "confirm": "Delete"
    },
    "download": {
      "error": "Failed to download report"
    },
    "empty": {
      "title": "No reports generated yet",
      "description": "Create your first report to get started.",
      "generateButton": "Generate Report"
    },
    "count": {
      "item": "{count} report",
      "items": "{count} reports"
    }
  }
}
```

### German Translations

```json
{
  "reports": {
    "page": {
      "title": "Berichte",
      "subtitle": "Berichte erstellen, herunterladen und verwalten"
    },
    "toolbar": {
      "allTypes": "Alle Typen",
      "allStatuses": "Alle Status",
      "generateReport": "Bericht erstellen"
    },
    "status": {
      "pending": "Ausstehend",
      "generating": "Wird erstellt",
      "completed": "Abgeschlossen",
      "failed": "Fehlgeschlagen"
    },
    "table": {
      "name": "Name",
      "reportType": "Typ",
      "format": "Format",
      "status": "Status",
      "rowCount": "Zeilen",
      "fileSize": "Groesse",
      "generatedAt": "Erstellt am",
      "actions": "Aktionen"
    },
    "types": {
      "daily_overview": "Tagesuebersicht",
      "weekly_overview": "Wochenuebersicht",
      "monthly_overview": "Monatsuebersicht",
      "employee_timesheet": "Mitarbeiter-Zeitnachweis",
      "department_summary": "Abteilungsuebersicht",
      "absence_report": "Abwesenheitsbericht",
      "vacation_report": "Urlaubsbericht",
      "overtime_report": "Ueberstundenbericht",
      "account_balances": "Kontensalden",
      "custom": "Benutzerdefiniert"
    },
    "typeGroups": {
      "masterData": "Stammdaten",
      "monthly": "Monatlich",
      "absenceVacation": "Abwesenheit / Urlaub",
      "timeAnalysis": "Zeitanalyse",
      "other": "Sonstige"
    },
    "format": {
      "json": "JSON",
      "csv": "CSV",
      "xlsx": "Excel",
      "pdf": "PDF"
    },
    "actions": {
      "download": "Herunterladen",
      "delete": "Loeschen",
      "viewDetails": "Details anzeigen"
    },
    "generate": {
      "title": "Bericht erstellen",
      "description": "Neuen Bericht konfigurieren und erstellen",
      "reportTypeLabel": "Berichtstyp",
      "reportTypePlaceholder": "Berichtstyp waehlen",
      "nameLabel": "Berichtsname",
      "namePlaceholder": "Wird automatisch generiert, wenn leer",
      "formatLabel": "Format",
      "dateRangeLabel": "Zeitraum",
      "dateRangeRequired": "Ein Zeitraum ist fuer diesen Berichtstyp erforderlich",
      "employeeFilterLabel": "Mitarbeiter",
      "employeeFilterPlaceholder": "Alle Mitarbeiter",
      "departmentFilterLabel": "Abteilungen",
      "departmentFilterPlaceholder": "Alle Abteilungen",
      "costCenterFilterLabel": "Kostenstellen",
      "costCenterFilterPlaceholder": "Alle Kostenstellen",
      "teamFilterLabel": "Teams",
      "teamFilterPlaceholder": "Alle Teams",
      "filtersSection": "Filter",
      "submit": "Bericht erstellen",
      "validationReportTypeRequired": "Berichtstyp ist erforderlich",
      "validationFormatRequired": "Format ist erforderlich",
      "error": "Bericht konnte nicht erstellt werden"
    },
    "detail": {
      "title": "Berichtsdetails",
      "reportInfo": "Berichtsinformationen",
      "type": "Typ",
      "format": "Format",
      "name": "Name",
      "statusInfo": "Status",
      "status": "Status",
      "requestedAt": "Angefordert am",
      "startedAt": "Gestartet am",
      "completedAt": "Abgeschlossen am",
      "results": "Ergebnisse",
      "rowCount": "Zeilen",
      "fileSize": "Dateigroesse",
      "parameters": "Parameter",
      "dateRange": "Zeitraum",
      "employees": "Mitarbeiter",
      "departments": "Abteilungen",
      "costCenters": "Kostenstellen",
      "teams": "Teams",
      "errorMessage": "Fehler",
      "close": "Schliessen",
      "download": "Herunterladen",
      "delete": "Loeschen",
      "noParameters": "Keine Filterparameter"
    },
    "delete": {
      "title": "Bericht loeschen",
      "description": "Moechten Sie diesen Bericht wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.",
      "confirm": "Loeschen"
    },
    "download": {
      "error": "Bericht konnte nicht heruntergeladen werden"
    },
    "empty": {
      "title": "Noch keine Berichte erstellt",
      "description": "Erstellen Sie Ihren ersten Bericht, um loszulegen.",
      "generateButton": "Bericht erstellen"
    },
    "count": {
      "item": "{count} Bericht",
      "items": "{count} Berichte"
    }
  }
}
```

### Insertion Point
In both `en.json` and `de.json`, the current last key is `"adminEmploymentTypes"` ending at line 2966. Insert the `"reports"` key with a comma after `}` of `adminEmploymentTypes`, before the final `}` on line 2967.

### Verification
- Run `npx next-intl validate` or start dev server -- pages should render without missing translation warnings
- Spot-check keys used in components match namespace paths

---

## Phase 2: API Hooks

### File to Create

**`/apps/web/src/hooks/api/use-reports.ts`**

### Pattern Reference
Model after `/apps/web/src/hooks/api/use-payroll-exports.ts` (exact same structure).

### Hooks to Implement

#### 1. `useReports(options?)` -- List with filters + polling

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, authStorage, tenantIdStorage } from '@/lib/api'
import { clientEnv } from '@/config/env'
import type { components } from '@/lib/api/types'

type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed'

interface UseReportsOptions {
  reportType?: string
  status?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

export function useReports(options: UseReportsOptions = {}) {
  const { reportType, status, limit, cursor, enabled = true } = options
  return useApiQuery('/reports', {
    params: {
      report_type: reportType as components['schemas']['Report']['report_type'] | undefined,
      status: status as ReportStatus | undefined,
      limit,
      cursor,
    },
    enabled,
    refetchInterval: (query) => {
      const items = (query.state.data as { data?: Array<{ status?: string }> })?.data
      const hasInProgress = items?.some(
        (item) => item.status === 'pending' || item.status === 'generating'
      )
      return hasInProgress ? 3000 : false
    },
  })
}
```

**Key pattern**: `refetchInterval` polls at 3000ms when any item has `status === 'pending' || status === 'generating'`. Exact same pattern as `usePayrollExports` (lines 66-73).

#### 2. `useReport(id)` -- Single report + polling

```typescript
export function useReport(id: string | undefined) {
  return useApiQuery('/reports/{id}', {
    path: { id: id! },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string })?.status
      return (status === 'pending' || status === 'generating') ? 3000 : false
    },
  })
}
```

**Pattern**: Same as `usePayrollExport` (lines 80-89).

#### 3. `useGenerateReport()` -- POST /reports (custom mutation for 202)

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

**Key pattern**: Custom `useMutation` instead of `useApiMutation` because the endpoint returns 202 and `useApiMutation` only infers types from 200/201 responses. Exact same pattern as `useGeneratePayrollExport` (lines 133-169).

#### 4. `useDeleteReport()` -- DELETE /reports/{id}

```typescript
export function useDeleteReport() {
  return useApiMutation('/reports/{id}', 'delete', {
    invalidateKeys: [['/reports']],
  })
}
```

**Pattern**: Same as `useDeletePayrollExport` (lines 175-179).

#### 5. `useDownloadReport()` -- Blob download

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
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          errorData?.detail ?? errorData?.title ?? `Download failed (${response.status})`
        )
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

**Pattern**: Exact copy of `useDownloadPayrollExport` (lines 185-219) with path changed from `/payroll-exports/` to `/reports/`.

### File to Modify

**`/apps/web/src/hooks/api/index.ts`** -- Add export block:

```typescript
// Reports
export {
  useReports,
  useReport,
  useGenerateReport,
  useDeleteReport,
  useDownloadReport,
} from './use-reports'
```

Insert after the `// Payroll Exports` block (line 271).

### Verification
- Import hooks in a test component or the page -- TypeScript should compile without errors
- Manually verify query key patterns match between list and detail hooks

---

## Phase 3: Components

All components go in `/apps/web/src/components/reports/`.

### 3.1 `report-skeleton.tsx`

**Pattern**: `/apps/web/src/components/payroll-exports/payroll-export-skeleton.tsx`

Simple skeleton with:
- Title area (Skeleton h-8 w-48 + h-4 w-72)
- Toolbar area (3-column grid: type filter, status filter, generate button)
- Table area (Skeleton h-[500px])

### 3.2 `report-toolbar.tsx`

**Pattern**: `/apps/web/src/components/payroll-exports/payroll-export-toolbar.tsx`

**Props**:
```typescript
interface ReportToolbarProps {
  reportType: string            // 'all' | report type
  onReportTypeChange: (v: string) => void
  status: string                // 'all' | status
  onStatusChange: (v: string) => void
  onGenerate: () => void
}
```

**Key differences from payroll exports toolbar**:
- No month/year navigator (reports don't filter by period)
- Report type Select with ALL 10 types from `reports.types.*` translations
- Status Select with 4 statuses from `reports.status.*` translations
- "Generate Report" button with Plus icon (right-aligned)

**Layout**: `grid gap-4 md:grid-cols-4 md:items-end` (same as payroll toolbar)
- Col 1: Report type select
- Col 2: Status select
- Col 3: Spacer
- Col 4: Generate button

**Components used**:
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Button` from `@/components/ui/button`
- `Plus` icon from `lucide-react`

### 3.3 `report-data-table.tsx`

**Pattern**: `/apps/web/src/components/payroll-exports/payroll-export-data-table.tsx`

**Row type**:
```typescript
export interface ReportRow {
  id: string
  name?: string
  report_type: string
  format?: string
  status: string
  row_count?: number | null
  file_size?: number | null
  requested_at?: string
  completed_at?: string | null
  error_message?: string | null
}
```

**Table columns**:
| Column | Width | Content |
|--------|-------|---------|
| Name | - | `item.name ?? '-'` |
| Type | w-36 | Badge with `t('types.${report_type}')` |
| Format | w-20 | Monospace uppercase |
| Status | w-32 | Status badge (reuse `getStatusBadge` pattern) |
| Rows | w-20 text-right | `row_count ?? '-'` |
| Size | w-24 text-right | `formatFileSize(file_size)` |
| Generated At | w-36 | `formatDate(completed_at ?? requested_at)` |
| Actions | w-16 | DropdownMenu |

**Status badges** (same pattern as payroll exports `getStatusBadge`):
- `pending`: variant=outline, className=border-yellow-500 text-yellow-700
- `generating`: variant=secondary, className=animate-pulse, prepend Loader2 icon
- `completed`: variant=default, className=bg-green-600 hover:bg-green-700
- `failed`: variant=destructive

**Report type badge colors** (per ticket spec):
- Master data types (daily/weekly/employee): variant=outline + blue tinting
- Monthly types (monthly/department): variant=outline + green tinting
- Absence types (absence/vacation): variant=outline + purple tinting
- Time types (overtime/account): variant=outline + orange tinting
- Custom: variant=outline (default gray)

Helper function `getReportTypeBadge(reportType, t)` to map type to badge styling.

**Actions dropdown** (DropdownMenu):
- Download (disabled unless `status === 'completed'`)
- Delete (disabled if `status === 'generating' || status === 'pending'`)

**Event handlers** (same as payroll):
- Row click -> `onRowClick(item)`
- Dropdown actions -> `onDownload(item)`, `onDelete(item)`
- `e.stopPropagation()` on actions cell

**Loading state**: Include inline `ReportDataTableSkeleton` component (same pattern as `PayrollExportDataTableSkeleton` at line 214).

**Utility functions**:
- `formatDate(dateStr)` -- same as payroll pattern
- `formatFileSize(bytes)` -- reuse pattern from detail sheet (B/KB/MB)

### 3.4 `generate-report-dialog.tsx`

**Pattern**: `/apps/web/src/components/payroll-exports/generate-export-dialog.tsx`

This is the most complex component. Uses Sheet (right side), not Dialog.

**Props**:
```typescript
interface GenerateReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Form state** (all `useState`):
- `reportType: string` (empty initially)
- `name: string` (empty)
- `format: string` ('pdf' default)
- `dateRange: DateRange | undefined` (undefined)
- `employeeIds: string[]` ([])
- `departmentIds: string[]` ([])
- `costCenterIds: string[]` ([])
- `teamIds: string[]` ([])
- `error: string | null` (null)

**Report type selector** -- Grouped select:
```
<Select>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Master Data</SelectLabel>
      <SelectItem value="daily_overview">Daily Overview</SelectItem>
      <SelectItem value="weekly_overview">Weekly Overview</SelectItem>
      <SelectItem value="employee_timesheet">Employee Timesheet</SelectItem>
    </SelectGroup>
    <SelectGroup>
      <SelectLabel>Monthly</SelectLabel>
      <SelectItem value="monthly_overview">Monthly Overview</SelectItem>
      <SelectItem value="department_summary">Department Summary</SelectItem>
    </SelectGroup>
    ...
  </SelectContent>
</Select>
```

Use `SelectGroup` and `SelectLabel` from shadcn Select (verify they exist; if not, use `<div>` separators).

**Date range** -- Use existing `DateRangePicker` component:
```tsx
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'

<DateRangePicker
  value={dateRange}
  onChange={setDateRange}
  placeholder={t('generate.dateRangeLabel')}
/>
```

Show validation message if report type requires date range and no range selected.

**Date range required types** (matching backend `requiresDateRange`):
```typescript
const REQUIRES_DATE_RANGE = [
  'daily_overview', 'weekly_overview', 'monthly_overview',
  'employee_timesheet', 'absence_report', 'overtime_report',
  'department_summary', 'account_balances'
]
```

Types that do NOT require date range: `vacation_report`, `custom`.

**Entity filters** -- Use Popover + Checkbox list pattern (no existing multi-select component in the codebase):

For each entity filter (employees, departments, cost centers, teams):
1. Fetch data using existing hooks (`useEmployees`, `useDepartments`, `useCostCenters`, `useTeams`) -- enabled only when dialog is open
2. Build a simple multi-select using Popover + ScrollArea + Checkbox:
   ```tsx
   <Popover>
     <PopoverTrigger asChild>
       <Button variant="outline" className="w-full justify-between">
         {selectedIds.length > 0
           ? t('generate.employeeFilterLabel') + ` (${selectedIds.length})`
           : t('generate.employeeFilterPlaceholder')}
         <ChevronsUpDown className="ml-2 h-4 w-4" />
       </Button>
     </PopoverTrigger>
     <PopoverContent className="w-full p-0">
       <ScrollArea className="h-60">
         {items.map(item => (
           <div key={item.id} className="flex items-center space-x-2 p-2">
             <Checkbox
               checked={selectedIds.includes(item.id)}
               onCheckedChange={(checked) => toggleId(item.id, checked)}
             />
             <Label>{item.name}</Label>
           </div>
         ))}
       </ScrollArea>
     </PopoverContent>
   </Popover>
   ```

Consider creating a small helper component `MultiSelectPopover` inside the generate dialog file (not a shared component) to avoid repeating this pattern 4 times.

**Filter visibility by report type**:
- All types: date range, employees, departments, cost centers
- Teams: show for all types (general filter)
- When report type is empty: show no filters (only show after type is selected)

**Form reset** -- Reset all fields when dialog opens (useEffect on `open`):
```typescript
React.useEffect(() => {
  if (open) {
    setReportType('')
    setName('')
    setFormat('pdf')
    setDateRange(undefined)
    setEmployeeIds([])
    setDepartmentIds([])
    setCostCenterIds([])
    setTeamIds([])
    setError(null)
  }
}, [open])
```

**Submit handler**:
```typescript
const handleSubmit = async () => {
  setError(null)

  if (!reportType) {
    setError(t('generate.validationReportTypeRequired'))
    return
  }
  if (!format) {
    setError(t('generate.validationFormatRequired'))
    return
  }
  if (REQUIRES_DATE_RANGE.includes(reportType) && (!dateRange?.from || !dateRange?.to)) {
    setError(t('generate.dateRangeRequired'))
    return
  }

  const parameters: components['schemas']['GenerateReportRequest']['parameters'] = {}
  if (dateRange?.from) parameters.from_date = formatDateParam(dateRange.from)
  if (dateRange?.to) parameters.to_date = formatDateParam(dateRange.to)
  if (employeeIds.length > 0) parameters.employee_ids = employeeIds
  if (departmentIds.length > 0) parameters.department_ids = departmentIds
  if (costCenterIds.length > 0) parameters.cost_center_ids = costCenterIds
  if (teamIds.length > 0) parameters.team_ids = teamIds

  try {
    await generateMutation.mutateAsync({
      body: {
        report_type: reportType as components['schemas']['GenerateReportRequest']['report_type'],
        format: format as components['schemas']['GenerateReportRequest']['format'],
        ...(name ? { name } : {}),
        ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
      },
    })
    onOpenChange(false)
  } catch (err) {
    const apiError = parseApiError(err)
    setError(apiError.message ?? t('generate.error'))
  }
}
```

Date formatting helper:
```typescript
function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}
```

**Layout** (Sheet):
```tsx
<Sheet open={open} onOpenChange={handleClose}>
  <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
    <SheetHeader>...</SheetHeader>
    <ScrollArea className="flex-1 -mx-4 px-4">
      <div className="space-y-4 py-4">
        {/* Error alert */}
        {/* Report type select */}
        {/* Name input */}
        {/* Format select */}
        {/* Date range picker (shown when type requires it) */}
        {/* Entity filters (collapsible section) */}
      </div>
    </ScrollArea>
    <SheetFooter className="flex-row gap-2 border-t pt-4">
      <Button variant="outline" ... >Cancel</Button>
      <Button ... >Generate Report</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**Imports needed**:
- `Sheet`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`
- `Select`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectLabel`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Input` from `@/components/ui/input`
- `Label` from `@/components/ui/label`
- `Button` from `@/components/ui/button`
- `Alert`, `AlertDescription` from `@/components/ui/alert`
- `ScrollArea` from `@/components/ui/scroll-area`
- `Popover`, `PopoverContent`, `PopoverTrigger` from `@/components/ui/popover`
- `Checkbox` from `@/components/ui/checkbox`
- `DateRangePicker` from `@/components/ui/date-range-picker`
- `Loader2`, `ChevronsUpDown` from `lucide-react`
- `useGenerateReport` from `@/hooks/api`
- `useEmployees`, `useDepartments`, `useCostCenters`, `useTeams` from `@/hooks/api`
- `parseApiError` from `@/lib/api/errors`

**Check**: Verify that `SelectGroup` and `SelectLabel` are exported from `/apps/web/src/components/ui/select.tsx`. If not, fallback to using dividers or a flat list with group headings as disabled items.

### 3.5 `report-detail-sheet.tsx`

**Pattern**: `/apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx`

**Props**:
```typescript
interface ReportDetailSheetProps {
  item: ReportRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDownload: (item: ReportRow) => void
  onDelete: (item: ReportRow) => void
  fullReport?: components['schemas']['Report'] | null
}
```

**Sections** (in ScrollArea):

1. **Error alert** -- if `isFailed && error_message`, show destructive Alert
2. **Report Information** -- bordered card:
   - Name: `item.name ?? '-'`
   - Type: `t('types.${report_type}')`
   - Format: uppercase format string
3. **Status** -- bordered card:
   - Status: badge (reuse `getStatusBadge`)
   - Requested At: formatted datetime
   - Started At: formatted datetime (from fullReport)
   - Completed At: formatted datetime (if completed)
4. **Results** -- bordered card (if completed):
   - Row Count: `fullReport?.row_count`
   - File Size: `formatFileSize(fullReport?.file_size)`
5. **Parameters** -- bordered card (if parameters exist):
   - Date Range: `from_date` to `to_date`
   - Employees: count of employee_ids
   - Departments: count of department_ids
   - Cost Centers: count of cost_center_ids
   - Teams: count of team_ids

**Footer buttons**:
- Close (always)
- Download (only when completed)
- Delete (not when generating/pending)

### 3.6 `index.ts` -- Barrel exports

```typescript
export { ReportSkeleton } from './report-skeleton'
export { ReportToolbar } from './report-toolbar'
export { ReportDataTable } from './report-data-table'
export type { ReportRow } from './report-data-table'
export { ReportDetailSheet } from './report-detail-sheet'
export { GenerateReportDialog } from './generate-report-dialog'
```

**Pattern**: Same as `/apps/web/src/components/payroll-exports/index.ts`

---

## Phase 4: Page Assembly

### File to Create

**`/apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`**

### Pattern Reference
Model directly after `/apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`

### Page Structure

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useReports,
  useReport,
  useDeleteReport,
  useDownloadReport,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ReportSkeleton,
  ReportToolbar,
  ReportDataTable,
  ReportDetailSheet,
  GenerateReportDialog,
} from '@/components/reports'
import type { ReportRow } from '@/components/reports'

export default function ReportsPage() {
  const router = useRouter()
  const t = useTranslations('reports')
  const tc = useTranslations('common')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [reportTypeFilter, setReportTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Overlays
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<ReportRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ReportRow | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const enabled = !authLoading && isAdmin

  // Queries
  const { data: reportsData, isLoading: reportsLoading } = useReports({
    reportType: reportTypeFilter !== 'all' ? reportTypeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    enabled,
  })

  const { data: fullReportData } = useReport(selectedItem?.id)

  // Mutations
  const deleteMutation = useDeleteReport()
  const downloadMutation = useDownloadReport()

  // Map API data to row type
  const reportRows: ReportRow[] = React.useMemo(() => {
    const items = reportsData?.data ?? []
    return items.map((item) => ({
      id: item.id ?? '',
      name: item.name,
      report_type: item.report_type ?? 'custom',
      format: item.format,
      status: item.status ?? 'pending',
      row_count: item.row_count,
      file_size: item.file_size,
      requested_at: item.requested_at,
      completed_at: item.completed_at,
      error_message: item.error_message,
    }))
  }, [reportsData])

  // Handlers (same pattern as payroll exports)
  const handleDownload = (item: ReportRow) => {
    downloadMutation.mutate({ id: item.id })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteTarget.id } })
      setDeleteTarget(null)
      if (selectedItem?.id === deleteTarget.id) {
        setSelectedItem(null)
      }
    } catch {
      // Error handled by mutation state
    }
  }

  if (authLoading) return <ReportSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      <ReportToolbar
        reportType={reportTypeFilter}
        onReportTypeChange={setReportTypeFilter}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onGenerate={() => setGenerateOpen(true)}
      />

      <div className="text-sm text-muted-foreground">
        {reportRows.length === 1
          ? t('count.item', { count: reportRows.length })
          : t('count.items', { count: reportRows.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {reportsLoading ? (
            <ReportDataTable items={[]} isLoading={true} onRowClick={() => {}} onDownload={() => {}} onDelete={() => {}} />
          ) : reportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
              <Button onClick={() => setGenerateOpen(true)} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                {t('empty.generateButton')}
              </Button>
            </div>
          ) : (
            <ReportDataTable
              items={reportRows}
              isLoading={false}
              onRowClick={setSelectedItem}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <ReportDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => { if (!open) setSelectedItem(null) }}
        onDownload={handleDownload}
        onDelete={(item) => { setSelectedItem(null); setDeleteTarget(item) }}
        fullReport={fullReportData ?? null}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t('delete.title')}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      {/* Generate Report Dialog */}
      <GenerateReportDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
      />
    </div>
  )
}
```

---

## Phase 5: Verification & Testing

### Manual Testing Checklist

1. **Page loads**: Navigate to `/admin/reports` -- page renders with skeleton, then toolbar + empty state
2. **Sidebar nav**: Verify "Reports" link in Administration section works
3. **Auth guard**: Non-admin users get redirected to `/dashboard`
4. **Generate report**:
   - Click "Generate Report" button
   - Sheet opens from right side
   - Select report type -- verify grouped options render correctly
   - Select format
   - Verify date range picker appears for types that require it
   - Verify date range validation blocks submission when required
   - Submit with valid data -- dialog closes, list refreshes
5. **Async polling**:
   - After generation, verify table auto-updates (3s interval)
   - Status badge animates during `generating` state
   - Polling stops once status reaches `completed` or `failed`
6. **Data table**:
   - Verify all columns render correctly
   - Status badges have correct colors/animations
   - Report type badges show translated names
   - File size formats as KB/MB
   - Row click opens detail sheet
7. **Detail sheet**:
   - Shows all report metadata
   - Shows error message with destructive Alert for failed reports
   - Shows parameters section with date range, filter counts
   - Download button enabled only for completed reports
   - Delete button disabled during generation
8. **Download**:
   - Click download on completed report
   - Browser triggers file download
   - Filename extracted from Content-Disposition header
9. **Delete**:
   - Click delete -- confirm dialog appears (bottom Sheet)
   - Confirm -- report removed from list
   - If detail sheet was open for deleted item, it closes
10. **Filters**:
    - Report type filter narrows table to selected type
    - Status filter narrows table to selected status
    - Filters combine correctly
11. **Empty state**:
    - When no reports exist, show empty state with "Generate Report" button
    - Empty state also shows when filters produce no results
12. **Translations**:
    - Switch to German locale
    - Verify all text is translated
    - No missing translation warnings in console

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Generate while items are pending | New item appears in table, polling continues |
| Multiple items generating | Polling continues until ALL items complete |
| Download failed report | Download button is disabled |
| Delete generating report | Delete button is disabled |
| Very long report name | Truncate with ellipsis in table, full name in detail |
| No date range for required type | Validation error in generate dialog |
| Network error during download | Error message from `useDownloadReport` mutation |
| 409 from download (not ready) | Error message shows report still generating |
| Empty entity filter lists | Popover shows "No items" message |
| Rapid filter changes | React Query deduplicates, last filter wins |

---

## Summary: Files to Create

| # | File | Description |
|---|------|-------------|
| 1 | `/apps/web/src/hooks/api/use-reports.ts` | API hooks (5 hooks) |
| 2 | `/apps/web/src/components/reports/report-skeleton.tsx` | Loading skeleton |
| 3 | `/apps/web/src/components/reports/report-toolbar.tsx` | Toolbar with filters |
| 4 | `/apps/web/src/components/reports/report-data-table.tsx` | Data table |
| 5 | `/apps/web/src/components/reports/generate-report-dialog.tsx` | Generate dialog (Sheet) |
| 6 | `/apps/web/src/components/reports/report-detail-sheet.tsx` | Detail sheet |
| 7 | `/apps/web/src/components/reports/index.ts` | Barrel exports |
| 8 | `/apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx` | Page component |

## Summary: Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `/apps/web/messages/en.json` | Add `reports` namespace (~100 keys) |
| 2 | `/apps/web/messages/de.json` | Add `reports` namespace (~100 keys, German) |
| 3 | `/apps/web/src/hooks/api/index.ts` | Add report hook exports |

## Implementation Order

1. **Phase 1**: Translations (en.json + de.json) -- no dependencies
2. **Phase 2**: API hooks (use-reports.ts + index.ts export) -- no component dependencies
3. **Phase 3**: Components in order:
   - 3.1: report-skeleton.tsx (standalone)
   - 3.2: report-toolbar.tsx (standalone)
   - 3.3: report-data-table.tsx (defines ReportRow type used by others)
   - 3.4: generate-report-dialog.tsx (uses hooks from Phase 2)
   - 3.5: report-detail-sheet.tsx (uses ReportRow from 3.3)
   - 3.6: index.ts (barrel exports all above)
4. **Phase 4**: Page assembly (uses all above)
5. **Phase 5**: Manual testing and verification

**Estimated scope**: ~8 files to create, 3 files to modify. Moderate complexity, with generate dialog being the most complex component due to grouped select and multi-select entity filters.
