# ZMI-TICKET-060: Shift Planning UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-031

## Goal
Provide shifts CRUD management plus a visual calendar/board view for shift assignments to employees.

## Scope
- In scope: Shifts CRUD, shift assignments CRUD, calendar/board view for visual planning.
- Out of scope: Shift pattern generation, automatic scheduling optimization, shift swap requests.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/shift-planning/page.tsx`
  - Route: `/admin/shift-planning`
  - Two tabs: "Shifts" (CRUD list) and "Planning Board" (visual calendar)

### Components
- `apps/web/src/components/shift-planning/shift-data-table.tsx`
  - Columns: Name, Code, Day Plan, Color (swatch), Qualification, Active, Actions
  - Color column: small color swatch circle
- `apps/web/src/components/shift-planning/shift-form-sheet.tsx`
  - Fields: name, code (unique), day_plan_id (select from useDayPlans), color (color picker), qualification (text), description, active
- `apps/web/src/components/shift-planning/shift-planning-board.tsx`
  - Calendar-style board: rows = employees, columns = dates (week view)
  - Each cell shows assigned shift with color indicator and shift name
  - Drag-and-drop: drag shift from palette to cell to create assignment
  - Click cell to edit/remove assignment
- `apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`
  - Fields: employee_id (select), shift_id (select), valid_from (date), valid_to (date, optional), notes
- `apps/web/src/components/shift-planning/shift-palette.tsx`
  - Sidebar palette of available shifts with color swatches for drag-and-drop

### API hooks
- `apps/web/src/hooks/api/use-shift-planning.ts`
  - Shifts: `useShifts()`, `useCreateShift()`, `useUpdateShift()`, `useDeleteShift()`
  - Assignments: `useShiftAssignments(params)`, `useCreateShiftAssignment()`, `useUpdateShiftAssignment()`, `useDeleteShiftAssignment()`

### UI behavior
- Board view: week navigation, department filter, color-coded shift cells
- Drag-and-drop assignment creation from shift palette
- Click existing assignment to edit dates or remove

### Navigation & translations
- Sidebar entry: `{ titleKey: 'nav.shift-planning', href: '/admin/shift-planning', icon: CalendarClock, roles: ['admin'] }`
- Translation namespace: `shift-planning`

## Acceptance criteria
- Admin can CRUD shifts with color and day plan association
- Admin can assign shifts to employees via board view
- Board displays week view with color-coded shifts
- Drag-and-drop creates new assignments

## Tests

### Component tests
- Shift table renders color swatches
- Board renders employee rows and date columns
- Assignment form validates date ranges

### Integration tests
- Create shift, assign to employee on board, verify display

## Test case pack
1) Create shift
   - Input: Name "Early", code "EARLY", color "#3B82F6", day plan "Standard 8h"
   - Expected: Shift created with blue color swatch
2) Assign shift via board
   - Input: Drag "Early" shift to Employee A / Monday cell
   - Expected: Assignment created, cell shows blue "Early" indicator
3) Edit assignment
   - Input: Click assignment, change valid_to
   - Expected: Assignment date range updated

## Dependencies
- ZMI-TICKET-031 (Plantafel Shift Planning backend)
- Day Plans API (for shift day plan selector)
- Employees API (for board rows)
