# ZMI-TICKET-041: Employee Tariff Assignment UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-018

## Goal
Provide a tariff assignment management interface embedded within the employee detail page, allowing admins to view, create, edit, and delete tariff assignments with effective date ranges, plus preview the effective tariff for any date.

## Scope
- In scope: Tariff assignment list within employee detail, create/edit form with tariff selector and date range, delete confirmation, effective tariff preview.
- Out of scope: Tariff CRUD (separate existing page), employee creation, bulk tariff assignment across employees.

## Requirements

### Pages & routes
- **Embedded section** within existing employee detail page at `apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`
  - New tab or collapsible section: "Tariff Assignments"
  - No separate route — uses employee detail route `/admin/employees/{id}`

### Components
- `apps/web/src/components/employees/tariff-assignments/tariff-assignment-list.tsx`
  - Timeline-style list of assignments ordered by effective_from descending
  - Each item shows: tariff name (code), effective_from → effective_to (or "Open-ended"), overwrite_behavior badge, active status badge
  - Current/active assignment highlighted with accent border
  - "Add Assignment" button at top
  - Row actions: Edit, Delete
- `apps/web/src/components/employees/tariff-assignments/tariff-assignment-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Tariff selector (dropdown using useTariffs hook, shows code + name)
    - Effective From (date picker, required)
    - Effective To (date picker, optional — null = open-ended)
    - Overwrite Behavior (select: "overwrite" | "preserve_manual", default "preserve_manual")
    - Notes (textarea, optional)
  - Validation: effective_from required, effective_to must be >= effective_from if set
  - On 409 conflict (overlapping assignment): show inline error "Date range overlaps with an existing assignment"
- `apps/web/src/components/employees/tariff-assignments/effective-tariff-preview.tsx`
  - Small card/section showing the effective tariff for a selected date
  - Date picker input (defaults to today)
  - Displays: tariff name, source (badge: "assignment" | "default" | "none"), date range if from assignment
  - Uses GET `/employees/{id}/effective-tariff?date=YYYY-MM-DD`
- `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx`
  - Confirmation dialog: "Delete tariff assignment for {tariff_name} ({effective_from} – {effective_to})?"

### API hooks
- `apps/web/src/hooks/api/use-employee-tariff-assignments.ts`
  - `useEmployeeTariffAssignments(employeeId, params?)` — GET `/employees/{id}/tariff-assignments` with query param: `active`
  - `useEmployeeTariffAssignment(employeeId, assignmentId)` — GET `/employees/{id}/tariff-assignments/{assignmentId}`
  - `useCreateEmployeeTariffAssignment(employeeId)` — POST `/employees/{id}/tariff-assignments`, body: `{ tariff_id, effective_from, effective_to?, overwrite_behavior?, notes? }`, invalidates `[['/employees/{id}/tariff-assignments']]`
  - `useUpdateEmployeeTariffAssignment(employeeId)` — PUT `/employees/{id}/tariff-assignments/{assignmentId}`, body: `{ effective_from?, effective_to?, overwrite_behavior?, notes?, is_active? }`, invalidates `[['/employees/{id}/tariff-assignments']]`
  - `useDeleteEmployeeTariffAssignment(employeeId)` — DELETE `/employees/{id}/tariff-assignments/{assignmentId}`, invalidates `[['/employees/{id}/tariff-assignments']]`
  - `useEffectiveTariff(employeeId, date)` — GET `/employees/{id}/effective-tariff?date={date}`

### UI behavior
- Timeline display: assignments shown as a vertical timeline with date markers
- Current assignment (where today falls between effective_from and effective_to or effective_to is null) gets visual highlight
- Effective tariff preview updates automatically when date picker changes (debounced 300ms)
- 409 conflict error on create/update: display "Overlapping assignment exists" inline in the form
- Active/inactive filter toggle at top of assignment list
- Empty state: "No tariff assignments. This employee uses the default tariff." with link to effective tariff preview

### Navigation & translations
- No new sidebar entry (embedded in employee detail)
- Tab label within employee detail: translation key `employees.tabs.tariff-assignments`
- Translation namespace: `employee-tariff-assignments`
  - Key groups: `list.*`, `form.*`, `preview.*`, `delete.*`, `empty.*`, `errors.*`

## Acceptance criteria
- Admin can view all tariff assignments for an employee as a timeline
- Admin can create a new tariff assignment with tariff, dates, and overwrite behavior
- Admin can edit an existing assignment's dates, overwrite behavior, and notes
- Admin can delete an assignment with confirmation
- Overlapping date range shows clear 409 error message
- Effective tariff preview correctly shows the resolved tariff for any date
- Source badge correctly distinguishes "assignment" vs "default" vs "none"

## Tests

### Component tests
- Assignment list renders timeline with correct ordering and highlight on current
- Form validates effective_from is required and effective_to >= effective_from
- 409 error displays inline overlap message
- Effective tariff preview shows correct source badge
- Delete dialog shows assignment details in confirmation

### Integration tests
- Create assignment, verify it appears in list
- Edit assignment dates, verify timeline updates
- Delete assignment, verify it's removed from list
- Effective tariff preview changes when assignment dates are modified
- Filter by active/inactive shows correct assignments

## Test case pack
1) Create tariff assignment
   - Input: Select tariff "TARIFF-001", set effective_from to 2026-01-01, leave effective_to empty
   - Expected: Assignment created, appears at top of timeline as "Open-ended"
2) Overlapping assignment
   - Input: Create assignment for 2026-01-01 to 2026-06-30, then create another for 2026-03-01
   - Expected: 409 error, form shows "Overlapping assignment exists"
3) Effective tariff preview
   - Input: Set preview date to 2026-03-15, with assignment covering that date
   - Expected: Shows tariff name, source="assignment", date range displayed
4) No tariff assigned
   - Input: Set preview date outside any assignment range, employee has no default tariff
   - Expected: Source="none", message "No tariff assigned for this date"
5) Delete assignment
   - Input: Click delete on an assignment, confirm
   - Expected: Assignment removed from list, effective tariff preview updates

## Dependencies
- ZMI-TICKET-018 (Tariff backend)
- ZMI-TICKET-004 (Employee detail page — must exist)
- Tariffs list API (for tariff selector dropdown)
