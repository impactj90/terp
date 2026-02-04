# ZMI-TICKET-051: Report Generation UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-020

## Goal
Provide a report generation page with async status tracking, multiple report types, configurable filters, format selection, and file download.

## Scope
- In scope: Report list, generate dialog with type/params/format, async status polling, file download, delete report.
- Out of scope: Custom report builder/designer, real-time preview of report contents.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/reports/page.tsx`
  - Route: `/admin/reports`

### Components
- `apps/web/src/components/reports/report-data-table.tsx`
  - Columns: Name, Report Type (badge), Format (icon), Status (badge), Row Count, File Size, Generated At, Actions
  - Status badges: pending=outline, generating=secondary/animated, completed=green, failed=red
  - Report type badges with category colors (master data=blue, monthly=green, variable=purple, team=orange, order=gray)
  - Actions: Download (completed only), Delete
- `apps/web/src/components/reports/generate-report-dialog.tsx`
  - Dialog for generating a new report
  - Fields:
    - Report Type (select with grouped options):
      - Master Data: daily_overview, weekly_overview, employee_timesheet
      - Monthly: monthly_overview, department_summary
      - Absence/Vacation: absence_report, vacation_report
      - Time Analysis: overtime_report, account_balances
      - Custom: custom
    - Name (text input, optional, auto-generated if empty)
    - Format (select: PDF | XLSX | CSV | JSON)
    - Parameters (dynamic based on report type):
      - Date range (from_date, to_date) — required for most types
      - Employee filter (multi-select, optional)
      - Department filter (multi-select, optional)
      - Cost Center filter (multi-select, optional)
      - Team filter (multi-select, optional)
  - Parameter visibility varies by report type (e.g., team_ids only for team reports)
  - Uses POST `/reports` → returns 202 with Report (status=pending)
- `apps/web/src/components/reports/report-detail-sheet.tsx`
  - Shows: name, type, format, status, parameters used, timestamps, file size, row count
  - Error message if failed
  - Actions: Download, Delete
- `apps/web/src/components/reports/report-toolbar.tsx`
  - Report type filter
  - Status filter
  - "Generate Report" button
- `apps/web/src/components/reports/report-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-reports.ts`
  - `useReports(params?)` — GET `/reports` with query params: `report_type`, `status`, `limit`, `cursor`
  - `useReport(id)` — GET `/reports/{id}`
  - `useGenerateReport()` — POST `/reports`, body: `{ report_type, format, name?, parameters? }`, invalidates `[['/reports']]`
  - `useDeleteReport()` — DELETE `/reports/{id}`, invalidates `[['/reports']]`
  - `useDownloadReport(id)` — custom hook wrapping GET `/reports/{id}/download` with blob download

### UI behavior
- Async polling: after generation, poll GET `/reports/{id}` every 3 seconds until completed/failed (React Query refetchInterval)
- Download: browser blob download, Content-Disposition provides filename
- Supported formats: PDF (FileText icon), XLSX (FileSpreadsheet), CSV (FileText), JSON (Braces)
- Report type → parameter mapping: show only relevant parameter fields per type
- Auto-name: if name is empty, generate "Monthly Overview - January 2026" style name from type + params
- Failed reports: show error_message in detail sheet with destructive alert
- Empty state: "No reports generated yet. Create your first report."
- File size display: formatted as KB/MB

### Navigation & translations
- Sidebar entry already exists in "Administration" section at `/admin/reports`
- Breadcrumb segment: `'reports': 'reports'` already mapped
- Translation namespace: `reports`
  - Key groups: `page.*`, `table.*`, `generate.*`, `detail.*`, `types.*` (report type labels), `status.*`, `empty.*`

## Acceptance criteria
- Admin can generate reports of any available type with appropriate filters
- Report generation is async with status polling
- Completed reports can be downloaded in the selected format
- Failed reports show error details
- Report type selector shows categorized options
- Parameter fields dynamically appear based on report type
- Reports can be deleted

## Tests

### Component tests
- Generate dialog shows correct parameter fields per report type
- Status badges animate during generation
- Download triggers browser download for completed reports
- Type filter and status filter work correctly
- Detail sheet displays all metadata

### Integration tests
- Generate report, verify polling completes
- Download completed report
- Generate report with filters, verify parameters stored
- Delete report, verify removed

## Test case pack
1) Generate monthly overview
   - Input: Type=monthly_overview, format=PDF, date range January 2026, department filter
   - Expected: Report created with status=pending, polling starts
2) Download completed report
   - Input: Click download on completed XLSX report
   - Expected: Browser downloads Excel file
3) Failed report
   - Input: Report that fails during generation
   - Expected: Status=failed, error message shown
4) Report with team filter
   - Input: Type=department_summary, select 2 teams
   - Expected: team_ids parameter stored and displayed in detail

## Dependencies
- ZMI-TICKET-020 (Reporting Module backend)
- Departments API (for filter)
- Employees API (for filter)
- Cost Centers API (for filter)
- Teams API (for filter)
