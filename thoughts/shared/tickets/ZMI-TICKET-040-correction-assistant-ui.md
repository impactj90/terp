# ZMI-TICKET-040: Correction Assistant UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-012

## Goal
Provide an admin page for the correction assistant that displays daily calculation errors/hints with filtering, plus a message catalog management tab for customizing error messages.

## Scope
- In scope: Correction assistant list view with filters, correction message catalog management, detail sheet for correction items, inline message override editing.
- Out of scope: Creating/approving corrections (covered by existing corrections UI), recalculation triggers.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`
  - Two-tab layout: "Corrections" (default) and "Message Catalog"
  - Route: `/admin/correction-assistant`

### Components
- `apps/web/src/components/correction-assistant/correction-assistant-data-table.tsx`
  - Columns: Employee Name, Department, Date, Error Code, Severity (badge), Message
  - Row click opens detail sheet
  - Severity badge: `error` = destructive variant, `hint` = secondary variant
- `apps/web/src/components/correction-assistant/correction-assistant-detail-sheet.tsx`
  - Shows employee info, date, all errors for that employee-date
  - Each error displays: code, severity badge, resolved message, error_type
  - Action buttons: "Go to Employee" (navigates to employee detail), "Create Correction" (opens correction form)
- `apps/web/src/components/correction-assistant/correction-assistant-filters.tsx`
  - Date range picker (from/to, defaults: first of previous month to last of current month)
  - Department select (useDepartments hook)
  - Severity select (error | hint | all)
  - Error code text input
  - Employee search input
  - Clear filters button
- `apps/web/src/components/correction-assistant/correction-message-data-table.tsx`
  - Columns: Code, Default Text, Custom Text (editable), Severity (badge), Active (switch)
  - Inline editing: click custom_text cell to edit, blur/enter to save
  - Active toggle switch triggers PATCH immediately
- `apps/web/src/components/correction-assistant/correction-message-edit-dialog.tsx`
  - Dialog for editing a correction message's custom_text, severity, and is_active
  - "Reset to Default" button sets custom_text to null
- `apps/web/src/components/correction-assistant/correction-assistant-skeleton.tsx`
  - Loading skeleton matching the two-tab layout

### API hooks
- `apps/web/src/hooks/api/use-correction-assistant.ts`
  - `useCorrectionAssistantItems(params?)` — GET `/correction-assistant` with query params: `from`, `to`, `employee_id`, `department_id`, `severity`, `error_code`, `limit`, `offset`
  - `useCorrectionMessages(params?)` — GET `/correction-messages` with query params: `severity`, `is_active`, `code`
  - `useCorrectionMessage(id)` — GET `/correction-messages/{id}`
  - `useUpdateCorrectionMessage()` — PATCH `/correction-messages/{id}`, body: `{ custom_text?, severity?, is_active? }`, invalidates `[['/correction-messages']]`

### UI behavior
- Default date range: first day of previous month to last day of current month (matching API default)
- Pagination: limit/offset based (API supports limit 1–200, default 50)
- Correction assistant list shows flattened rows: one row per error per employee-date (expand CorrectionAssistantItem.errors into individual rows)
- Message catalog tab: inline editing with optimistic updates; on PATCH failure, revert and show error toast
- Active toggle on messages takes effect immediately (no save button)
- "Reset to Default" in edit dialog sends `{ custom_text: null }` to clear override
- Severity filter on catalog tab filters client-side for responsiveness (full list is typically <100 entries)
- Empty state when no correction items found: "No errors or hints found for the selected period"

### Navigation & translations
- Sidebar entry in "Management" section: `{ titleKey: 'nav.correction-assistant', href: '/admin/correction-assistant', icon: AlertTriangle, roles: ['admin'] }`
- Breadcrumb segment: `'correction-assistant': 'correction-assistant'` in segmentToKey mapping
- Translation namespace: `correction-assistant`
  - Key groups: `page.*` (title, description, tabs), `table.*` (column headers), `filters.*`, `detail.*`, `messages.*` (catalog tab), `empty.*`, `actions.*`

## Acceptance criteria
- Admin can view correction assistant items with date range, department, severity, and error code filters
- Admin can switch between correction list and message catalog tabs
- Admin can edit custom_text for any correction message (inline or via dialog)
- Admin can toggle message active status
- Admin can reset custom_text to default
- Pagination works correctly with limit/offset
- Non-admin users cannot access the page (role guard)

## Tests

### Component tests
- Correction assistant data table renders rows with correct severity badges
- Filters update query parameters and trigger refetch
- Message catalog inline edit saves on blur and shows optimistic update
- Active toggle sends PATCH request
- Reset to default sends null custom_text
- Detail sheet displays all errors for an employee-date

### Integration tests
- Full page load with default date range shows correction items
- Changing date range filter updates the list
- Editing a message custom_text persists after page refresh
- Toggling message active status persists
- Tab switching preserves filter state within each tab

## Test case pack
1) Default date range loads items
   - Input: Navigate to correction assistant page
   - Expected: Items from previous month start to current month end displayed
2) Filter by severity
   - Input: Select "error" in severity filter
   - Expected: Only error-severity items shown, hint items hidden
3) Edit custom message text
   - Input: Click custom_text cell for MISSING_COME, type "Please add arrival booking", press Enter
   - Expected: PATCH sent with custom_text, effective_text updates in table
4) Reset custom text to default
   - Input: Open edit dialog for message with custom_text, click "Reset to Default"
   - Expected: PATCH sent with custom_text: null, effective_text reverts to default_text
5) Toggle message active
   - Input: Click active switch for a message
   - Expected: PATCH sent with is_active toggled, switch reflects new state
6) Detail sheet navigation
   - Input: Click a correction item row
   - Expected: Detail sheet opens showing employee name, date, all errors with codes and messages

## Dependencies
- ZMI-TICKET-012 (Correction Assistant backend)
- Departments API (for filter dropdown)
- Employees API (for navigation to employee detail)
