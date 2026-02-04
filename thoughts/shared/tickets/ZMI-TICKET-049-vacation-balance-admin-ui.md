# ZMI-TICKET-049: Vacation Balance Admin UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-014, ZMI-TICKET-015

## Goal
Provide an admin page for managing vacation balances with year initialization, manual balance creation/editing, and carryover management.

## Scope
- In scope: Vacation balance list with year/department filters, initialize year dialog, manual create/edit balance, carryover configuration.
- Out of scope: Vacation entitlement calculation engine (backend), absence tracking (existing page), vacation special calculations (ZMI-TICKET-059).

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/vacation-balances/page.tsx`
  - Route: `/admin/vacation-balances`

### Components
- `apps/web/src/components/vacation-balances/vacation-balance-data-table.tsx`
  - Columns: Employee Name, Personnel Number, Year, Base Entitlement, Additional, Carryover, Manual Adj., Total Entitlement, Used, Planned, Remaining, Actions
  - Remaining days color-coded: green (>5), yellow (1-5), red (0 or negative)
  - Decimal values displayed with 1 decimal place (e.g., "10.5")
  - Row click opens detail sheet
  - Actions: Edit, View Detail
- `apps/web/src/components/vacation-balances/vacation-balance-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Employee (select from useEmployees, required for create, disabled for edit)
    - Year (number input, required for create, disabled for edit)
    - Base Entitlement (decimal input, required, e.g., 30.0)
    - Additional Entitlement (decimal input, default 0)
    - Carryover from Previous Year (decimal input, default 0)
    - Manual Adjustment (decimal input, default 0, can be negative)
    - Carryover to Next Year (decimal input, optional, edit only)
    - Carryover Expires At (date picker, optional)
  - Calculated preview (read-only): Total Entitlement = base + additional + carryover + manual_adjustment
  - Uses POST `/vacation-balances` for create, PATCH `/vacation-balances/{id}` for edit
  - On 409 "Balance for employee/year already exists": show inline error
- `apps/web/src/components/vacation-balances/vacation-balance-detail-sheet.tsx`
  - Detailed view of a single balance
  - Sections:
    - Entitlement Breakdown: base, additional, carryover, manual adjustment → total
    - Usage: used days, planned days, remaining days (with color-coded badge)
    - Carryover: carryover_to_next, carryover_expires_at
    - Timestamps: created_at, updated_at
  - Visual bar chart showing used/planned/remaining as proportions of total
- `apps/web/src/components/vacation-balances/initialize-year-dialog.tsx`
  - Dialog for bulk initialization
  - Fields:
    - Year (number input, required)
    - Carryover from previous year (checkbox, default true)
  - Info text: "This will create vacation balances for all active employees for {year}. Existing balances will not be overwritten."
  - Uses POST `/vacation-balances/initialize`, body: `{ year, carryover }`
  - Result display: "Created {N} vacation balances for {year}"
- `apps/web/src/components/vacation-balances/vacation-balance-toolbar.tsx`
  - Year selector (dropdown with common years)
  - Department filter
  - Employee search input
  - "Initialize Year" button
  - "Create Balance" button
- `apps/web/src/components/vacation-balances/vacation-balance-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-vacation-balances.ts`
  - `useVacationBalances(params?)` — GET `/vacation-balances` with query params: `employee_id`, `year`, `department_id`
  - `useVacationBalance(id)` — GET `/vacation-balances/{id}`
  - `useCreateVacationBalance()` — POST `/vacation-balances`, body: `{ employee_id, year, base_entitlement, additional_entitlement?, carryover_from_previous?, manual_adjustment?, carryover_expires_at? }`, invalidates `[['/vacation-balances']]`
  - `useUpdateVacationBalance()` — PATCH `/vacation-balances/{id}`, body: partial fields, invalidates `[['/vacation-balances']]`
  - `useInitializeVacationBalances()` — POST `/vacation-balances/initialize`, body: `{ year, carryover? }`, invalidates `[['/vacation-balances']]`

### UI behavior
- Default view: current year, all employees
- Initialize year: creates balances for all active employees; existing balances preserved (no overwrite)
- Carryover option: when enabled, reads previous year's carryover_to_next as new year's carryover_from_previous
- Duplicate balance (employee+year): 409 error shown as "Balance already exists for this employee and year"
- Remaining days visual: color badge (green/yellow/red) plus percentage bar in detail sheet
- Decimal inputs: allow up to 2 decimal places for half-day precision
- Empty state: "No vacation balances for {year}. Use 'Initialize Year' to create balances for all employees."

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.vacation-balances', href: '/admin/vacation-balances', icon: Palmtree, roles: ['admin'] }`
- Breadcrumb segment: `'vacation-balances': 'vacation-balances'` in segmentToKey mapping
- Translation namespace: `vacation-balances`
  - Key groups: `page.*`, `table.*`, `form.*`, `detail.*`, `initialize.*`, `toolbar.*`, `empty.*`, `errors.*`

## Acceptance criteria
- Admin can view vacation balances for all employees for a selected year
- Admin can initialize a year to create balances for all active employees
- Admin can manually create a balance for a specific employee/year
- Admin can edit balance fields (entitlement, adjustments, carryover)
- Duplicate employee/year shows clear 409 error
- Remaining days are color-coded for quick visual assessment
- Department and year filters work correctly

## Tests

### Component tests
- Data table renders balance columns with correct decimal formatting
- Remaining days color coding works (green >5, yellow 1-5, red ≤0)
- Form calculates total_entitlement preview from input fields
- Initialize dialog sends correct year and carryover flag
- 409 duplicate error displays inline in form

### Integration tests
- Initialize year, verify balances created for all active employees
- Create manual balance, verify it appears in list
- Edit balance entitlement, verify total updates
- Filter by department, verify correct employees shown
- Filter by year, verify correct balances shown

## Test case pack
1) Initialize year with carryover
   - Input: Year 2026, carryover enabled
   - Expected: Balances created for all active employees, carryover_from_previous populated from 2025
2) Create manual balance
   - Input: Employee "Max Mustermann", year 2026, base_entitlement=30, manual_adjustment=2
   - Expected: Balance created, total_entitlement=32
3) Duplicate balance
   - Input: Create balance for employee/year that already exists
   - Expected: 409 error: "Balance already exists for this employee and year"
4) Edit carryover
   - Input: Set carryover_to_next=5, carryover_expires_at=2027-03-31
   - Expected: Carryover values saved, displayed in detail sheet
5) Remaining days color
   - Input: Balance with remaining=0.5
   - Expected: Yellow badge shown for remaining days

## Dependencies
- ZMI-TICKET-014 (Vacation Entitlement Calculation backend)
- ZMI-TICKET-015 (Vacation Carryover Capping backend)
- Employees API (for employee selector)
- Departments API (for filter dropdown)
