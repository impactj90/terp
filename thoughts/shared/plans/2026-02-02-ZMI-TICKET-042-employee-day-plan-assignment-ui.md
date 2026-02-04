# Employee Day Plan Assignment UI Implementation Plan

## Overview

Implement a calendar-grid admin page at `/admin/employee-day-plans` that lets administrators view and manage day plan assignments for employees. The grid shows employees as rows and dates as columns, with cells color-coded by source (tariff/manual/holiday). Supports single-cell editing via popover, bulk assignment via dialog, and range deletion via dialog.

## Current State Analysis

- **Backend API**: All endpoints exist and are defined in `api/paths/employee-day-plans.yaml`. Generated TypeScript types are already available in `apps/web/src/lib/api/types.ts`.
- **Frontend hooks**: No hooks exist for employee-day-plans. A new file `use-employee-day-plans.ts` is needed.
- **Components**: No employee-day-plans components exist. A new component directory `apps/web/src/components/employee-day-plans/` is needed.
- **Page**: No page exists at `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/`.
- **Supporting hooks**: `useEmployees`, `useDayPlans`, `useDepartments` all exist and can be reused.
- **UI primitives**: All needed components exist: `Popover`, `Dialog`, `ConfirmDialog`, `DateRangePicker`, `SearchInput`, `Select`, `Badge`, `Skeleton`, `Table`, `Card`.
- **Time utilities**: `getWeekRange`, `getMonthRange`, `getMonthDates`, `formatDate`, `formatDisplayDate`, `parseISODate`, `isWeekend`, `isToday` all exist in `apps/web/src/lib/time-utils.ts`.

### Key Discoveries:
- API paths use both `/employee-day-plans` (collection) and `/employees/{employee_id}/day-plans` (nested) patterns -- hooks need both.
- The `useApiQuery` hook at `apps/web/src/hooks/use-api-query.ts` derives query keys as `[path, params, pathParams]` automatically.
- The `useApiMutation` hook at `apps/web/src/hooks/use-api-mutation.ts` accepts `invalidateKeys` arrays for cache invalidation on success.
- Mutation hooks are called as `.mutate({ body: {...}, path: {...} })` -- the `path` field provides path parameters.
- The team-overview page (`apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx`) has the closest pattern for date-range-driven grid data fetching.
- The holiday-year-calendar (`apps/web/src/components/holidays/holiday-year-calendar.tsx`) has the closest pattern for date-based cell rendering with color coding.
- The day-plans admin page (`apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx`) is the reference for standard admin page structure.
- Translation namespace convention: flat camelCase key like `employeeDayPlans` with nested sub-keys. Accessed via `useTranslations('employeeDayPlans')`.
- Sidebar nav config at `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` uses `titleKey` that maps to `nav` namespace.
- Breadcrumbs at `apps/web/src/components/layout/breadcrumbs.tsx` use `segmentToKey` mapping plus `breadcrumbs` namespace.

## Desired End State

After implementation:
1. Admin users see "Employee Day Plans" in the sidebar management section
2. Navigating to `/admin/employee-day-plans` shows a calendar grid (default: current week)
3. Grid rows = employees (filtered by department), columns = dates in selected range
4. Each cell shows day plan code and source badge (color-coded: tariff=blue, manual=green, holiday=orange)
5. Clicking a cell opens a popover to edit/assign/remove a day plan
6. "Bulk Assign" button opens a dialog to assign a day plan to multiple employees over a date range
7. "Delete Range" button opens a dialog to delete all assignments for an employee in a date range
8. Week/two-week/month navigation works with prev/next arrows
9. Department filter and employee search filter the grid rows
10. Non-admin users are redirected to `/dashboard`

### How to Verify:
- Page loads at `/admin/employee-day-plans` for admin users
- Grid populates with data from the API
- Cell editing, bulk assign, and delete range all work end-to-end
- Navigation arrows shift the date range correctly
- `npm run build` passes with no type errors

## What We're NOT Doing

- Day plan CRUD (separate existing page at `/admin/day-plans`)
- Tariff-based auto-assignment logic (handled entirely by backend)
- Individual employee day plan view (covered in employee detail page)
- Virtual scrolling for large employee counts (future optimization)
- Keyboard navigation between cells (future enhancement)
- Component tests (will be addressed in a separate ticket)

## Implementation Approach

Four phases, each independently verifiable:
1. **API Hooks & Translations** -- foundation layer with no UI
2. **Grid Components** -- visual components for the calendar grid
3. **Interaction Components** -- popover and dialog components for editing
4. **Page Assembly** -- wire everything together into the page

Each phase builds on the previous one. Phase 1 has no visible UI but ensures the data layer is ready. Phases 2-3 create reusable components. Phase 4 assembles them into the final page.

---

## Phase 1: API Hooks & Translations

### Overview
Create the data-fetching hooks for employee-day-plans, add all translation keys, and wire up navigation (sidebar + breadcrumbs). This establishes the foundation that all subsequent phases depend on.

### Changes Required:

#### 1. Create API hooks file
**File**: `apps/web/src/hooks/api/use-employee-day-plans.ts` (NEW)

Create all hooks following the exact pattern from `use-employee-tariff-assignments.ts` and `use-employees.ts`:

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseEmployeeDayPlansOptions {
  employeeId?: string
  from?: string
  to?: string
  source?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employee day plans with filters.
 */
export function useEmployeeDayPlans(options: UseEmployeeDayPlansOptions = {}) {
  const { employeeId, from, to, source, limit, cursor, enabled = true } = options
  return useApiQuery('/employee-day-plans', {
    params: {
      employee_id: employeeId,
      from,
      to,
      source,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch day plans for a specific employee within a date range.
 */
export function useEmployeeDayPlansForEmployee(
  employeeId: string,
  from: string,
  to: string,
  enabled = true
) {
  return useApiQuery('/employees/{employee_id}/day-plans', {
    path: { employee_id: employeeId },
    params: { from, to },
    enabled: enabled && !!employeeId && !!from && !!to,
  })
}

/**
 * Hook to create a single employee day plan.
 */
export function useCreateEmployeeDayPlan() {
  return useApiMutation('/employee-day-plans', 'post', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to upsert a day plan for a specific employee and date.
 */
export function useUpsertEmployeeDayPlan() {
  return useApiMutation('/employees/{employee_id}/day-plans/{date}', 'put', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to bulk create/upsert employee day plans.
 */
export function useBulkCreateEmployeeDayPlans() {
  return useApiMutation('/employee-day-plans/bulk', 'post', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to delete employee day plans in a date range.
 */
export function useDeleteEmployeeDayPlanRange() {
  return useApiMutation('/employee-day-plans/delete-range', 'post', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}

/**
 * Hook to delete a single employee day plan by ID.
 */
export function useDeleteEmployeeDayPlan() {
  return useApiMutation('/employee-day-plans/{id}', 'delete', {
    invalidateKeys: [['/employee-day-plans'], ['/employees']],
  })
}
```

**Key decisions:**
- `invalidateKeys` includes both `['/employee-day-plans']` and `['/employees']` because the grid fetches from the employee-day-plans endpoint, and employee data may have related day plan info.
- The upsert hook uses the nested path `/employees/{employee_id}/day-plans/{date}` because this is the endpoint used for single-cell edits.
- The `useEmployeeDayPlans` hook is the primary query used by the grid page (fetching all employee day plans in a date range).

#### 2. Export hooks from barrel file
**File**: `apps/web/src/hooks/api/index.ts` (MODIFY)

Add at the end, before the closing of the file, following the existing grouping pattern:

```typescript
// Employee Day Plans
export {
  useEmployeeDayPlans,
  useEmployeeDayPlansForEmployee,
  useCreateEmployeeDayPlan,
  useUpsertEmployeeDayPlan,
  useBulkCreateEmployeeDayPlans,
  useDeleteEmployeeDayPlanRange,
  useDeleteEmployeeDayPlan,
} from './use-employee-day-plans'
```

#### 3. Add sidebar navigation entry
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)

Add a new import for the `CalendarClock` icon (to differentiate from `CalendarDays` used for day-plans):

In the imports, add `CalendarClock` to the lucide-react import:
```typescript
import {
  // ... existing imports ...
  CalendarClock,
} from 'lucide-react'
```

Add the nav item in the `management` section, after the `dayPlans` entry (logically grouping day-plan-related items together):

```typescript
{
  titleKey: 'employeeDayPlans',
  href: '/admin/employee-day-plans',
  icon: CalendarClock,
  roles: ['admin'],
},
```

#### 4. Add breadcrumb segment mapping
**File**: `apps/web/src/components/layout/breadcrumbs.tsx` (MODIFY)

Add to the `segmentToKey` object:

```typescript
'employee-day-plans': 'employeeDayPlans',
```

#### 5. Add English translations
**File**: `apps/web/messages/en.json` (MODIFY)

Add to the `nav` section:
```json
"employeeDayPlans": "Employee Day Plans"
```

Add to the `breadcrumbs` section:
```json
"employeeDayPlans": "Employee Day Plans"
```

Add a new top-level `employeeDayPlans` namespace:
```json
"employeeDayPlans": {
  "title": "Employee Day Plans",
  "subtitle": "Manage day plan assignments for employees across date ranges",
  "searchPlaceholder": "Search employees...",
  "allDepartments": "All departments",
  "clearFilters": "Clear filters",
  "viewWeek": "Week",
  "viewTwoWeeks": "2 Weeks",
  "viewMonth": "Month",
  "previousPeriod": "Previous period",
  "nextPeriod": "Next period",
  "today": "Today",
  "bulkAssign": "Bulk Assign",
  "deleteRange": "Delete Range",
  "emptyTitle": "No Employees Found",
  "emptySubtitle": "No employees match the selected filters",
  "emptyNoData": "No day plan assignments for this period",
  "sourceTariff": "Tariff",
  "sourceManual": "Manual",
  "sourceHoliday": "Holiday",
  "offDay": "Off Day",
  "cellEditTitle": "Edit Day Plan",
  "cellEditDayPlan": "Day Plan",
  "cellEditDayPlanPlaceholder": "Select day plan...",
  "cellEditNoDayPlan": "No day plan (off day)",
  "cellEditSource": "Source",
  "cellEditNotes": "Notes",
  "cellEditNotesPlaceholder": "Optional notes...",
  "cellEditSave": "Save",
  "cellEditRemove": "Remove",
  "cellEditCancel": "Cancel",
  "bulkAssignTitle": "Bulk Assign Day Plans",
  "bulkAssignDescription": "Assign a day plan to multiple employees over a date range",
  "bulkAssignEmployees": "Employees",
  "bulkAssignSelectEmployees": "Select employees...",
  "bulkAssignDateRange": "Date Range",
  "bulkAssignDayPlan": "Day Plan",
  "bulkAssignSelectDayPlan": "Select day plan...",
  "bulkAssignSource": "Source",
  "bulkAssignNotes": "Notes",
  "bulkAssignNotesPlaceholder": "Optional notes...",
  "bulkAssignPreview": "{count} assignments will be created/updated for {employees} employees over {days} days",
  "bulkAssignConfirm": "Assign",
  "bulkAssignSuccess": "Created: {created}, Updated: {updated}",
  "bulkAssignNoEmployees": "Please select at least one employee",
  "bulkAssignNoDateRange": "Please select a date range",
  "bulkAssignNoDayPlan": "Please select a day plan",
  "deleteRangeTitle": "Delete Day Plan Assignments",
  "deleteRangeDescription": "Delete all day plan assignments for an employee within a date range",
  "deleteRangeEmployee": "Employee",
  "deleteRangeSelectEmployee": "Select employee...",
  "deleteRangeDateRange": "Date Range",
  "deleteRangeConfirmation": "This will delete all day plan assignments for {employee} from {from} to {to}",
  "deleteRangeConfirm": "Delete",
  "deleteRangeSuccess": "Deleted: {deleted} assignments",
  "deleteRangeNoEmployee": "Please select an employee",
  "deleteRangeNoDateRange": "Please select a date range",
  "tooltipDayPlan": "Day Plan: {name}",
  "tooltipSource": "Source: {source}",
  "tooltipNotes": "Notes: {notes}"
}
```

#### 6. Add German translations
**File**: `apps/web/messages/de.json` (MODIFY)

Add to the `nav` section:
```json
"employeeDayPlans": "Mitarbeiter-Tagespläne"
```

Add to the `breadcrumbs` section:
```json
"employeeDayPlans": "Mitarbeiter-Tagespläne"
```

Add a new top-level `employeeDayPlans` namespace:
```json
"employeeDayPlans": {
  "title": "Mitarbeiter-Tagespläne",
  "subtitle": "Tagesplan-Zuweisungen für Mitarbeiter über Zeiträume verwalten",
  "searchPlaceholder": "Mitarbeiter suchen...",
  "allDepartments": "Alle Abteilungen",
  "clearFilters": "Filter zurücksetzen",
  "viewWeek": "Woche",
  "viewTwoWeeks": "2 Wochen",
  "viewMonth": "Monat",
  "previousPeriod": "Vorheriger Zeitraum",
  "nextPeriod": "Nächster Zeitraum",
  "today": "Heute",
  "bulkAssign": "Massenzuweisung",
  "deleteRange": "Zeitraum löschen",
  "emptyTitle": "Keine Mitarbeiter gefunden",
  "emptySubtitle": "Keine Mitarbeiter entsprechen den ausgewählten Filtern",
  "emptyNoData": "Keine Tagesplan-Zuweisungen für diesen Zeitraum",
  "sourceTariff": "Tarif",
  "sourceManual": "Manuell",
  "sourceHoliday": "Feiertag",
  "offDay": "Freier Tag",
  "cellEditTitle": "Tagesplan bearbeiten",
  "cellEditDayPlan": "Tagesplan",
  "cellEditDayPlanPlaceholder": "Tagesplan auswählen...",
  "cellEditNoDayPlan": "Kein Tagesplan (freier Tag)",
  "cellEditSource": "Quelle",
  "cellEditNotes": "Notizen",
  "cellEditNotesPlaceholder": "Optionale Notizen...",
  "cellEditSave": "Speichern",
  "cellEditRemove": "Entfernen",
  "cellEditCancel": "Abbrechen",
  "bulkAssignTitle": "Tagespläne zuweisen",
  "bulkAssignDescription": "Einen Tagesplan mehreren Mitarbeitern über einen Zeitraum zuweisen",
  "bulkAssignEmployees": "Mitarbeiter",
  "bulkAssignSelectEmployees": "Mitarbeiter auswählen...",
  "bulkAssignDateRange": "Zeitraum",
  "bulkAssignDayPlan": "Tagesplan",
  "bulkAssignSelectDayPlan": "Tagesplan auswählen...",
  "bulkAssignSource": "Quelle",
  "bulkAssignNotes": "Notizen",
  "bulkAssignNotesPlaceholder": "Optionale Notizen...",
  "bulkAssignPreview": "{count} Zuweisungen werden für {employees} Mitarbeiter über {days} Tage erstellt/aktualisiert",
  "bulkAssignConfirm": "Zuweisen",
  "bulkAssignSuccess": "Erstellt: {created}, Aktualisiert: {updated}",
  "bulkAssignNoEmployees": "Bitte wählen Sie mindestens einen Mitarbeiter",
  "bulkAssignNoDateRange": "Bitte wählen Sie einen Zeitraum",
  "bulkAssignNoDayPlan": "Bitte wählen Sie einen Tagesplan",
  "deleteRangeTitle": "Tagesplan-Zuweisungen löschen",
  "deleteRangeDescription": "Alle Tagesplan-Zuweisungen eines Mitarbeiters in einem Zeitraum löschen",
  "deleteRangeEmployee": "Mitarbeiter",
  "deleteRangeSelectEmployee": "Mitarbeiter auswählen...",
  "deleteRangeDateRange": "Zeitraum",
  "deleteRangeConfirmation": "Dies löscht alle Tagesplan-Zuweisungen für {employee} von {from} bis {to}",
  "deleteRangeConfirm": "Löschen",
  "deleteRangeSuccess": "Gelöscht: {deleted} Zuweisungen",
  "deleteRangeNoEmployee": "Bitte wählen Sie einen Mitarbeiter",
  "deleteRangeNoDateRange": "Bitte wählen Sie einen Zeitraum",
  "tooltipDayPlan": "Tagesplan: {name}",
  "tooltipSource": "Quelle: {source}",
  "tooltipNotes": "Notizen: {notes}"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] Hooks file exports are correct: importing all hooks from `@/hooks/api` resolves without error
- [ ] Navigation entry visible: sidebar-nav-config compiles and `CalendarClock` icon is imported
- [ ] Translation files are valid JSON: `node -e "require('./apps/web/messages/en.json')"` and same for `de.json`

#### Manual Verification:
- [ ] Sidebar shows "Employee Day Plans" entry in the Management section
- [ ] Clicking the sidebar entry navigates to `/admin/employee-day-plans` (will show empty page or 404 until Phase 4)
- [ ] Breadcrumb shows correctly when on the page path

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Grid Components

### Overview
Create the visual grid components: the individual cell, the grid skeleton, the main calendar grid, and the toolbar. These are standalone components that receive data as props.

### Changes Required:

#### 1. Day Plan Cell Component
**File**: `apps/web/src/components/employee-day-plans/day-plan-cell.tsx` (NEW)

A small component for a single grid cell. Displays the day plan code/abbreviation with a source-colored indicator.

```typescript
// Props interface:
interface DayPlanCellProps {
  dayPlan: EmployeeDayPlan | null  // null = no assignment (empty cell)
  date: Date
  isWeekend: boolean
  isToday: boolean
  onClick?: () => void
  className?: string
}
```

**Implementation approach:**
- Import `Badge` from `@/components/ui/badge` for source indicator
- Import `cn` from `@/lib/utils` for conditional classes
- Import `useTranslations` from `next-intl` with `employeeDayPlans` namespace
- Use `components['schemas']['EmployeeDayPlan']` type from generated types
- Color mapping for source badges:
  - `tariff` -> `bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`
  - `manual` -> `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`
  - `holiday` -> `bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300`
- Empty cell: light gray background (`bg-muted/30`) with dashed border
- Weekend cells: slightly muted background (`bg-muted/20`)
- Today cells: subtle ring indicator (`ring-1 ring-primary/50`)
- Cell is a `<button>` for click handling
- Tooltip on hover shows full day plan name, source, and notes (use `title` attribute for simplicity)
- Display: day plan code in primary text, source as tiny dot/indicator
- Fixed width and height to maintain grid alignment

**Reference pattern:** Follow the cell rendering approach from `apps/web/src/components/holidays/holiday-year-calendar.tsx` lines 152-170 for the button/click/cn pattern.

#### 2. Grid Skeleton Component
**File**: `apps/web/src/components/employee-day-plans/day-plan-grid-skeleton.tsx` (NEW)

Skeleton loading state that mimics the grid layout.

```typescript
interface DayPlanGridSkeletonProps {
  rows?: number     // default 8 (typical employee count)
  columns?: number  // default 7 (week view)
}
```

**Implementation approach:**
- Import `Skeleton` from `@/components/ui/skeleton`
- Render a header row of skeleton blocks (date headers)
- Render `rows` rows, each with a name skeleton (wider, left-aligned) + `columns` cell skeletons
- Use `grid` layout matching the real grid dimensions
- First column wider for employee name (~180px), subsequent columns equal width

**Reference pattern:** Follow skeleton pattern from `DayPlansPageSkeleton` in `apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx` lines 302-320.

#### 3. Grid Toolbar Component
**File**: `apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx` (NEW)

Toolbar with date navigation, view toggle, filters, and action buttons.

```typescript
interface DayPlanGridToolbarProps {
  // Date range
  rangeStart: Date
  rangeEnd: Date
  onRangeChange: (start: Date, end: Date) => void
  // View mode
  viewMode: 'week' | 'twoWeeks' | 'month'
  onViewModeChange: (mode: 'week' | 'twoWeeks' | 'month') => void
  // Filters
  search: string
  onSearchChange: (search: string) => void
  departmentId: string | undefined
  onDepartmentChange: (id: string | undefined) => void
  departments: Array<{ id: string; name: string }>
  // Actions
  onBulkAssign: () => void
  onDeleteRange: () => void
  // Loading state
  isFetching: boolean
}
```

**Implementation approach:**
- Import `SearchInput`, `Select`, `Button`, `DateRangePicker` from `@/components/ui/*`
- Import `ChevronLeft`, `ChevronRight`, `Plus`, `Trash2` from `lucide-react`
- Import time utilities: `getWeekRange`, `getMonthRange`, `formatDate`, `formatDisplayDate`
- Layout: flex-wrap row with items grouped
  - Left group: prev/next arrows + date range display + "Today" button
  - Center group: view mode toggle (segmented buttons or button group)
  - Right group: search + department filter + "Bulk Assign" button + "Delete Range" button
- Prev/next navigation:
  - Week mode: shift by 7 days
  - Two-weeks mode: shift by 14 days
  - Month mode: shift to prev/next month using `getMonthRange`
- "Today" button: reset to current week/period containing today
- View mode toggle: three inline buttons (`week` | `twoWeeks` | `month`), active state with `variant="default"`, inactive with `variant="outline"`
- Department filter: `Select` dropdown populated from `departments` prop, with "All departments" option
- Search: `SearchInput` with debounce (already handled by the component)
- Action buttons: "Bulk Assign" with `Plus` icon, "Delete Range" with `Trash2` icon (variant="outline" with destructive styling)

**Reference pattern:** Follow the filter bar approach from `apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx` lines 139-196 for layout and Select pattern. Follow the date range approach from `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx` lines 32-41 for date state management.

#### 4. Main Calendar Grid Component
**File**: `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx` (NEW)

The main grid component that renders the employee rows x date columns.

```typescript
interface DayPlanCalendarGridProps {
  // Data
  employees: Array<{ id: string; first_name: string; last_name: string; personnel_number?: string }>
  dayPlanAssignments: Array<EmployeeDayPlan>  // flat list, keyed by employee_id + plan_date
  dates: Date[]
  // Interaction
  onCellClick: (employeeId: string, date: Date, existingPlan: EmployeeDayPlan | null) => void
  // Loading
  isLoading: boolean
}
```

**Implementation approach:**
- Import `DayPlanCell` from `./day-plan-cell`
- Import `DayPlanGridSkeleton` from `./day-plan-grid-skeleton`
- Import `cn` from `@/lib/utils`
- Import `useTranslations` from `next-intl`
- Import `formatDate`, `formatDisplayDate`, `isWeekend`, `isToday` from `@/lib/time-utils`
- Import `useLocale` from `next-intl` for locale-aware date formatting
- Build a lookup map: `Map<string, EmployeeDayPlan>` keyed by `${employee_id}-${plan_date}` for O(1) cell lookup
- Use `useMemo` for the lookup map to avoid recomputing on every render
- Layout: scrollable container with CSS grid
  - `overflow-x-auto` for horizontal scrolling when many dates
  - Sticky first column (employee name) using `sticky left-0 z-10 bg-background`
  - Sticky header row (dates) using `sticky top-0 z-20 bg-background`
  - Grid template: first column ~180px, then equal-width columns for each date
- Header row:
  - First cell: empty (corner) or "Employee" label
  - Date cells: show weekday abbreviation and day number (e.g., "Mon 03") using `formatDisplayDate(date, 'weekday', locale)` + ` ${date.getDate()}`
  - Weekend date headers get muted styling
- Employee rows:
  - First cell: employee name (`last_name, first_name`) with optional personnel number
  - Date cells: render `<DayPlanCell>` for each date, looking up assignment from the map
- Empty state: if `employees.length === 0` and not loading, show centered empty message
- Loading state: show `<DayPlanGridSkeleton>` with appropriate row/column counts

**Reference pattern:** For the grid cell rendering loop, follow `apps/web/src/components/holidays/holiday-year-calendar.tsx` lines 139-175. For the table-like layout with sticky columns, use a combination of CSS grid with `sticky` positioning.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] All new component files import correctly from their dependencies
- [ ] No unused imports or variables (lint check)

#### Manual Verification:
- [ ] Components can be imported and rendered in isolation (verified in Phase 4)
- [ ] Grid skeleton shows a realistic loading preview

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Interaction Components

### Overview
Create the cell edit popover, bulk assign dialog, and delete range dialog. These components handle all user interactions for modifying day plan assignments.

### Changes Required:

#### 1. Cell Edit Popover
**File**: `apps/web/src/components/employee-day-plans/day-plan-cell-edit-popover.tsx` (NEW)

Popover that opens when clicking a grid cell, allowing the user to assign, change, or remove a day plan for a single employee on a single date.

```typescript
interface DayPlanCellEditPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  employeeName: string
  date: Date
  existingPlan: EmployeeDayPlan | null
  anchorRef?: React.RefObject<HTMLElement>
  onSuccess?: () => void
}
```

**Implementation approach:**
- Import `Popover`, `PopoverContent`, `PopoverAnchor` from `@/components/ui/popover`
- Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- Import `Button`, `Label`, `Input` (or `Textarea`) from `@/components/ui/*`
- Import `Loader2` from `lucide-react`
- Import `useDayPlans` from `@/hooks/api` for the day plan dropdown
- Import `useUpsertEmployeeDayPlan`, `useDeleteEmployeeDayPlan` from `@/hooks/api`
- Import `formatDate`, `formatDisplayDate` from `@/lib/time-utils`
- State:
  - `selectedDayPlanId: string | null` -- initialized from `existingPlan?.day_plan_id ?? null`
  - `notes: string` -- initialized from `existingPlan?.notes ?? ''`
  - Source is always `'manual'` for user edits
- Popover content layout:
  - Header: "Edit Day Plan" title with date display (e.g., "Mon, Feb 3, 2026")
  - Day plan selector: `Select` dropdown populated from `useDayPlans({ active: true })`, with a "No day plan (off day)" option
  - Notes: `Input` or small `Textarea` for optional notes
  - Footer: "Save" (primary), "Remove" (destructive variant, only shown if `existingPlan` exists), "Cancel" (outline)
- Save action:
  - Call `useUpsertEmployeeDayPlan().mutateAsync({ path: { employee_id: employeeId, date: formatDate(date) }, body: { day_plan_id: selectedDayPlanId, source: 'manual', notes } })`
  - On success: close popover, call `onSuccess` callback
- Remove action:
  - Call `useDeleteEmployeeDayPlan().mutateAsync({ path: { id: existingPlan.id } })`
  - On success: close popover, call `onSuccess` callback
- Reset state when `open` changes (useEffect on `open`)

**Reference pattern:** Follow the Dialog form pattern from `apps/web/src/components/holidays/holiday-copy-dialog.tsx` for form handling, state management, and error handling. Use Popover instead of Dialog.

#### 2. Bulk Assign Dialog
**File**: `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` (NEW)

Dialog for assigning a day plan to multiple employees over a date range.

```typescript
interface BulkAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}
```

**Implementation approach:**
- Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`
- Import `Button`, `Label`, `Input`, `Checkbox` from `@/components/ui/*`
- Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- Import `DateRangePicker`, `type DateRange` from `@/components/ui/date-range-picker`
- Import `SearchInput` from `@/components/ui/search-input`
- Import `Loader2` from `lucide-react`
- Import `Alert`, `AlertDescription` from `@/components/ui/alert`
- Import `useEmployees`, `useDayPlans`, `useBulkCreateEmployeeDayPlans` from `@/hooks/api`
- Import `formatDate` from `@/lib/time-utils`
- State:
  - `selectedEmployeeIds: Set<string>` -- multi-select checkboxes
  - `employeeSearch: string` -- for filtering the employee checkbox list
  - `dateRange: DateRange` -- from/to dates
  - `selectedDayPlanId: string` -- the day plan to assign
  - `source: string` -- defaults to `'manual'`
  - `notes: string` -- optional
  - `result: { created: number; updated: number } | null` -- shown after success
  - `error: string | null`
- Layout:
  - Employee multi-select: scrollable checkbox list with search input at top, showing `last_name, first_name`. Fetch all employees with `useEmployees({ limit: 200, active: true })`.
  - Date range picker: `DateRangePicker` component
  - Day plan selector: `Select` dropdown from `useDayPlans({ active: true })`
  - Source selector: `Select` with options tariff/manual/holiday (default manual)
  - Notes: `Input` for optional notes
  - Preview text: compute count = `selectedEmployeeIds.size * dayCount` where `dayCount` is the number of days between from and to (inclusive). Show `t('bulkAssignPreview', { count, employees: selectedEmployeeIds.size, days: dayCount })`
  - Footer: "Cancel" + "Assign" buttons
- Submit action:
  - Validate: at least 1 employee, date range set, day plan selected
  - Build `plans` array: for each employee, for each date in range, create `{ employee_id, plan_date: formatDate(date), day_plan_id: selectedDayPlanId, source, notes }`
  - Call `useBulkCreateEmployeeDayPlans().mutateAsync({ body: { plans } })`
  - On success: show result summary, then close dialog
  - On error: show error in Alert
- Reset all state when dialog opens (useEffect on `open`)

**Reference pattern:** Follow `apps/web/src/components/holidays/holiday-copy-dialog.tsx` for dialog structure, form handling, loading state, and error display.

#### 3. Delete Range Dialog
**File**: `apps/web/src/components/employee-day-plans/delete-range-dialog.tsx` (NEW)

Dialog for deleting all day plan assignments for an employee within a date range.

```typescript
interface DeleteRangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Pre-populated values (optional, for convenience when triggered from grid context)
  defaultEmployeeId?: string
  defaultEmployeeName?: string
  onSuccess?: () => void
}
```

**Implementation approach:**
- Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`
- Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- Import `DateRangePicker`, `type DateRange` from `@/components/ui/date-range-picker`
- Import `Button`, `Label` from `@/components/ui/*`
- Import `Alert`, `AlertDescription` from `@/components/ui/alert`
- Import `Loader2`, `AlertTriangle` from `lucide-react`
- Import `useEmployees`, `useDeleteEmployeeDayPlanRange` from `@/hooks/api`
- Import `formatDate`, `formatDisplayDate` from `@/lib/time-utils`
- State:
  - `selectedEmployeeId: string` -- single employee
  - `dateRange: DateRange` -- from/to
  - `result: { deleted: number } | null`
  - `error: string | null`
- Layout:
  - Employee selector: `Select` dropdown populated from `useEmployees({ limit: 200, active: true })`, pre-selected if `defaultEmployeeId` provided
  - Date range picker: `DateRangePicker`
  - Confirmation text: shows when employee and range are selected, using `t('deleteRangeConfirmation', { employee: name, from: formattedFrom, to: formattedTo })`
  - Destructive warning icon/styling
  - Footer: "Cancel" + "Delete" (destructive variant)
- Submit action:
  - Validate: employee selected, date range set
  - Call `useDeleteEmployeeDayPlanRange().mutateAsync({ body: { employee_id: selectedEmployeeId, from: formatDate(dateRange.from), to: formatDate(dateRange.to) } })`
  - On success: show result, then close
  - On error: show error in Alert
- Reset state when dialog opens

**Reference pattern:** Follow `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx` for destructive dialog pattern, and `apps/web/src/components/holidays/holiday-copy-dialog.tsx` for the full Dialog form pattern.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] All component files import and export correctly
- [ ] No unused imports or variables

#### Manual Verification:
- [ ] Components render correctly when triggered (verified in Phase 4)
- [ ] Popover positions correctly relative to the clicked cell
- [ ] Dialog forms validate inputs before submission

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Page Assembly

### Overview
Create the page component that wires together all grid and interaction components, adds state management, data fetching, access control, and routing.

### Changes Required:

#### 1. Create the page component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx` (NEW)

This is the main page that assembles everything.

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useEmployees, useDepartments, useEmployeeDayPlans } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, getWeekRange, getMonthRange } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

import { DayPlanCalendarGrid } from '@/components/employee-day-plans/day-plan-calendar-grid'
import { DayPlanGridToolbar } from '@/components/employee-day-plans/day-plan-grid-toolbar'
import { DayPlanGridSkeleton } from '@/components/employee-day-plans/day-plan-grid-skeleton'
import { DayPlanCellEditPopover } from '@/components/employee-day-plans/day-plan-cell-edit-popover'
import { BulkAssignDialog } from '@/components/employee-day-plans/bulk-assign-dialog'
import { DeleteRangeDialog } from '@/components/employee-day-plans/delete-range-dialog'

type EmployeeDayPlan = components['schemas']['EmployeeDayPlan']
type ViewMode = 'week' | 'twoWeeks' | 'month'
```

**Implementation approach -- state management:**

```typescript
// Auth & access control (following day-plans page pattern)
const router = useRouter()
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])
const t = useTranslations('employeeDayPlans')

// Redirect non-admins
React.useEffect(() => {
  if (!authLoading && !isAdmin) {
    router.push('/dashboard')
  }
}, [authLoading, isAdmin, router])

// View mode and date range
const [viewMode, setViewMode] = React.useState<ViewMode>('week')
const defaultRange = React.useMemo(() => getWeekRange(new Date()), [])
const [rangeStart, setRangeStart] = React.useState<Date>(defaultRange.start)
const [rangeEnd, setRangeEnd] = React.useState<Date>(defaultRange.end)

// Filters
const [search, setSearch] = React.useState('')
const [departmentId, setDepartmentId] = React.useState<string | undefined>(undefined)

// Dialog state
const [bulkAssignOpen, setBulkAssignOpen] = React.useState(false)
const [deleteRangeOpen, setDeleteRangeOpen] = React.useState(false)

// Cell edit popover state
const [editCell, setEditCell] = React.useState<{
  employeeId: string
  employeeName: string
  date: Date
  existingPlan: EmployeeDayPlan | null
} | null>(null)
```

**Implementation approach -- date range computation:**

```typescript
// Compute dates array from range
const dates = React.useMemo(() => {
  const result: Date[] = []
  const current = new Date(rangeStart)
  while (current <= rangeEnd) {
    result.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return result
}, [rangeStart, rangeEnd])

// Handle range navigation
const handleRangeChange = (start: Date, end: Date) => {
  setRangeStart(start)
  setRangeEnd(end)
}

// Handle view mode change (recalculate range)
const handleViewModeChange = (mode: ViewMode) => {
  setViewMode(mode)
  const today = new Date()
  if (mode === 'week') {
    const { start, end } = getWeekRange(today)
    setRangeStart(start)
    setRangeEnd(end)
  } else if (mode === 'twoWeeks') {
    const { start } = getWeekRange(today)
    const end = new Date(start)
    end.setDate(start.getDate() + 13)
    setRangeStart(start)
    setRangeEnd(end)
  } else {
    const { start, end } = getMonthRange(today)
    setRangeStart(start)
    setRangeEnd(end)
  }
}
```

**Implementation approach -- data fetching:**

```typescript
// Fetch employees (for grid rows)
const { data: employeesData, isLoading: employeesLoading } = useEmployees({
  limit: 200,
  departmentId,
  search,
  active: true,
  enabled: !authLoading && isAdmin,
})
const employees = employeesData?.data ?? []

// Fetch departments (for filter dropdown)
const { data: departmentsData } = useDepartments({
  active: true,
  enabled: !authLoading && isAdmin,
})
const departments = (departmentsData?.data ?? []).map(d => ({
  id: d.id,
  name: d.name,
}))

// Fetch employee day plans for the visible range
const { data: dayPlansData, isLoading: dayPlansLoading, isFetching } = useEmployeeDayPlans({
  from: formatDate(rangeStart),
  to: formatDate(rangeEnd),
  limit: 10000,  // Get all plans in range (employees * days)
  enabled: !authLoading && isAdmin,
})
const dayPlanAssignments = dayPlansData?.items ?? []
```

**Implementation approach -- cell click handler:**

```typescript
const handleCellClick = (employeeId: string, date: Date, existingPlan: EmployeeDayPlan | null) => {
  const employee = employees.find(e => e.id === employeeId)
  const employeeName = employee ? `${employee.last_name}, ${employee.first_name}` : ''
  setEditCell({ employeeId, employeeName, date, existingPlan })
}
```

**Implementation approach -- render:**

```typescript
if (authLoading) return <EmployeeDayPlansPageSkeleton />
if (!isAdmin) return null

return (
  <div className="space-y-6">
    {/* Page header */}
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('subtitle')}</p>
    </div>

    {/* Toolbar */}
    <DayPlanGridToolbar
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      onRangeChange={handleRangeChange}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      search={search}
      onSearchChange={setSearch}
      departmentId={departmentId}
      onDepartmentChange={setDepartmentId}
      departments={departments}
      onBulkAssign={() => setBulkAssignOpen(true)}
      onDeleteRange={() => setDeleteRangeOpen(true)}
      isFetching={isFetching}
    />

    {/* Grid */}
    <Card>
      <CardContent className="p-0">
        <DayPlanCalendarGrid
          employees={employees}
          dayPlanAssignments={dayPlanAssignments}
          dates={dates}
          onCellClick={handleCellClick}
          isLoading={employeesLoading || dayPlansLoading}
        />
      </CardContent>
    </Card>

    {/* Cell edit popover */}
    {editCell && (
      <DayPlanCellEditPopover
        open={!!editCell}
        onOpenChange={(open) => { if (!open) setEditCell(null) }}
        employeeId={editCell.employeeId}
        employeeName={editCell.employeeName}
        date={editCell.date}
        existingPlan={editCell.existingPlan}
        onSuccess={() => setEditCell(null)}
      />
    )}

    {/* Bulk assign dialog */}
    <BulkAssignDialog
      open={bulkAssignOpen}
      onOpenChange={setBulkAssignOpen}
    />

    {/* Delete range dialog */}
    <DeleteRangeDialog
      open={deleteRangeOpen}
      onOpenChange={setDeleteRangeOpen}
    />
  </div>
)
```

**Page skeleton function:**

```typescript
function EmployeeDayPlansPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-9 w-10" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-10" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <DayPlanGridSkeleton rows={8} columns={7} />
    </div>
  )
}
```

**Important notes on the cell edit popover positioning:**
The popover may need special handling since it's triggered from grid cells. Two approaches:
1. **Dialog-based approach (simpler):** Use a Dialog instead of a Popover if positioning proves problematic. The dialog centers on screen and doesn't need anchor positioning.
2. **Popover with manual anchor:** Pass a ref from the clicked cell to the PopoverAnchor. This requires the grid to track which cell element was clicked.

Recommendation: Start with approach 1 (Dialog) for simplicity and reliability, then switch to Popover if the UX demands it. The `DayPlanCellEditPopover` can internally use a `Dialog` while keeping the same interface.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [ ] `npm run build` completes successfully (Next.js build with page included)
- [ ] No linting errors in the new files

#### Manual Verification:
- [ ] Navigate to `/admin/employee-day-plans` as admin user
- [ ] Grid shows employees as rows, current week dates as columns
- [ ] Grid cells display day plan codes with color-coded source badges
- [ ] Clicking a cell opens the edit popover/dialog
- [ ] Editing a cell (save, remove) works and refreshes the grid
- [ ] "Bulk Assign" button opens the bulk assign dialog
- [ ] Bulk assign creates assignments and refreshes the grid
- [ ] "Delete Range" button opens the delete range dialog
- [ ] Delete range removes assignments and refreshes the grid
- [ ] Week/two-week/month navigation changes the date range and reloads data
- [ ] Prev/next arrows shift the period correctly
- [ ] Department filter limits the displayed employees
- [ ] Employee search filters the grid rows
- [ ] Non-admin users are redirected to `/dashboard`
- [ ] Breadcrumbs display correctly (Home > Administration > Employee Day Plans)
- [ ] Sidebar highlights the current page correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Manual Testing Steps:
1. **View current week grid**: Navigate to the page, verify grid shows all employees with current week columns
2. **Edit single cell**: Click a cell, select a day plan, save -- verify cell updates with manual source badge
3. **Remove assignment**: Click an assigned cell, click "Remove" -- verify cell becomes empty
4. **Bulk assign**: Select 3 employees, date range Mon-Fri, day plan "Standard", confirm -- verify cells update
5. **Delete range**: Select an employee, date range Mon-Fri, confirm -- verify cells are cleared
6. **Navigate weeks**: Click "Next" -- verify grid shifts to next week with new data
7. **Department filter**: Select a department -- verify only matching employees shown
8. **Employee search**: Type a name -- verify grid filters to matching employees
9. **View mode toggle**: Switch to "Month" -- verify grid expands to show full month
10. **Non-admin access**: Log in as non-admin, navigate to URL -- verify redirect to dashboard

## Performance Considerations

- The main query fetches all employee day plans for the visible range. For month view with many employees, this could be a large dataset. Using `limit: 10000` ensures we get all data in one request.
- The lookup map (`Map<string, EmployeeDayPlan>`) is built with `useMemo` to avoid O(n) lookups per cell.
- Employee list is fetched with `limit: 200` to cover most deployments. For larger organizations, pagination of the grid rows would be a future enhancement.
- View mode changes trigger new API requests. Using React Query's caching, switching back to a previously loaded view mode is instant.

## File Summary

### New Files (9):
1. `apps/web/src/hooks/api/use-employee-day-plans.ts`
2. `apps/web/src/components/employee-day-plans/day-plan-cell.tsx`
3. `apps/web/src/components/employee-day-plans/day-plan-grid-skeleton.tsx`
4. `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx`
5. `apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx`
6. `apps/web/src/components/employee-day-plans/day-plan-cell-edit-popover.tsx`
7. `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx`
8. `apps/web/src/components/employee-day-plans/delete-range-dialog.tsx`
9. `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx`

### Modified Files (5):
1. `apps/web/src/hooks/api/index.ts` -- add employee day plan hook exports
2. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` -- add nav entry + CalendarClock import
3. `apps/web/src/components/layout/breadcrumbs.tsx` -- add segment mapping
4. `apps/web/messages/en.json` -- add nav, breadcrumb, and employeeDayPlans namespace keys
5. `apps/web/messages/de.json` -- add nav, breadcrumb, and employeeDayPlans namespace keys

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-042-employee-day-plan-assignment-ui.md`
- Research: `thoughts/shared/research/2026-02-02-ZMI-TICKET-042-employee-day-plan-assignment-ui.md`
- API spec: `api/paths/employee-day-plans.yaml`
- Reference admin page: `apps/web/src/app/[locale]/(dashboard)/admin/day-plans/page.tsx`
- Reference grid component: `apps/web/src/components/holidays/holiday-year-calendar.tsx`
- Reference date handling: `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx`
- Hook patterns: `apps/web/src/hooks/api/use-employees.ts`, `apps/web/src/hooks/api/use-employee-tariff-assignments.ts`
- Dialog pattern: `apps/web/src/components/holidays/holiday-copy-dialog.tsx`
- Delete dialog pattern: `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx`
