# ZMI-TICKET-044: Payroll Export UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-021

## Goal
Provide a payroll export page for generating, previewing, and downloading payroll export files with async status tracking and multiple format support.

## Scope
- In scope: Export list, generate dialog, preview table, async status polling, file download, delete export.
- Out of scope: Export interface configuration (ZMI-TICKET-045), monthly value closing (ZMI-TICKET-043), custom export script execution.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`
  - Route: `/admin/payroll-exports`

### Components
- `apps/web/src/components/payroll-exports/payroll-export-data-table.tsx`
  - Columns: Year/Month, Export Type (badge), Format, Status (badge), Employee Count, Total Hours, Generated At, Actions
  - Status badges: `pending` = outline/yellow, `generating` = secondary/animated, `completed` = default/green, `failed` = destructive/red
  - Generating status shows a spinner/pulse animation
  - Row click opens preview (if completed) or detail view
  - Actions dropdown: Preview, Download, Delete
- `apps/web/src/components/payroll-exports/generate-export-dialog.tsx`
  - Dialog for starting a new export
  - Fields:
    - Year (number input, defaults to current year)
    - Month (select 1–12, defaults to previous month)
    - Export Type (select: standard | datev | sage | custom)
    - Export Interface (select from useExportInterfaces hook, optional)
    - Format (select: csv | xlsx | xml | json)
    - Parameters (collapsible advanced section):
      - Employee IDs (multi-select, optional)
      - Department IDs (multi-select, optional)
      - Include Accounts (multi-select from useAccounts hook, optional)
  - Validation: year and month required, format required
  - On 409 "Month not closed": show error "All employees must have closed months before exporting"
  - Uses POST `/payroll-exports` → returns 202 with PayrollExport (status=pending)
- `apps/web/src/components/payroll-exports/payroll-export-preview.tsx`
  - Full-width preview table of export data
  - Columns: Personnel Number, First Name, Last Name, Department, Cost Center, Target Hours, Worked Hours, Overtime Hours, Vacation Days, Sick Days, Other Absence Days
  - Account values displayed as additional dynamic columns
  - Summary row at bottom: totals for hours columns
  - Uses GET `/payroll-exports/{id}/preview`
- `apps/web/src/components/payroll-exports/payroll-export-detail-sheet.tsx`
  - Sheet showing export metadata
  - Sections: Export Info (type, format, year/month), Status (with timestamps), Parameters (employee/department filters used), Summary (employee_count, total_hours, total_overtime, row_count, file_size)
  - Error message displayed in destructive alert if status = "failed"
  - Actions: Preview (if completed), Download (if completed), Delete
- `apps/web/src/components/payroll-exports/payroll-export-toolbar.tsx`
  - Year/month filter
  - Status filter
  - "Generate Export" button (primary action)
- `apps/web/src/components/payroll-exports/payroll-export-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-payroll-exports.ts`
  - `usePayrollExports(params?)` — GET `/payroll-exports` with query params: `year`, `month`, `status`, `limit`, `cursor`
  - `usePayrollExport(id)` — GET `/payroll-exports/{id}`
  - `useGeneratePayrollExport()` — POST `/payroll-exports`, body: `{ year, month, format, export_type?, export_interface_id?, parameters? }`, invalidates `[['/payroll-exports']]`
  - `usePayrollExportPreview(id)` — GET `/payroll-exports/{id}/preview`
  - `useDeletePayrollExport()` — DELETE `/payroll-exports/{id}`, invalidates `[['/payroll-exports']]`
  - `useDownloadPayrollExport(id)` — custom hook wrapping GET `/payroll-exports/{id}/download` with blob download handling

### UI behavior
- Async export polling: after generating, poll GET `/payroll-exports/{id}` every 3 seconds until status is "completed" or "failed"
  - During polling, the row in the table shows a spinning indicator
  - Use React Query's `refetchInterval` with conditional enabling
- Download: trigger browser download via blob URL from the download endpoint
  - Content-Disposition header provides filename
  - Supported formats: CSV, XLSX, XML, JSON
- Preview: loads export data as JSON table; only available when status = "completed"
- 409 on generate: "Month not closed for all employees" — display error and suggest running batch close first (link to monthly values page)
- Failed exports show error_message in detail sheet
- Delete: confirmation dialog, only available for non-generating exports
- Empty state: "No payroll exports yet. Generate your first export." with prominent generate button
- Format icons: CSV = FileText, XLSX = FileSpreadsheet, XML = FileCode, JSON = Braces

### Navigation & translations
- Sidebar entry in "Administration" section: `{ titleKey: 'nav.payroll-exports', href: '/admin/payroll-exports', icon: FileOutput, roles: ['admin'] }`
- Breadcrumb segment: `'payroll-exports': 'payroll-exports'` in segmentToKey mapping
- Translation namespace: `payroll-exports`
  - Key groups: `page.*`, `table.*`, `generate.*`, `preview.*`, `detail.*`, `status.*`, `toolbar.*`, `download.*`, `empty.*`, `errors.*`

## Acceptance criteria
- Admin can generate a payroll export with year/month, type, format, and optional filters
- Export generation starts asynchronously with status polling
- Admin can preview completed export data in a table
- Admin can download the export file in the selected format
- Failed exports show error message
- 409 error when months aren't closed shows helpful message
- Admin can delete exports
- Status badges animate during generation

## Tests

### Component tests
- Generate dialog validates required fields and handles 409 error
- Data table shows correct status badges with animation for "generating"
- Preview table renders columns including dynamic account value columns
- Download hook triggers browser download
- Detail sheet shows all metadata sections
- Polling stops when status reaches terminal state (completed/failed)

### Integration tests
- Generate export, verify polling starts and completes
- Preview completed export, verify data matches
- Download completed export, verify file is received
- Attempt generate with unclosed months, verify 409 handling
- Delete export, verify removed from list

## Test case pack
1) Generate standard CSV export
   - Input: Select January 2026, format=CSV, type=standard, click Generate
   - Expected: Export created with status=pending, polling starts, status changes to generating then completed
2) Preview export data
   - Input: Click completed export, select Preview
   - Expected: Table shows employee data with hours, summary row shows totals
3) Download export file
   - Input: Click Download on completed CSV export
   - Expected: Browser downloads CSV file with correct filename
4) Generate with unclosed months
   - Input: Attempt to generate for a month where some employees are not closed
   - Expected: 409 error displayed: "All employees must have closed months before exporting"
5) Failed export
   - Input: Export that fails during generation
   - Expected: Status changes to "failed", error_message shown in detail sheet
6) Delete export
   - Input: Click Delete on a completed export, confirm
   - Expected: Export removed from list

## Dependencies
- ZMI-TICKET-021 (Data Exchange Exports backend)
- ZMI-TICKET-043 (Monthly Values — months must be closed before export)
- ZMI-TICKET-045 (Export Interface Configuration — optional interface selection)
- Accounts API (for generate dialog account filter)
- Departments API (for generate dialog department filter)
