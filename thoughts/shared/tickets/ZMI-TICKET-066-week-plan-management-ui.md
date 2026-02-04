# ZMI-TICKET-066: Week Plan Management UI

Status: Proposed
Priority: P1
Owner: TBD
Backend tickets: ZMI-TICKET-005

## Goal
Provide a full CRUD admin page for managing week plans (Wochenpläne), allowing admins to define reusable weekly schedule templates by assigning day plans to each weekday (Monday–Sunday). Week plans are the building blocks for tariff-based schedule rotation and are required before configuring rolling weekly or X-day rhythm tariffs.

## Scope
- In scope: Week plan list page, create/edit form with weekday-to-day-plan mapping, detail view with visual weekly schedule, delete with confirmation, copy functionality, active/inactive filter.
- Out of scope: Tariff rhythm configuration (covered by ZMI-TICKET-018), employee day plan assignment (covered by ZMI-TICKET-042), day plan CRUD (separate existing page), rolling week plan sequence ordering (configured on tariff, not on week plan itself).

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/week-plans/page.tsx`
  - Route: `/admin/week-plans`
  - Sidebar entry already exists in "Management" section with `CalendarRange` icon
  - Breadcrumb segment already mapped: `'week-plans': 'weekPlans'`

### Components
- `apps/web/src/components/week-plans/week-plan-data-table.tsx`
  - Columns: Code, Name, Work Days (count of assigned days, e.g. "5/7"), Schedule Preview (compact Mon–Sun bar), Active (badge), Actions
  - Schedule Preview column: 7 small cells representing Mon–Sun, filled cells show day plan code abbreviation (first 3 chars), empty cells show "—" in muted style. Color-coded: filled=primary, empty=muted
  - Row click opens detail sheet
  - Actions dropdown: View Details, Edit, Copy, Delete
  - Sortable by code and name
- `apps/web/src/components/week-plans/week-plan-form-sheet.tsx`
  - Sheet form for create/edit
  - Fields:
    - Code (text input, required, max 20, unique, disabled on edit)
    - Name (text input, required, max 255)
    - Description (textarea, optional)
    - Active (switch, default true, edit only)
  - **Weekday assignment section** — the core of the form:
    - 7 rows, one per weekday (Monday through Sunday), each row contains:
      - Weekday label (localized, e.g. "Monday" / "Montag")
      - Day plan selector (searchable combobox using `useDayPlans({ active: true })`)
      - Selected day plan summary shown inline: code, target hours, time window (e.g. "STD-8H · 8:00h · 07:00–16:00")
      - Clear button to unassign a day (sets to off day)
    - "Apply to all weekdays" quick action: select a day plan and apply it to Mon–Fri (common use case for standard schedules)
    - "Apply to workdays" quick action: select a day plan and apply it to Mon–Fri, leaving Sat/Sun empty
    - Visual indicator showing total work days count: "{N}/7 days assigned"
  - **Completeness validation**: Backend requires all 7 days to have day plans assigned (ZMI manual Section 11.2). Show inline warning if any day is unassigned: "All 7 weekdays must have a day plan assigned. Use a zero-hours day plan for off days."
  - On 409 "Code already exists": show inline error on code field
  - On 400 "week plan incomplete": show inline error highlighting unassigned days
  - On 400 "invalid day plan": show inline error on affected weekday row
  - Uses POST `/week-plans` for create, PUT `/week-plans/{id}` for edit
- `apps/web/src/components/week-plans/week-plan-detail-sheet.tsx`
  - Header: name, code (mono), active badge
  - Description if present
  - **Weekly schedule visualization**:
    - 7-row card layout, one per weekday
    - Each row shows: weekday name, day plan code + name, target hours, time window (come_from–go_to)
    - Off days (null day plan) shown as "Off" in muted style with dashed border
    - Summary footer: "X work days · Y total target hours per week"
  - Timestamps: created_at, updated_at
  - Actions: Edit, Copy, Delete
- `apps/web/src/components/week-plans/week-plan-delete-dialog.tsx`
  - Confirmation: "Delete week plan '{name}' ({code})?"
  - Warning: "If this week plan is assigned to tariffs, deletion may fail. Consider deactivating instead."
  - Uses DELETE `/week-plans/{id}`
- `apps/web/src/components/week-plans/copy-week-plan-dialog.tsx`
  - Dialog for copying a week plan with new code and name
  - Fields:
    - New Code (text input, required, max 20, pre-filled with "{original_code}-COPY")
    - New Name (text input, required, pre-filled with "{original_name} (Copy)")
  - On submit: creates a new week plan via POST `/week-plans` with the same day plan assignments as the source
  - On 409 "Code already exists": show inline error
- `apps/web/src/components/week-plans/week-plan-skeleton.tsx`
  - Skeleton matching page layout during loading: header, filters bar, table with 5 rows
- `apps/web/src/components/week-plans/index.ts`
  - Barrel exports for all components

### API hooks
- `apps/web/src/hooks/api/use-week-plans.ts` (already exists, extend with copy helper)
  - `useWeekPlans(params?)` — GET `/week-plans` with query param: `active` *(exists)*
  - `useWeekPlan(id)` — GET `/week-plans/{id}` with day plan relations *(exists)*
  - `useCreateWeekPlan()` — POST `/week-plans`, body: `CreateWeekPlanRequest`, invalidates `[['/week-plans']]` *(exists)*
  - `useUpdateWeekPlan()` — PUT `/week-plans/{id}`, body: `UpdateWeekPlanRequest`, invalidates `[['/week-plans']]` *(exists)*
  - `useDeleteWeekPlan()` — DELETE `/week-plans/{id}`, invalidates `[['/week-plans']]` *(exists)*
  - No additional hooks needed; copy is implemented client-side by reading the source week plan and posting a create with the same day plan IDs

### UI behavior
- Page follows the standard CRUD pattern established by the day plans page
- Active filter toggle (show all / active only / inactive only)
- Search: client-side text filter on code and name fields
- Schedule Preview in table: compact 7-cell horizontal bar showing Mon–Sun at a glance; cells are ~24px wide squares with 2-3 char day plan codes, off days shown as empty with muted background
- Form weekday section: day plan selectors load active day plans; when a day plan is selected, its summary (code, hours, time window) is shown inline so the admin can verify without leaving the form
- "Apply to workdays" shortcut: fills Mon–Fri with selected day plan, leaves Sat–Sun unchanged; confirm dialog if any weekday already has a different plan assigned ("Overwrite existing assignments for Mon–Fri?")
- Copy: reads source week plan details, opens create dialog pre-filled with day plan IDs and new code/name
- Delete with tariff reference: if backend returns 500/409 due to foreign key constraint, show message "Cannot delete: this week plan is referenced by one or more tariffs. Deactivate it instead."
- Empty state: "No week plans configured. Create your first week plan to define weekly schedule templates."
- Detail sheet total hours calculation: sum of `regular_hours` from each assigned day plan, displayed as "X:XXh per week"

### Navigation & translations
- Sidebar entry already configured: `{ titleKey: 'weekPlans', href: '/admin/week-plans', icon: CalendarRange, roles: ['admin'] }`
- Breadcrumb segment already mapped: `'week-plans': 'weekPlans'`
- Translation namespace: `adminWeekPlans`
  - Key groups:
    - `page.*` — title, subtitle, newWeekPlan, searchPlaceholder
    - `table.*` — column headers (code, name, workDays, schedule, status), schedule preview labels
    - `form.*` — field labels, weekday names, day plan selector placeholder, apply-to-workdays button, completeness warning, validation messages
    - `detail.*` — section headers, weekday labels, off day label, total hours label, timestamps
    - `delete.*` — confirmation title, description with name/code interpolation, tariff warning
    - `copy.*` — dialog title, description, new code/name labels, submit button
    - `empty.*` — empty state title, description, create button
    - `errors.*` — code exists, incomplete plan, invalid day plan
  - German translations use: "Wochenpläne" (title), "Wochenplan" (singular), weekday names (Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag, Sonntag)

## Acceptance criteria
- Admin can list all week plans with a compact schedule preview in the table
- Admin can create a new week plan by assigning day plans to each of the 7 weekdays
- Admin can edit an existing week plan's name, description, day plan assignments, and active status
- Admin can copy a week plan with a new code and name, preserving all day plan assignments
- Admin can delete a week plan (with warning about tariff references)
- Form enforces completeness: all 7 days must have a day plan assigned (backend requirement)
- "Apply to workdays" shortcut correctly fills Mon–Fri
- Detail sheet shows the full weekly schedule with day plan names, target hours, and time windows
- Detail sheet shows total target hours per week
- Active filter works correctly
- Code uniqueness enforced with clear inline error
- Non-admin users cannot access the page

## Tests

### Component tests
- Data table renders correct number of rows with schedule preview cells
- Schedule preview shows filled cells for assigned days and empty cells for off days
- Form validates code and name required
- Form shows completeness warning when fewer than 7 days are assigned
- Form "Apply to workdays" fills Mon–Fri and preserves Sat–Sun
- Form day plan selector shows active day plans with summary info
- 409 duplicate code shows inline error on code field
- Detail sheet calculates and displays correct total weekly hours
- Detail sheet shows "Off" for unassigned weekdays
- Delete dialog shows tariff reference warning
- Copy dialog pre-fills code and name from source

### Integration tests
- Create week plan with all 7 days assigned, verify in list with correct schedule preview
- Edit week plan: change Wednesday's day plan, verify update reflected in detail sheet
- Copy week plan, verify new plan has same day plan assignments but different code
- Delete week plan not referenced by tariffs, verify removed from list
- Attempt to delete week plan referenced by tariff, verify error message shown
- Filter by active status, verify correct plans shown
- Search by code, verify filtered results

## Test case pack
1) Create standard 5-day week plan
   - Input: Code "STD-5D", name "Standard 5-Day Week", assign "Standard 8h" day plan to Mon–Fri via "Apply to workdays", assign "Off Day" plan to Sat–Sun
   - Expected: Week plan created, table shows "5/7" work days, schedule preview shows 5 filled + 2 empty cells
2) Create 7-day week plan
   - Input: Code "SHIFT-7D", name "7-Day Shift", assign day plans to all 7 days
   - Expected: Week plan created, table shows "7/7" work days
3) Incomplete week plan validation
   - Input: Try to create with only Mon–Fri assigned, Sat/Sun empty (no day plan)
   - Expected: Backend returns 400 "week plan incomplete", form shows error highlighting Sat/Sun rows
4) Duplicate code
   - Input: Create week plan with code "STD-5D" that already exists
   - Expected: 409 error, inline error on code field: "Code already exists"
5) Edit day plan assignment
   - Input: Edit existing week plan, change Thursday from "Standard 8h" to "Short Friday 6h"
   - Expected: Thursday updated, detail sheet shows new day plan and recalculated weekly total
6) Copy week plan
   - Input: Copy "STD-5D", new code "STD-5D-V2", new name "Standard 5-Day Week V2"
   - Expected: New week plan created with identical day plan assignments, appears in list
7) Delete week plan with tariff reference
   - Input: Delete week plan that is assigned to a tariff
   - Expected: Error message: "Cannot delete: this week plan is referenced by one or more tariffs. Deactivate it instead."
8) Detail sheet total hours
   - Input: View detail of week plan with 5× 8h days + 2× 0h days
   - Expected: Shows "40:00h per week" in summary footer
9) Apply to workdays with existing assignments
   - Input: Week plan has different plans on Mon and Tue, click "Apply to workdays" with a new day plan
   - Expected: Confirmation dialog: "Overwrite existing assignments for Mon–Fri?", after confirm all 5 days updated

## Dependencies
- ZMI-TICKET-005 (Time Plan Framework backend — week plan API fully implemented)
- Day Plans list API (for day plan selector dropdowns in form)
- Existing hooks in `use-week-plans.ts` (all CRUD hooks already implemented)
- Existing sidebar and breadcrumb configuration (already in place)
