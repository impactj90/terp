# ZMI-TICKET-043: Monthly Values Batch UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-016

## Goal
Provide a monthly values admin page with batch close/reopen operations, recalculation triggers, and status overview for all employees in a given month.

## Scope
- In scope: Monthly values list with year/month selector, status badges, batch close/reopen actions, recalculate dialog, individual close/reopen, progress reporting.
- Out of scope: Monthly evaluation template management (ZMI-TICKET-046), payroll export (ZMI-TICKET-044), daily value drill-down (covered by evaluations query).

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`
  - Route: `/admin/monthly-values`
  - Default view: current month, all employees

### Components
- `apps/web/src/components/monthly-values/monthly-values-data-table.tsx`
  - Columns: Employee Name, Personnel Number, Status (badge), Target Hours, Net Hours, Overtime, Balance, Absence Days, Actions
  - Status badges: `open` = outline, `calculated` = secondary, `closed` = default/green, `exported` = primary/blue
  - Time values displayed as hours:minutes (e.g., "168:00" for 10080 minutes)
  - Row click opens detail sheet
  - Sortable columns: Employee Name, Status, Overtime, Balance
  - Checkbox selection for batch operations
- `apps/web/src/components/monthly-values/monthly-values-detail-sheet.tsx`
  - Shows full monthly value details for one employee
  - Sections: Time Summary (target, gross, net, break, overtime, undertime, balance), Work Days (working_days, worked_days, absence_days, holiday_days), Account Balances (key-value list from account_balances object), Closing Info (status, closed_at, closed_by)
  - Actions: Close Month, Reopen Month (conditional on status)
- `apps/web/src/components/monthly-values/monthly-values-toolbar.tsx`
  - Year/month selector (year dropdown + month dropdown, or combined date picker)
  - Department filter
  - Status filter (open | calculated | closed | exported | all)
  - Search input (employee name/number)
  - Batch actions toolbar (appears when rows selected):
    - "Close Selected" button
    - "Reopen Selected" button
    - Selection count indicator
- `apps/web/src/components/monthly-values/batch-close-dialog.tsx`
  - Confirmation dialog for batch close
  - Shows: month/year, number of employees selected (or "all employees" if none selected)
  - Checkbox: "Recalculate before closing" (default: true)
  - Department filter (optional, for "close all in department")
  - On submit: POST `/monthly-values/close-batch`
  - Result display: "Closed: X, Skipped: Y, Errors: Z" with expandable error list
- `apps/web/src/components/monthly-values/batch-reopen-dialog.tsx`
  - Confirmation dialog for batch reopen (individual reopen per selected row since no batch reopen endpoint)
  - Reason textarea (required, min 10 chars per API)
  - Sequential processing with progress indicator
- `apps/web/src/components/monthly-values/recalculate-dialog.tsx`
  - Dialog to trigger recalculation
  - Fields: Year, Month (pre-filled from current view), Employee selector (optional, "all" if empty)
  - Uses POST `/monthly-values/recalculate`
  - Shows: "Recalculation started for {N} employees" on 202 response
- `apps/web/src/components/monthly-values/monthly-values-skeleton.tsx`
  - Skeleton for the page with table placeholder

### API hooks
- `apps/web/src/hooks/api/use-monthly-values.ts`
  - `useMonthlyValues(params?)` — GET `/monthly-values` with query params: `employee_id`, `year`, `month`, `status`, `department_id`
  - `useMonthlyValue(id)` — GET `/monthly-values/{id}`
  - `useCloseMonth()` — POST `/monthly-values/{id}/close`, body: `{ recalculate?, notes? }`, invalidates `[['/monthly-values']]`
  - `useReopenMonth()` — POST `/monthly-values/{id}/reopen`, body: `{ reason }`, invalidates `[['/monthly-values']]`
  - `useCloseMonthBatch()` — POST `/monthly-values/close-batch`, body: `{ year, month, employee_ids?, department_id?, recalculate? }`, invalidates `[['/monthly-values']]`
  - `useRecalculateMonthlyValues()` — POST `/monthly-values/recalculate`, body: `{ year, month, employee_id? }`, invalidates `[['/monthly-values']]`

### UI behavior
- Default view: current year/month selected, status filter = "all"
- Minutes-to-hours formatting: all time values shown as "HH:MM" (e.g., 10080 → "168:00")
- Batch close: on submit, show progress dialog with result counts; on errors, display each error with employee name and reason
- Batch reopen: since no batch endpoint exists, process individually with a sequential loop showing progress bar
- Recalculate: 202 response means async processing; show info toast "Recalculation started" and suggest refreshing after a moment
- Status flow: open → calculated → closed → exported (close only from open/calculated, reopen only from closed)
- Row checkbox selection: batch action toolbar appears at top when ≥1 row selected
- Close button disabled for already-closed/exported months; reopen button disabled for non-closed months
- Account balances in detail sheet: display account name (from expanded relation if available) with value in hours
- Empty state: "No monthly values found for {Month Year}" — may need to run recalculation first

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.monthly-values', href: '/admin/monthly-values', icon: CalendarCheck, roles: ['admin'] }`
- Breadcrumb segment: `'monthly-values': 'monthly-values'` in segmentToKey mapping
- Translation namespace: `monthly-values`
  - Key groups: `page.*`, `table.*`, `detail.*`, `batch-close.*`, `batch-reopen.*`, `recalculate.*`, `status.*`, `toolbar.*`, `empty.*`

## Acceptance criteria
- Admin can view monthly values for all employees for a selected year/month
- Admin can filter by department, status, and search by employee
- Admin can close a single employee's month with optional recalculation
- Admin can reopen a closed month with a required reason
- Admin can batch close multiple employees or an entire department
- Batch close shows result summary with error details
- Admin can trigger recalculation for a month
- Status badges correctly reflect the state of each monthly value
- Time values displayed in hours:minutes format

## Tests

### Component tests
- Data table renders correct columns with formatted time values
- Status badges show correct variant for each status
- Batch action toolbar appears/disappears based on selection
- Batch close dialog shows correct employee count and handles errors
- Recalculate dialog pre-fills year/month from current view
- Detail sheet shows all sections with correct formatting

### Integration tests
- Load monthly values for a specific month, verify data
- Close a month, verify status changes to "closed"
- Reopen a month, verify status changes back to "open"
- Batch close with recalculate, verify all statuses change
- Recalculate triggers 202 response and shows info toast
- Filter by status shows correct subset

## Test case pack
1) View monthly values
   - Input: Navigate to page, select January 2026
   - Expected: Table shows all employees with January monthly values
2) Close single month
   - Input: Click row, open detail sheet, click "Close Month"
   - Expected: Status changes to "closed", closed_at timestamp appears
3) Reopen closed month
   - Input: Open detail for closed month, click "Reopen", enter reason (≥10 chars)
   - Expected: Status changes to "open", reopen reason stored
4) Batch close department
   - Input: Select department filter, click "Close All", enable recalculate, confirm
   - Expected: Progress dialog shows results: "Closed: 15, Skipped: 2, Errors: 0"
5) Batch close with errors
   - Input: Batch close includes employees with calculation errors
   - Expected: Error list shows employee names and reasons for failure
6) Trigger recalculation
   - Input: Open recalculate dialog, select month, click "Recalculate"
   - Expected: Toast shows "Recalculation started for X employees"

## Dependencies
- ZMI-TICKET-016 (Monthly Evaluation and Closing backend)
- Employees API (for employee details in table)
- Departments API (for filter dropdown)
