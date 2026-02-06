# Research: ZMI-TICKET-060 - Shift Planning UI

**Date**: 2026-02-06
**Ticket**: ZMI-TICKET-060
**Status**: Research complete

---

## 1. Backend API (ZMI-TICKET-031) - Already Implemented

The Shift Planning backend is fully implemented with CRUD endpoints for both Shifts and Shift Assignments.

### 1.1 OpenAPI Spec

- **Paths**: `api/paths/shift-planning.yaml`
- **Schemas**: `api/schemas/shift-planning.yaml`

Endpoints defined:
- `GET /shifts` - List all shifts for tenant
- `POST /shifts` - Create shift (409 if code exists)
- `GET /shifts/{id}` - Get shift by ID
- `PATCH /shifts/{id}` - Update shift (code immutable)
- `DELETE /shifts/{id}` - Delete shift (409 if in use by assignments)
- `GET /shift-assignments` - List all shift assignments
- `POST /shift-assignments` - Create shift assignment
- `GET /shift-assignments/{id}` - Get assignment by ID
- `PATCH /shift-assignments/{id}` - Update assignment
- `DELETE /shift-assignments/{id}` - Delete assignment

### 1.2 Schema Definitions

**Shift** (from `api/schemas/shift-planning.yaml`):
- `id` (uuid), `tenant_id` (uuid), `code` (string, required, max 50), `name` (string, required, max 255)
- `description` (string, nullable), `day_plan_id` (uuid, nullable), `color` (string, max 7, nullable)
- `qualification` (string, nullable), `is_active` (boolean, default true), `sort_order` (integer)
- `created_at`, `updated_at` (date-time)

**ShiftAssignment** (from `api/schemas/shift-planning.yaml`):
- `id` (uuid), `tenant_id` (uuid), `employee_id` (uuid, required), `shift_id` (uuid, required)
- `valid_from` (date, nullable), `valid_to` (date, nullable), `notes` (string, nullable)
- `is_active` (boolean, default true), `created_at`, `updated_at` (date-time)

### 1.3 Generated TypeScript Types

Types exist in `apps/web/src/lib/api/types.ts`:
- `components['schemas']['Shift']`
- `components['schemas']['CreateShiftRequest']`
- `components['schemas']['UpdateShiftRequest']`
- `components['schemas']['ShiftList']` (has `data: Shift[]`)
- `components['schemas']['ShiftAssignment']`
- `components['schemas']['CreateShiftAssignmentRequest']`
- `components['schemas']['UpdateShiftAssignmentRequest']`
- `components['schemas']['ShiftAssignmentList']` (has `data: ShiftAssignment[]`)

### 1.4 Backend Go Implementation

All backend layers exist:
- **Models**: `apps/api/internal/model/shift.go`, `apps/api/internal/model/shift_assignment.go`
- **Repositories**: `apps/api/internal/repository/shift.go`, `apps/api/internal/repository/shift_assignment.go`
- **Services**: `apps/api/internal/service/shift.go`, `apps/api/internal/service/shift_assignment.go`
- **Handlers**: `apps/api/internal/handler/shift.go`, `apps/api/internal/handler/shift_assignment.go`
- **Routes**: `apps/api/internal/handler/routes.go` lines 1513-1551

Routes are registered with permission `shift_planning.manage`:
```go
func RegisterShiftRoutes(r chi.Router, h *ShiftHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("shift_planning.manage").String()
    r.Route("/shifts", func(r chi.Router) { ... })
}
func RegisterShiftAssignmentRoutes(r chi.Router, h *ShiftAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("shift_planning.manage").String()
    r.Route("/shift-assignments", func(r chi.Router) { ... })
}
```

ShiftAssignment model has relations:
```go
Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
Shift    *Shift    `gorm:"foreignKey:ShiftID" json:"shift,omitempty"`
```

### 1.5 Tests

- `apps/api/internal/service/shift_test.go`
- `apps/api/internal/service/shift_assignment_test.go`

---

## 2. Admin CRUD Page Pattern

### 2.1 Page Structure (Single-Entity CRUD)

Reference: `apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx`

Pattern:
```
'use client'
- Auth guard: useAuth() + useHasRole(['admin']) + redirect to /dashboard
- State: search, activeOnly filter, createOpen, editItem, viewItem, deleteItem, deleteError
- Data: useCalculationRules({ enabled: !authLoading && isAdmin })
- Filtering: React.useMemo with search + activeOnly
- Layout:
  - Page header (h1 + subtitle + "New" button)
  - Filters bar (SearchInput + Switch for active only + clear filters button)
  - Item count text
  - Card wrapping DataTable
  - FormSheet (create/edit)
  - DetailSheet (view)
  - ConfirmDialog (delete)
```

### 2.2 Page Structure (Multi-Tab)

Reference: `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx`

Pattern:
```
'use client'
- Auth guard same as above
- State: activeTab
- Uses Tabs/TabsContent/TabsList/TabsTrigger from @/components/ui/tabs
- Each tab renders a separate component from @/components/vacation-config
```

### 2.3 Page Structure (Calendar Grid / Board View)

Reference: `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx`

This is the closest existing pattern to the shift planning board. Pattern:
```
'use client'
- Auth guard same as above
- State: viewMode ('week'|'twoWeeks'|'month'), rangeStart, rangeEnd, search, departmentId
- Uses getWeekRange/getMonthRange from @/lib/time-utils
- Computes dates array from rangeStart to rangeEnd
- Fetches: useEmployees(limit: 200, departmentId, search), useDepartments(active: true), useEmployeeDayPlans(from, to, limit: 10000)
- Layout:
  - Page header
  - Toolbar (DayPlanGridToolbar)
  - Card wrapping CalendarGrid
  - Cell edit popover dialog
  - Bulk assign dialog
  - Delete range dialog
```

---

## 3. Component Patterns

### 3.1 Data Table

Reference: `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx`

Pattern:
- Props: `items`, `isLoading`, `onView`, `onEdit`, `onDelete`
- Uses Table/TableBody/TableCell/TableHead/TableHeader/TableRow from `@/components/ui/table`
- Uses DropdownMenu for row actions (View, Edit, Delete)
- Row is clickable (`className="cursor-pointer"`, `onClick={() => onView(item)}`)
- Skeleton loading state as a separate function
- Badge for status (active/inactive)
- Translation via `useTranslations('adminCalculationRules')`

### 3.2 Form Sheet

Reference: `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx`

Pattern:
- Props: `open`, `onOpenChange`, `rule` (optional for edit), `onSuccess`
- Uses Sheet/SheetContent/SheetHeader/SheetTitle/SheetDescription/SheetFooter
- Internal FormState interface + INITIAL_STATE constant
- useEffect to populate form on open (edit mode) or reset (create mode)
- handleSubmit: validates, calls createMutation or updateMutation
- ScrollArea for form content
- Sections with `<h3 className="text-sm font-medium text-muted-foreground">`
- Switch for is_active (edit only)
- Alert for errors
- Button footer: Cancel + Submit with loading spinner
- Select component for related entity dropdowns (e.g., accounts)

### 3.3 Detail Sheet

Reference: `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx`

Pattern:
- Props: `ruleId`, `open`, `onOpenChange`, `onEdit`, `onDelete`
- Fetches single item with useCalculationRule
- DetailRow helper component for label-value pairs
- ScrollArea for content
- Edit + Delete buttons in footer

### 3.4 Calendar Grid

Reference: `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx`

Pattern:
- Props: `employees`, `dayPlanAssignments`, `dates`, `onCellClick`, `isLoading`
- CSS Grid layout: `gridTemplateColumns: 180px repeat(${dates.length}, minmax(60px, 1fr))`
- Sticky employee name column (`sticky left-0 z-10`)
- Build lookup map: `"employeeId-YYYY-MM-DD"` -> assignment
- Date header row with weekday abbreviation + DD.MM
- Weekend/today highlighting via cn() helper
- DayPlanCell component for each cell

### 3.5 Cell Component

Reference: `apps/web/src/components/employee-day-plans/day-plan-cell.tsx`

Pattern:
- Renders a `<button>` with tooltip (title attribute)
- Color-coded by source type using predefined Tailwind class maps
- Small colored dot + truncated code text
- Empty state: dashed border with "-" text
- Hover/focus styles

### 3.6 Grid Toolbar

Reference: `apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx`

Pattern:
- ChevronLeft/ChevronRight buttons for date navigation
- Date range label display
- View mode toggle (week/twoWeeks/month)
- SearchInput + Department Select filter
- Action buttons (bulk assign, delete range)
- Uses getWeekRange/getMonthRange from time-utils

### 3.7 Grid Skeleton

Reference: `apps/web/src/components/employee-day-plans/day-plan-grid-skeleton.tsx`

Pattern:
- Props: rows, columns
- Same grid layout as the real grid
- Skeleton components for headers and cells

### 3.8 Component Index Files

Pattern (from `apps/web/src/components/calculation-rules/index.ts`):
```ts
export { CalculationRuleDataTable } from './calculation-rule-data-table'
export { CalculationRuleFormSheet } from './calculation-rule-form-sheet'
export { CalculationRuleDetailSheet } from './calculation-rule-detail-sheet'
```

---

## 4. Color Swatch Pattern

### 4.1 In Data Tables

Reference: `apps/web/src/components/absence-types/absence-type-data-table.tsx` line 128-132

```tsx
<div
  className="h-6 w-6 rounded-md border"
  style={{ backgroundColor: type.color || '#808080' }}
  title={type.color || '#808080'}
/>
```

### 4.2 Color Picker / Input

No existing color picker component exists in the codebase. The design system page at `apps/web/src/app/[locale]/design-system/page.tsx` has a `ColorSwatch` display component but it is not a picker/input.

No `<input type="color">` usage was found. A color picker will need to be created for the shift form.

---

## 5. Drag-and-Drop

No drag-and-drop library is installed. Checked `apps/web/package.json` for:
- `@dnd-kit/core` - not found
- `react-dnd` - not found
- `@hello-pangea/dnd` - not found
- `react-beautiful-dnd` - not found

No drag-and-drop patterns exist in the codebase. A library will need to be installed.

---

## 6. API Hook Patterns

### 6.1 Hook Infrastructure

- `apps/web/src/hooks/use-api-query.ts` - Type-safe wrapper around `@tanstack/react-query`'s `useQuery`
- `apps/web/src/hooks/use-api-mutation.ts` - Type-safe wrapper around `useMutation` with `invalidateKeys` support

### 6.2 CRUD Hook Pattern

Reference: `apps/web/src/hooks/api/use-calculation-rules.ts`

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

export function useCalculationRules(options = {}) {
  return useApiQuery('/calculation-rules', { enabled })
}

export function useCalculationRule(id: string, enabled = true) {
  return useApiQuery('/calculation-rules/{id}', { path: { id }, enabled: enabled && !!id })
}

export function useCreateCalculationRule() {
  return useApiMutation('/calculation-rules', 'post', {
    invalidateKeys: [['/calculation-rules']],
  })
}

export function useUpdateCalculationRule() {
  return useApiMutation('/calculation-rules/{id}', 'patch', {
    invalidateKeys: [['/calculation-rules'], ['/calculation-rules/{id}']],
  })
}

export function useDeleteCalculationRule() {
  return useApiMutation('/calculation-rules/{id}', 'delete', {
    invalidateKeys: [['/calculation-rules'], ['/calculation-rules/{id}']],
  })
}
```

### 6.3 Index Barrel Export

All hooks are exported from `apps/web/src/hooks/api/index.ts`. Each domain gets a commented section with all its exports.

### 6.4 Existing Dependency Hooks

**Day Plans** (`apps/web/src/hooks/api/use-day-plans.ts`):
- `useDayPlans({ active?, planType?, enabled? })` - for shift form day_plan_id selector
- `useDayPlan(id, enabled)`

**Employees** (`apps/web/src/hooks/api/use-employees.ts`):
- `useEmployees({ limit?, page?, search?, departmentId?, active?, enabled? })` - for board rows
- `useEmployee(id, enabled)`

**Departments** (`apps/web/src/hooks/api/use-departments.ts`):
- `useDepartments({ active?, enabled? })` - for board department filter

---

## 7. Navigation / Sidebar Configuration

### 7.1 Config File

Location: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Structure:
```ts
export interface NavItem {
  titleKey: string   // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
}

export interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [...]
```

The shift planning entry would go in the "management" section, alongside existing entries like:
```ts
{
  titleKey: 'employeeDayPlans',
  href: '/admin/employee-day-plans',
  icon: CalendarClock,
  roles: ['admin'],
},
```

Note: `CalendarClock` is already imported in the sidebar config file.

### 7.2 Icon Import

The icon `CalendarClock` is already imported from `lucide-react` in the sidebar config. If a different icon is desired, it can be added to the existing import list.

---

## 8. Translation File Pattern

### 8.1 Files

- English: `apps/web/messages/en.json`
- German: `apps/web/messages/de.json`

### 8.2 Navigation Keys

In `nav` namespace:
```json
{
  "nav": {
    "calculationRules": "Calculation Rules",
    "vacationConfig": "Vacation Config"
  }
}
```

A new entry like `"shiftPlanning": "Shift Planning"` / `"shiftPlanning": "Schichtplanung"` is needed.

### 8.3 Page Translation Namespace

Pattern: `adminCalculationRules`, `adminVacationConfig`, `employeeDayPlans`

For shift planning, the namespace would be something like `adminShiftPlanning` or `shiftPlanning`.

The translation key structure follows this pattern (from `adminCalculationRules`):
```json
{
  "adminCalculationRules": {
    "title": "...",
    "subtitle": "...",
    "newRule": "...",
    "searchPlaceholder": "...",
    "clearFilters": "...",
    "ruleCount": "{count} rule",
    "rulesCount": "{count} rules",
    "deleteRule": "...",
    "deleteDescription": "...",
    "delete": "Delete",
    "emptyTitle": "...",
    "emptyFilterHint": "...",
    "emptyGetStarted": "...",
    "actions": "Actions",
    "cancel": "Cancel",
    "close": "Close",
    "columnCode": "Code",
    "columnName": "Name",
    "columnStatus": "Status",
    "create": "Create",
    "edit": "Edit",
    "viewDetails": "View Details",
    "fieldActive": "Active",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "showActiveOnly": "Active only",
    "saving": "Saving...",
    "saveChanges": "Save Changes",
    "failedCreate": "...",
    "failedUpdate": "...",
    "failedDelete": "...",
    "statusActive": "Active",
    "statusInactive": "Inactive"
  }
}
```

---

## 9. UI Component Library

### 9.1 Available UI Components (used in similar pages)

From `apps/web/src/components/ui/`:
- `button` - Button with variants (default, outline, ghost, destructive) and sizes
- `badge` - Badge with variants
- `card` - Card, CardContent, CardHeader, CardTitle
- `table` - Table, TableBody, TableCell, TableHead, TableHeader, TableRow
- `sheet` - Sheet (side panel), SheetContent, SheetHeader, etc. (used for forms and details)
- `confirm-dialog` - ConfirmDialog using Sheet with side="bottom"
- `tabs` - Tabs, TabsContent, TabsList, TabsTrigger
- `input` - Input
- `textarea` - Textarea
- `label` - Label
- `select` - Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- `switch` - Switch toggle
- `scroll-area` - ScrollArea
- `skeleton` - Skeleton loading
- `search-input` - SearchInput with debounced search
- `calendar` - Calendar component (date picker)
- `date-range-picker` - DateRangePicker component
- `dropdown-menu` - DropdownMenu and related
- `alert` - Alert, AlertDescription (for form errors)

### 9.2 Lucide Icons Used

Already imported in sidebar config: `CalendarClock`, `Calendar`, `CalendarDays`, etc.

---

## 10. Time Utilities

Location: `apps/web/src/lib/time-utils.ts`

Relevant functions for board view:
- `getWeekRange(date)` -> `{ start: Date, end: Date }` (Monday to Sunday)
- `getMonthRange(date)` -> `{ start: Date, end: Date }`
- `getWeekStart(date)` -> Monday Date
- `getWeekEnd(date)` -> Sunday Date
- `formatDate(date)` -> `"YYYY-MM-DD"`
- `formatDisplayDate(date, format, locale)` -> localized display
- `isToday(date)` -> boolean
- `isWeekend(date)` -> boolean

---

## 11. Existing Similar Features Summary

| Feature | Shift Planning Equivalent | Reference Path |
|---|---|---|
| CRUD data table | Shift data table | `components/calculation-rules/calculation-rule-data-table.tsx` |
| Form sheet | Shift form sheet | `components/calculation-rules/calculation-rule-form-sheet.tsx` |
| Detail sheet | Shift detail sheet (optional) | `components/calculation-rules/calculation-rule-detail-sheet.tsx` |
| Calendar grid board | Shift planning board | `components/employee-day-plans/day-plan-calendar-grid.tsx` |
| Grid toolbar | Board toolbar | `components/employee-day-plans/day-plan-grid-toolbar.tsx` |
| Grid cell | Shift assignment cell | `components/employee-day-plans/day-plan-cell.tsx` |
| Grid skeleton | Board skeleton | `components/employee-day-plans/day-plan-grid-skeleton.tsx` |
| Cell edit popover | Assignment form dialog | `components/employee-day-plans/day-plan-cell-edit-popover.tsx` |
| Color swatch in table | Shift color swatch | `components/absence-types/absence-type-data-table.tsx` (line 128-132) |
| Multi-tab page | Shifts tab + Planning Board tab | `app/.../admin/vacation-config/page.tsx` |
| Confirm dialog | Delete shift/assignment | `components/ui/confirm-dialog.tsx` |

---

## 12. Key Differences / New Needs

1. **Color picker input**: No existing component. Need to create or use `<input type="color">` for shift form.
2. **Drag-and-drop**: No library installed. Need to install `@dnd-kit/core` or similar for palette-to-cell drag.
3. **Shift palette sidebar**: New concept, no existing equivalent. Would be a sidebar with draggable shift items.
4. **Color-coded cells**: The day-plan-cell uses predefined Tailwind classes per source type. Shift cells would use dynamic `style={{ backgroundColor: shift.color }}` similar to absence-type table.
5. **Two-tab page**: Combines CRUD table pattern (tab 1) + calendar grid pattern (tab 2) in one page.

---

## 13. File Inventory - What Needs to Be Created

### New files:
- `apps/web/src/app/[locale]/(dashboard)/admin/shift-planning/page.tsx`
- `apps/web/src/components/shift-planning/index.ts`
- `apps/web/src/components/shift-planning/shift-data-table.tsx`
- `apps/web/src/components/shift-planning/shift-form-sheet.tsx`
- `apps/web/src/components/shift-planning/shift-planning-board.tsx`
- `apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`
- `apps/web/src/components/shift-planning/shift-palette.tsx`
- `apps/web/src/hooks/api/use-shift-planning.ts`

### Files to modify:
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - add nav entry
- `apps/web/src/hooks/api/index.ts` - add shift planning hook exports
- `apps/web/messages/en.json` - add `nav.shiftPlanning` + `shiftPlanning` namespace
- `apps/web/messages/de.json` - add German translations
