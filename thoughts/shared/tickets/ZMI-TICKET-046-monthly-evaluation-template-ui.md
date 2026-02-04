# ZMI-TICKET-046: Monthly Evaluation Template UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-016

## Goal
Provide a CRUD page for monthly evaluation templates with the ability to set one template as the tenant default, including configuration of flextime caps, overtime thresholds, and vacation carryover limits.

## Scope
- In scope: Template list with default badge, create/edit form, set-default action, delete with protection for default template.
- Out of scope: Monthly value calculation (ZMI-TICKET-043), account column configuration (future enhancement), per-employee template assignment.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/monthly-evaluations/page.tsx`
  - Route: `/admin/monthly-evaluations`

### Components
- `apps/web/src/components/monthly-evaluations/monthly-evaluation-data-table.tsx`
  - Columns: Name, Description, Flextime Cap (+), Flextime Cap (−), Overtime Threshold, Max Vacation Carryover, Default (star icon/badge), Active (badge), Actions
  - Default template row highlighted with star icon and subtle background
  - Flextime caps and threshold displayed in hours:minutes format (stored as minutes in API)
  - Actions dropdown: Edit, Set as Default, Delete
  - "Set as Default" only shown for non-default active templates
- `apps/web/src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Name (text input, required, max 100)
    - Description (textarea, optional)
    - Flextime Cap Positive (number input, in minutes, min 0, optional — displays as hours:minutes)
    - Flextime Cap Negative (number input, in minutes, min 0, optional — displays as hours:minutes)
    - Overtime Threshold (number input, in minutes, min 0, optional — displays as hours:minutes)
    - Max Vacation Carryover (decimal number, min 0, optional — in days)
    - Is Default (switch, default false)
    - Is Active (switch, default true)
  - Input helper: show both minutes value and formatted hours:minutes next to number inputs
  - If is_default set to true, warn: "Setting this as default will unset the current default template"
- `apps/web/src/components/monthly-evaluations/monthly-evaluation-detail-sheet.tsx`
  - Shows full template details
  - All numeric values shown in both raw (minutes/days) and formatted display
  - Default badge prominently displayed
  - Actions: Edit, Set as Default, Delete
- `apps/web/src/components/monthly-evaluations/monthly-evaluation-delete-dialog.tsx`
  - Confirmation dialog
  - If template is default: show error "Cannot delete the default evaluation template. Set another template as default first."
  - If template is not default: standard confirmation
- `apps/web/src/components/monthly-evaluations/monthly-evaluation-skeleton.tsx`

### API hooks
- `apps/web/src/hooks/api/use-monthly-evaluations.ts`
  - `useMonthlyEvaluations(params?)` — GET `/monthly-evaluations` with query params: `is_active`, `limit`, `cursor`
  - `useMonthlyEvaluation(id)` — GET `/monthly-evaluations/{id}`
  - `useDefaultMonthlyEvaluation()` — GET `/monthly-evaluations/default`
  - `useCreateMonthlyEvaluation()` — POST `/monthly-evaluations`, body: `{ name, description?, flextime_cap_positive?, flextime_cap_negative?, overtime_threshold?, max_carryover_vacation?, is_default?, is_active? }`, invalidates `[['/monthly-evaluations']]`
  - `useUpdateMonthlyEvaluation()` — PUT `/monthly-evaluations/{id}`, invalidates `[['/monthly-evaluations']]`
  - `useDeleteMonthlyEvaluation()` — DELETE `/monthly-evaluations/{id}`, invalidates `[['/monthly-evaluations']]`
  - `useSetDefaultMonthlyEvaluation()` — POST `/monthly-evaluations/{id}/set-default`, invalidates `[['/monthly-evaluations']]`

### UI behavior
- Default template: always one default; setting a new default automatically unsets the previous one (handled server-side)
- Delete protection: 409 when trying to delete the default template; show error message in dialog
- Minutes-to-hours display: all flextime/overtime values stored as minutes, displayed as "Xh Ym" (e.g., 600 → "10h 0m")
- Active filter toggle at top of table
- Empty state: "No evaluation templates configured. Create your first template to define monthly evaluation rules."
- Table sort: default template always shown first, then sorted by name
- Set-default action: confirmation dialog "Set '{name}' as the default evaluation template?"

### Navigation & translations
- Sidebar entry in "Administration" section: `{ titleKey: 'nav.monthly-evaluations', href: '/admin/monthly-evaluations', icon: ClipboardCheck, roles: ['admin'] }`
- Breadcrumb segment: `'monthly-evaluations': 'monthly-evaluations'` in segmentToKey mapping
- Translation namespace: `monthly-evaluations`
  - Key groups: `page.*`, `table.*`, `form.*`, `detail.*`, `delete.*`, `set-default.*`, `empty.*`

## Acceptance criteria
- Admin can list all evaluation templates with default highlighted
- Admin can create a new template with all configuration fields
- Admin can edit an existing template
- Admin can set a template as default
- Admin cannot delete the default template (409 with clear message)
- Flextime/overtime values displayed in human-readable hours:minutes format
- Active filter works correctly
- Non-admin users cannot access the page

## Tests

### Component tests
- Data table highlights default template row
- Form validates required fields (name)
- Minutes-to-hours formatting displays correctly
- Set-default action sends correct API call
- Delete dialog blocks deletion of default template

### Integration tests
- Create template, verify it appears in list
- Set template as default, verify previous default is unset
- Edit template values, verify update persists
- Attempt to delete default template, verify 409 handling
- Filter by active status

## Test case pack
1) Create evaluation template
   - Input: Name "Standard", flextime_cap_positive=600, overtime_threshold=60
   - Expected: Template created, values shown as "10h 0m" and "1h 0m"
2) Set as default
   - Input: Click "Set as Default" on non-default template
   - Expected: Template becomes default, previous default loses star badge
3) Delete default template
   - Input: Attempt to delete the default template
   - Expected: 409 error shown: "Cannot delete the default evaluation template"
4) Edit template
   - Input: Change flextime_cap_negative from 300 to 600
   - Expected: Update saved, table shows "10h 0m" for negative cap
5) Active filter
   - Input: Toggle active filter to show inactive
   - Expected: Inactive templates shown in table with inactive badge

## Dependencies
- ZMI-TICKET-016 (Monthly Evaluation and Closing backend)
