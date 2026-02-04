# ZMI-TICKET-042: Employee Day Plan Assignment UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-005, ZMI-TICKET-006

## Goal
Provide a bulk day plan assignment page with a calendar-grid view showing employees as rows and dates as columns, supporting bulk assignment and range deletion of employee day plans.

## Scope
- In scope: Calendar-grid view for day plan assignments, bulk assign dialog, delete range dialog, per-cell editing, source badges.
- Out of scope: Day plan CRUD (separate page), tariff-based auto-assignment (backend handles this), individual employee day plan view (covered in employee detail).

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx`
  - Route: `/admin/employee-day-plans`
  - Default view: current week (Mon–Sun) for all employees

### Components
- `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx`
  - Grid layout: rows = employees (sorted by last_name), columns = dates in selected range
  - Each cell shows: day plan code/name (abbreviated), source badge (tariff/manual/holiday), color-coded by source
  - Empty cells = no plan assigned (off day)
  - Cell click opens single-cell edit popover
  - Keyboard navigation: arrow keys between cells
  - Sticky first column (employee name) and sticky header row (dates)
- `apps/web/src/components/employee-day-plans/day-plan-cell.tsx`
  - Individual cell component with day plan abbreviation and source indicator
  - Color coding: tariff=blue, manual=green, holiday=orange, empty=gray
  - Hover tooltip: full day plan name, source, notes
- `apps/web/src/components/employee-day-plans/day-plan-cell-edit-popover.tsx`
  - Popover for editing a single cell
  - Day plan selector dropdown (useDayPlans hook)
  - Source selector (manual by default for user edits)
  - Notes input
  - Save/Cancel/Remove buttons
  - Uses PUT `/employees/{employee_id}/day-plans/{date}` (upsert)
- `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx`
  - Dialog for bulk assignment
  - Fields:
    - Employee multi-select (checkbox list with search, using useEmployees hook)
    - Date range picker (from/to)
    - Day plan selector
    - Source (defaults to "manual")
    - Notes (optional)
  - Preview: "{N} assignments will be created/updated for {M} employees over {D} days"
  - Uses POST `/employee-day-plans/bulk`
  - Shows result summary: "Created: X, Updated: Y"
- `apps/web/src/components/employee-day-plans/delete-range-dialog.tsx`
  - Dialog for deleting a range of assignments
  - Fields:
    - Employee selector (single employee)
    - Date range picker (from/to)
  - Confirmation text: "This will delete all day plan assignments for {employee_name} from {from} to {to}"
  - Uses POST `/employee-day-plans/delete-range`
  - Shows result: "Deleted: X assignments"
- `apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx`
  - Week/date range selector with prev/next navigation arrows
  - View toggle: week (7 days) | two-weeks (14 days) | month
  - Department filter dropdown
  - Employee search input
  - Action buttons: "Bulk Assign", "Delete Range"
- `apps/web/src/components/employee-day-plans/day-plan-grid-skeleton.tsx`
  - Skeleton matching grid layout during loading

### API hooks
- `apps/web/src/hooks/api/use-employee-day-plans.ts`
  - `useEmployeeDayPlans(params?)` — GET `/employee-day-plans` with query params: `employee_id`, `from`, `to`, `source`, `limit`, `cursor`
  - `useEmployeeDayPlansForEmployee(employeeId, from, to)` — GET `/employees/{employee_id}/day-plans?from={from}&to={to}`
  - `useCreateEmployeeDayPlan()` — POST `/employee-day-plans`, invalidates `[['/employee-day-plans']]`
  - `useUpsertEmployeeDayPlan()` — PUT `/employees/{employee_id}/day-plans/{date}`, invalidates `[['/employee-day-plans']]`
  - `useBulkCreateEmployeeDayPlans()` — POST `/employee-day-plans/bulk`, invalidates `[['/employee-day-plans']]`
  - `useDeleteEmployeeDayPlanRange()` — POST `/employee-day-plans/delete-range`, invalidates `[['/employee-day-plans']]`
  - `useDeleteEmployeeDayPlan()` — DELETE `/employee-day-plans/{id}`, invalidates `[['/employee-day-plans']]`

### UI behavior
- Grid data loading: fetch employee-day-plans for the visible date range with all employees in the filtered department
- Week navigation: clicking prev/next shifts by the view size (7/14/~30 days)
- Cell edit popover: on save, uses upsert endpoint; on remove, uses delete endpoint; grid refreshes via query invalidation
- Bulk assign: dialog shows a preview count before confirming; on success, closes dialog and refreshes grid
- Delete range: confirmation required; shows count of deleted assignments in success toast
- 409 conflict on single create (duplicate employee+date): handled by upsert endpoint, so no conflict expected
- Empty grid state: "No employees found for the selected filters"
- Performance: for large employee counts (>50), paginate employees with virtual scrolling on rows
- Date columns show day-of-week abbreviation and date (e.g., "Mon 03")

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.employee-day-plans', href: '/admin/employee-day-plans', icon: CalendarDays, roles: ['admin'] }`
- Breadcrumb segment: `'employee-day-plans': 'employee-day-plans'` in segmentToKey mapping
- Translation namespace: `employee-day-plans`
  - Key groups: `page.*`, `grid.*`, `cell.*`, `bulk-assign.*`, `delete-range.*`, `toolbar.*`, `empty.*`

## Acceptance criteria
- Admin can view a calendar grid of employee day plan assignments for a date range
- Admin can edit a single cell (upsert a day plan for an employee on a date)
- Admin can bulk assign a day plan to multiple employees over a date range
- Admin can delete all assignments for an employee in a date range
- Grid shows source badges (tariff/manual/holiday) with color coding
- Week/date navigation works correctly
- Department filter limits displayed employees
- Non-admin users cannot access the page

## Tests

### Component tests
- Grid renders correct number of rows (employees) and columns (dates)
- Cell displays day plan code and source badge with correct color
- Cell edit popover saves via upsert endpoint and refreshes grid
- Bulk assign dialog computes correct preview count
- Delete range dialog shows confirmation with employee name and date range
- Week navigation shifts dates correctly

### Integration tests
- Load grid for current week, verify data matches API response
- Edit a cell, verify the change persists on grid refresh
- Bulk assign to 3 employees over 5 days, verify 15 cells updated
- Delete range for one employee, verify cells cleared
- Filter by department, verify only department employees shown

## Test case pack
1) View current week grid
   - Input: Navigate to employee day plans page
   - Expected: Grid shows all employees with current week columns, assigned day plans visible
2) Edit single cell
   - Input: Click cell for Employee A on Monday, select "Day Plan B", save
   - Expected: Cell updates to show "Day Plan B" with manual source badge
3) Bulk assign
   - Input: Select 3 employees, date range Mon-Fri, day plan "Standard", confirm
   - Expected: Dialog shows "15 assignments will be created/updated", after confirm shows "Created: 15, Updated: 0"
4) Delete range
   - Input: Select Employee A, date range Mon-Fri, confirm
   - Expected: All cells for Employee A in range cleared
5) Navigate weeks
   - Input: Click "Next" button
   - Expected: Grid shifts to next week, new data loads
6) Department filter
   - Input: Select "IT Department" from filter
   - Expected: Only IT department employees shown in grid rows

## Dependencies
- ZMI-TICKET-005 (Time Plan Framework backend)
- ZMI-TICKET-006 (Day Plan Advanced Rules backend)
- Employees list API (for grid rows)
- Day Plans list API (for selector dropdowns)
- Departments API (for filter dropdown)
