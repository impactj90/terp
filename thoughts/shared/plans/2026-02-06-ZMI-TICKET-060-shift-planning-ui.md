# Implementation Plan: ZMI-TICKET-060 - Shift Planning UI

**Date**: 2026-02-06
**Ticket**: ZMI-TICKET-060
**Research**: `thoughts/shared/research/2026-02-06-ZMI-TICKET-060-shift-planning-ui.md`
**Status**: Plan complete

---

## Overview

Build a Shift Planning admin page with two tabs:
1. **Shifts tab** - CRUD data table for shift definitions (code, name, color, day plan, qualification, etc.)
2. **Planning Board tab** - Calendar grid view (employees x dates) with shift assignment management via drag-and-drop from a shift palette and click-to-edit dialog.

The backend is fully implemented (ZMI-TICKET-031). All API endpoints, generated TypeScript types, and Go layers are in place.

---

## Phase 1: API Hooks

**Goal**: Create React Query hooks for shifts CRUD and shift assignments CRUD.

### File to create

**`apps/web/src/hooks/api/use-shift-planning.ts`**

Follow the exact pattern from `apps/web/src/hooks/api/use-calculation-rules.ts`:

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

// -- Shifts --

interface UseShiftsOptions {
  enabled?: boolean
}

export function useShifts(options: UseShiftsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/shifts', { enabled })
}

export function useShift(id: string, enabled = true) {
  return useApiQuery('/shifts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateShift() {
  return useApiMutation('/shifts', 'post', {
    invalidateKeys: [['/shifts']],
  })
}

export function useUpdateShift() {
  return useApiMutation('/shifts/{id}', 'patch', {
    invalidateKeys: [['/shifts'], ['/shifts/{id}']],
  })
}

export function useDeleteShift() {
  return useApiMutation('/shifts/{id}', 'delete', {
    invalidateKeys: [['/shifts'], ['/shifts/{id}']],
  })
}

// -- Shift Assignments --

interface UseShiftAssignmentsOptions {
  enabled?: boolean
}

export function useShiftAssignments(options: UseShiftAssignmentsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/shift-assignments', { enabled })
}

export function useShiftAssignment(id: string, enabled = true) {
  return useApiQuery('/shift-assignments/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateShiftAssignment() {
  return useApiMutation('/shift-assignments', 'post', {
    invalidateKeys: [['/shift-assignments']],
  })
}

export function useUpdateShiftAssignment() {
  return useApiMutation('/shift-assignments/{id}', 'patch', {
    invalidateKeys: [['/shift-assignments'], ['/shift-assignments/{id}']],
  })
}

export function useDeleteShiftAssignment() {
  return useApiMutation('/shift-assignments/{id}', 'delete', {
    invalidateKeys: [['/shift-assignments'], ['/shift-assignments/{id}']],
  })
}
```

### File to modify

**`apps/web/src/hooks/api/index.ts`**

Add at end of file, following the existing commented-section pattern:

```ts
// Shift Planning
export {
  useShifts,
  useShift,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
  useShiftAssignments,
  useShiftAssignment,
  useCreateShiftAssignment,
  useUpdateShiftAssignment,
  useDeleteShiftAssignment,
} from './use-shift-planning'
```

### Type references

From `apps/web/src/lib/api/types.ts` (already generated, no changes needed):
- `components['schemas']['Shift']` - id, tenant_id, code, name, description, day_plan_id, color, qualification, is_active, sort_order, created_at, updated_at
- `components['schemas']['CreateShiftRequest']` - code, name, description?, day_plan_id?, color?, qualification?, sort_order?
- `components['schemas']['UpdateShiftRequest']` - name?, description?, day_plan_id?, color?, qualification?, is_active?, sort_order?
- `components['schemas']['ShiftList']` - { data: Shift[] }
- `components['schemas']['ShiftAssignment']` - id, tenant_id, employee_id, shift_id, valid_from?, valid_to?, notes?, is_active?, created_at, updated_at
- `components['schemas']['CreateShiftAssignmentRequest']` - employee_id, shift_id, valid_from?, valid_to?, notes?
- `components['schemas']['UpdateShiftAssignmentRequest']` - valid_from?, valid_to?, notes?, is_active?
- `components['schemas']['ShiftAssignmentList']` - { data: ShiftAssignment[] }

### Verification

- `cd apps/web && npx tsc --noEmit` should pass with no shift-planning related errors
- All 10 hook functions are exported from the barrel index

---

## Phase 2: Translation Files

**Goal**: Add English and German translations for the shift planning page.

### Files to modify

**`apps/web/messages/en.json`**

1. Add to the `nav` object (after `"vacationConfig": "Vacation Config"`):
```json
"shiftPlanning": "Shift Planning"
```

2. Add new top-level namespace `"shiftPlanning"` with all needed keys:
```json
"shiftPlanning": {
  "title": "Shift Planning",
  "subtitle": "Manage shift definitions and employee shift assignments",
  "tabShifts": "Shifts",
  "tabPlanningBoard": "Planning Board",

  "newShift": "New Shift",
  "searchPlaceholder": "Search by code or name...",
  "clearFilters": "Clear filters",
  "shiftCount": "{count} shift",
  "shiftsCount": "{count} shifts",
  "showActiveOnly": "Active only",
  "showAll": "Show all",

  "columnColor": "Color",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDayPlan": "Day Plan",
  "columnQualification": "Qualification",
  "columnStatus": "Status",

  "actions": "Actions",
  "viewDetails": "View Details",
  "edit": "Edit",
  "delete": "Delete",
  "cancel": "Cancel",
  "close": "Close",
  "create": "Create",
  "saving": "Saving...",
  "saveChanges": "Save Changes",

  "createShift": "New Shift",
  "createDescription": "Add a new shift definition.",
  "editShift": "Edit Shift",
  "editDescription": "Modify the selected shift definition.",
  "shiftDetails": "Shift Details",
  "viewShiftInfo": "View shift information",

  "sectionBasicInfo": "Basic Information",
  "sectionAppearance": "Appearance",
  "sectionDayPlan": "Day Plan Assignment",
  "sectionStatus": "Status",

  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Description",
  "fieldColor": "Color",
  "fieldQualification": "Qualification",
  "fieldDayPlan": "Day Plan",
  "fieldSortOrder": "Sort Order",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive shifts are hidden from selections",

  "codePlaceholder": "e.g. EARLY",
  "codeHint": "Unique code (uppercase, max 50 chars)",
  "namePlaceholder": "e.g. Early Shift",
  "descriptionPlaceholder": "Optional description...",
  "colorPlaceholder": "Select a color",
  "qualificationPlaceholder": "e.g. Forklift license",
  "dayPlanPlaceholder": "Select a day plan...",
  "dayPlanNone": "None",

  "deleteShift": "Delete Shift",
  "deleteShiftDescription": "Are you sure you want to delete \"{name}\" ({code})? This action cannot be undone.",
  "deleteShiftInUse": "This shift is still referenced by assignments and cannot be deleted.",
  "failedCreate": "Failed to create shift",
  "failedUpdate": "Failed to update shift",
  "failedDelete": "Failed to delete shift",

  "validationCodeRequired": "Code is required",
  "validationCodeMaxLength": "Code must be at most 50 characters",
  "validationNameRequired": "Name is required",

  "statusActive": "Active",
  "statusInactive": "Inactive",

  "emptyTitle": "No shifts found",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first shift",
  "addShift": "Add Shift",

  "detailsSection": "Details",
  "appearanceSection": "Appearance",
  "dayPlanSection": "Day Plan",
  "timestampsSection": "Timestamps",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",
  "noColor": "No color",

  "boardTitle": "Planning Board",
  "boardSubtitle": "Assign shifts to employees on a weekly calendar",
  "previousPeriod": "Previous period",
  "nextPeriod": "Next period",
  "today": "Today",
  "viewWeek": "Week",
  "viewTwoWeeks": "2 Weeks",
  "viewMonth": "Month",
  "allDepartments": "All Departments",
  "employee": "Employee",

  "boardEmptyTitle": "No employees found",
  "boardEmptySubtitle": "Try adjusting your filters",

  "shiftPalette": "Shift Palette",
  "paletteEmpty": "No active shifts. Create shifts in the Shifts tab.",
  "paletteDragHint": "Drag a shift to a cell or click a cell to assign",

  "assignmentEditTitle": "Edit Shift Assignment",
  "assignmentCreateTitle": "Assign Shift",
  "assignmentShift": "Shift",
  "assignmentShiftPlaceholder": "Select a shift...",
  "assignmentValidFrom": "Valid From",
  "assignmentValidTo": "Valid To",
  "assignmentNotes": "Notes",
  "assignmentNotesPlaceholder": "Optional notes...",
  "assignmentSave": "Save",
  "assignmentCancel": "Cancel",
  "assignmentRemove": "Remove Assignment",
  "assignmentFailedCreate": "Failed to create assignment",
  "assignmentFailedUpdate": "Failed to update assignment",
  "assignmentFailedDelete": "Failed to remove assignment",

  "offDay": "No shift assigned"
}
```

**`apps/web/messages/de.json`**

1. Add to the `nav` object (after `"vacationConfig": "Urlaubskonfiguration"`):
```json
"shiftPlanning": "Schichtplanung"
```

2. Add new top-level namespace `"shiftPlanning"` with German translations:
```json
"shiftPlanning": {
  "title": "Schichtplanung",
  "subtitle": "Schichtdefinitionen und Mitarbeiter-Schichtzuweisungen verwalten",
  "tabShifts": "Schichten",
  "tabPlanningBoard": "Plantafel",

  "newShift": "Neue Schicht",
  "searchPlaceholder": "Nach Code oder Name suchen...",
  "clearFilters": "Filter zurücksetzen",
  "shiftCount": "{count} Schicht",
  "shiftsCount": "{count} Schichten",
  "showActiveOnly": "Nur aktive",
  "showAll": "Alle anzeigen",

  "columnColor": "Farbe",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDayPlan": "Tagesplan",
  "columnQualification": "Qualifikation",
  "columnStatus": "Status",

  "actions": "Aktionen",
  "viewDetails": "Details anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen",
  "cancel": "Abbrechen",
  "close": "Schließen",
  "create": "Erstellen",
  "saving": "Speichern...",
  "saveChanges": "Änderungen speichern",

  "createShift": "Neue Schicht",
  "createDescription": "Neue Schichtdefinition hinzufügen.",
  "editShift": "Schicht bearbeiten",
  "editDescription": "Ausgewählte Schichtdefinition ändern.",
  "shiftDetails": "Schichtdetails",
  "viewShiftInfo": "Schichtinformationen anzeigen",

  "sectionBasicInfo": "Grundinformationen",
  "sectionAppearance": "Darstellung",
  "sectionDayPlan": "Tagesplan-Zuordnung",
  "sectionStatus": "Status",

  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Beschreibung",
  "fieldColor": "Farbe",
  "fieldQualification": "Qualifikation",
  "fieldDayPlan": "Tagesplan",
  "fieldSortOrder": "Sortierung",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Schichten werden in Auswahlen ausgeblendet",

  "codePlaceholder": "z.B. FRUEH",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 50 Zeichen)",
  "namePlaceholder": "z.B. Frühschicht",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "colorPlaceholder": "Farbe auswählen",
  "qualificationPlaceholder": "z.B. Staplerschein",
  "dayPlanPlaceholder": "Tagesplan auswählen...",
  "dayPlanNone": "Keiner",

  "deleteShift": "Schicht löschen",
  "deleteShiftDescription": "Möchten Sie \"{name}\" ({code}) wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteShiftInUse": "Diese Schicht wird noch von Zuweisungen referenziert und kann nicht gelöscht werden.",
  "failedCreate": "Schicht konnte nicht erstellt werden",
  "failedUpdate": "Schicht konnte nicht aktualisiert werden",
  "failedDelete": "Schicht konnte nicht gelöscht werden",

  "validationCodeRequired": "Code ist erforderlich",
  "validationCodeMaxLength": "Code darf maximal 50 Zeichen lang sein",
  "validationNameRequired": "Name ist erforderlich",

  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",

  "emptyTitle": "Keine Schichten gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Erstellen Sie Ihre erste Schicht",
  "addShift": "Schicht hinzufügen",

  "detailsSection": "Details",
  "appearanceSection": "Darstellung",
  "dayPlanSection": "Tagesplan",
  "timestampsSection": "Zeitstempel",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",
  "noColor": "Keine Farbe",

  "boardTitle": "Plantafel",
  "boardSubtitle": "Schichten wöchentlich an Mitarbeiter zuweisen",
  "previousPeriod": "Vorherige Periode",
  "nextPeriod": "Nächste Periode",
  "today": "Heute",
  "viewWeek": "Woche",
  "viewTwoWeeks": "2 Wochen",
  "viewMonth": "Monat",
  "allDepartments": "Alle Abteilungen",
  "employee": "Mitarbeiter",

  "boardEmptyTitle": "Keine Mitarbeiter gefunden",
  "boardEmptySubtitle": "Versuchen Sie, Ihre Filter anzupassen",

  "shiftPalette": "Schichtpalette",
  "paletteEmpty": "Keine aktiven Schichten. Erstellen Sie Schichten im Tab \"Schichten\".",
  "paletteDragHint": "Schicht auf eine Zelle ziehen oder Zelle klicken zum Zuweisen",

  "assignmentEditTitle": "Schichtzuweisung bearbeiten",
  "assignmentCreateTitle": "Schicht zuweisen",
  "assignmentShift": "Schicht",
  "assignmentShiftPlaceholder": "Schicht auswählen...",
  "assignmentValidFrom": "Gültig ab",
  "assignmentValidTo": "Gültig bis",
  "assignmentNotes": "Notizen",
  "assignmentNotesPlaceholder": "Optionale Notizen...",
  "assignmentSave": "Speichern",
  "assignmentCancel": "Abbrechen",
  "assignmentRemove": "Zuweisung entfernen",
  "assignmentFailedCreate": "Zuweisung konnte nicht erstellt werden",
  "assignmentFailedUpdate": "Zuweisung konnte nicht aktualisiert werden",
  "assignmentFailedDelete": "Zuweisung konnte nicht entfernt werden",

  "offDay": "Keine Schicht zugewiesen"
}
```

### Verification

- JSON must remain valid after edits (no trailing commas, proper nesting)
- Every key in `en.json` `"shiftPlanning"` namespace has a corresponding key in `de.json` `"shiftPlanning"` namespace
- `nav.shiftPlanning` exists in both files

---

## Phase 3: Shifts Data Table + Form Sheet (CRUD List Tab)

**Goal**: Create the shift data table, form sheet, and detail sheet components.

### Files to create

#### 3.1 `apps/web/src/components/shift-planning/shift-data-table.tsx`

Follow `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx` pattern.

- Props: `items: Shift[]`, `isLoading: boolean`, `onView`, `onEdit`, `onDelete`
- Translation namespace: `useTranslations('shiftPlanning')`
- Type: `type Shift = components['schemas']['Shift']`
- Columns:
  1. **Color** (w-12): Color swatch `<div className="h-6 w-6 rounded-md border" style={{ backgroundColor: shift.color || '#808080' }} />`
     Reference: `apps/web/src/components/absence-types/absence-type-data-table.tsx` line 128-132
  2. **Code** (w-24): `font-mono text-sm`
  3. **Name**: With icon placeholder (use `CalendarClock` from lucide-react) same pattern as calc-rule table
  4. **Day Plan** (w-32): Show day_plan_id (truncated UUID or "-" if null). Note: The API does not return the day plan name inline, so display day_plan_id ? "Linked" : "-"
  5. **Qualification** (w-32): Text or "-"
  6. **Status** (w-24): Badge active/inactive
  7. **Actions** (w-16): DropdownMenu with View, Edit, Delete
- Skeleton loading state
- Row clickable -> onView

#### 3.2 `apps/web/src/components/shift-planning/shift-form-sheet.tsx`

Follow `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx` pattern.

- Props: `open`, `onOpenChange`, `shift?: Shift | null`, `onSuccess?`
- Uses: `useCreateShift`, `useUpdateShift`, `useDayPlans` (from existing hooks)
- FormState interface:
  ```ts
  interface FormState {
    code: string
    name: string
    description: string
    dayPlanId: string
    color: string
    qualification: string
    sortOrder: number
    isActive: boolean
  }
  ```
- Sections:
  1. **Basic Information**: code (uppercase, disabled on edit), name, description (textarea)
  2. **Appearance**: color (use `<input type="color">` wrapped in a label/div for consistent styling), qualification
  3. **Day Plan Assignment**: Select dropdown populated from `useDayPlans({ active: true, enabled: open })` with None option
  4. **Status** (edit only): Switch for is_active
- Validation: code required (max 50), name required
- Submit: call create or update mutation
- Color picker implementation: Use native `<input type="color" />` since no color picker component exists in the codebase. Wrap it in a flex layout with the hex value displayed next to it.

#### 3.3 `apps/web/src/components/shift-planning/shift-detail-sheet.tsx`

Follow `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx` pattern.

- Props: `shiftId: string | null`, `open`, `onOpenChange`, `onEdit`, `onDelete`
- Uses: `useShift(shiftId, open && !!shiftId)`, `useDayPlan` (to resolve day_plan_id name)
- Sections:
  1. Header with color swatch icon + name + code + active badge
  2. Description (if present)
  3. Details section: code, name rows
  4. Appearance section: color swatch + hex, qualification
  5. Day Plan section: resolved day plan name or "None"
  6. Timestamps: created_at, updated_at
- Footer: Close, Edit, Delete buttons

#### 3.4 `apps/web/src/components/shift-planning/index.ts`

Barrel export following `apps/web/src/components/calculation-rules/index.ts`:

```ts
export { ShiftDataTable } from './shift-data-table'
export { ShiftFormSheet } from './shift-form-sheet'
export { ShiftDetailSheet } from './shift-detail-sheet'
export { ShiftPlanningBoard } from './shift-planning-board'
export { ShiftAssignmentFormDialog } from './shift-assignment-form-dialog'
export { ShiftPalette } from './shift-palette'
```

### Verification

- `cd apps/web && npx tsc --noEmit` passes
- Components import correctly from barrel export
- Color swatch renders inline with shift color
- Form sheet opens, populates on edit, resets on create

---

## Phase 4: Planning Board Components

**Goal**: Create the calendar/board view with shift palette and assignment dialog.

### Dependency: Install @dnd-kit

Before building, install the drag-and-drop library:

```bash
cd apps/web && npm install @dnd-kit/core @dnd-kit/utilities
```

No existing drag-and-drop library exists in the project (confirmed by research).

### Files to create

#### 4.1 `apps/web/src/components/shift-planning/shift-planning-board.tsx`

Follow `apps/web/src/app/[locale]/(dashboard)/admin/employee-day-plans/page.tsx` for state management and `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx` for grid rendering.

This is a self-contained component rendered inside the Planning Board tab. It manages its own state (unlike the day plan page which manages state at page level).

**Props**: `enabled: boolean` (to gate data fetching when tab is active)

**Internal state**:
- `viewMode: 'week' | 'twoWeeks' | 'month'` (default 'week')
- `rangeStart, rangeEnd` (Date, computed from viewMode)
- `search, departmentId` (filters)
- `editCell: { employeeId, employeeName, date, existingAssignment } | null`

**Data fetching**:
- `useEmployees({ limit: 200, departmentId, search, enabled })`
- `useDepartments({ active: true, enabled })`
- `useShifts({ enabled })` - for palette + cell rendering
- `useShiftAssignments({ enabled })` - all assignments for tenant

**Grid rendering**:
- Reuse the same CSS Grid pattern from `day-plan-calendar-grid.tsx`:
  - `gridTemplateColumns: 180px repeat(${dates.length}, minmax(60px, 1fr))`
  - Sticky employee name column
  - Date header row with weekday + DD.MM
  - Weekend/today highlighting
- Build lookup map: `"employeeId-YYYY-MM-DD"` -> ShiftAssignment (match valid_from/valid_to date range)
- Each cell renders a `ShiftCell` (inline component or separate):
  - Shows shift color + code if assignment exists for that date
  - Uses `style={{ backgroundColor: shift.color }}` with text contrast
  - Empty cell: dashed border with "-"
  - Clickable: opens assignment form dialog

**Drag-and-drop** (using @dnd-kit/core):
- Wrap the board in `<DndContext>` from `@dnd-kit/core`
- Each cell is a `<Droppable>` zone (useDroppable)
- Shift palette items are `<Draggable>` (useDraggable)
- On `onDragEnd`: if over a valid cell, call `createShiftAssignment` with the shift_id and employee_id + date
- DragOverlay: show shift name + color while dragging

**Toolbar** (inline, adapted from `day-plan-grid-toolbar.tsx`):
- ChevronLeft/Right for date navigation
- Date range label
- View mode toggle (week / 2 weeks / month)
- SearchInput + Department Select
- Uses `getWeekRange`, `getMonthRange` from `@/lib/time-utils`

**Layout**:
```
[Toolbar]
[Flex container]
  [Shift Palette (left sidebar, ~200px)]
  [Calendar Grid (flex-1)]
```

#### 4.2 `apps/web/src/components/shift-planning/shift-palette.tsx`

New concept, no direct reference. Build as a vertical sidebar.

**Props**: `shifts: Shift[]`, `isLoading: boolean`

**Rendering**:
- Header: `t('shiftPalette')` with hint text
- List of active shifts, each as a draggable item (useDraggable from @dnd-kit/core):
  - Color swatch (small circle or rectangle)
  - Shift code + name
  - `id` passed to useDraggable for identification
- Empty state: message linking to Shifts tab
- Compact styling to fit sidebar width (~200px)

#### 4.3 `apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`

Follow `apps/web/src/components/employee-day-plans/day-plan-cell-edit-popover.tsx` pattern.

**Props**:
- `open`, `onOpenChange`
- `employeeId: string`, `employeeName: string`, `date: Date`
- `existingAssignment: ShiftAssignment | null`
- `shifts: Shift[]` (passed from parent to avoid re-fetching)
- `preselectedShiftId?: string` (for drag-and-drop created assignments)
- `onSuccess?: () => void`

**Internal state**:
- `selectedShiftId: string`
- `validFrom: string` (date string)
- `validTo: string` (date string, optional)
- `notes: string`

**Behavior**:
- On open: populate from existingAssignment or set defaults (preselectedShiftId, date as validFrom)
- Uses Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter from `@/components/ui/dialog`
- Fields:
  1. Shift select (populated from shifts prop, shows color swatch + code + name)
  2. Valid From (date input, pre-filled with cell date)
  3. Valid To (date input, optional)
  4. Notes (text input)
- Footer: Remove (destructive, only if existingAssignment), Cancel, Save
- Mutations: `useCreateShiftAssignment`, `useUpdateShiftAssignment`, `useDeleteShiftAssignment`

### Verification

- Board renders employee rows and date columns correctly
- Shift palette displays active shifts with color swatches
- Clicking empty cell opens assignment dialog with date pre-filled
- Clicking assigned cell opens dialog with existing data pre-filled
- Drag-and-drop from palette to cell creates assignment
- Date navigation (week forward/backward) works
- Department filter narrows employee list
- Search filter narrows employee list
- `npx tsc --noEmit` passes

---

## Phase 5: Main Page + Navigation

**Goal**: Create the main page with two tabs, add sidebar navigation entry.

### Files to create

#### 5.1 `apps/web/src/app/[locale]/(dashboard)/admin/shift-planning/page.tsx`

Follow `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx` for multi-tab structure, combined with shift-specific content.

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, CalendarClock, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useShifts, useDeleteShift } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ShiftDataTable,
  ShiftFormSheet,
  ShiftDetailSheet,
  ShiftPlanningBoard,
} from '@/components/shift-planning'
import type { components } from '@/lib/api/types'

type Shift = components['schemas']['Shift']
type ShiftPlanningTab = 'shifts' | 'planning-board'
```

**Page component**:
- Auth guard: useAuth + useHasRole(['admin']) + redirect to /dashboard
- Translation: `useTranslations('shiftPlanning')`
- State: `activeTab: ShiftPlanningTab` (default 'shifts')
- Tab: "Shifts" - CRUD content (follows calculation-rules page pattern exactly):
  - search, activeOnly, createOpen, editItem, viewItem, deleteItem, deleteError states
  - useShifts data, filtered via React.useMemo
  - Page header (title + subtitle + "New Shift" button)
  - Filters bar (SearchInput + Switch + clear)
  - Item count
  - Card > ShiftDataTable
  - ShiftFormSheet
  - ShiftDetailSheet
  - ConfirmDialog for delete
- Tab: "Planning Board" - renders `<ShiftPlanningBoard enabled={activeTab === 'planning-board'} />`

**Skeleton**: Following vacation-config page skeleton pattern.

### Files to modify

#### 5.2 `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add shift planning entry to the `management` section items array.

Place it after the `employeeDayPlans` entry (line ~174) since shift planning is related to day plans conceptually:

```ts
{
  titleKey: 'shiftPlanning',
  href: '/admin/shift-planning',
  icon: CalendarClock,
  roles: ['admin'],
},
```

Note: `CalendarClock` is already imported in the file. If a different icon is desired, use an alternative from lucide-react (e.g., `Clock` with a different qualifier). For now, reuse `CalendarClock` since it's already imported. Alternatively, could import `Layers` or `LayoutGrid` but `CalendarClock` fits the scheduling theme.

Actually, to avoid confusion with `employeeDayPlans` which already uses `CalendarClock`, let us consider using a different icon. Looking at available imports, `CalendarCheck` is already imported. Let's add a new import for something unique. Options:
- `Layers` (represents shifts/layers) - need to add import
- Reuse `CalendarClock` - simpler but duplicate icon

Decision: Import and use `Layers` from lucide-react for the shift planning entry. Add to the import list at the top of the file.

```ts
import { ..., Layers } from 'lucide-react'
```

Then use `icon: Layers` in the nav entry.

### Verification

- Navigate to `/admin/shift-planning` - page loads with two tabs
- "Shifts" tab shows CRUD table, create/edit/delete work
- "Planning Board" tab shows calendar grid with employee rows
- Sidebar shows "Shift Planning" entry under Management section
- Sidebar entry highlights when on `/admin/shift-planning`
- Auth redirect works for non-admin users
- `npx tsc --noEmit` passes
- `cd apps/web && npm run build` succeeds (or at minimum `npx next lint` passes)

---

## Phase 6: Verification

### 6.1 TypeScript Compilation

```bash
cd apps/web && npx tsc --noEmit
```

Must pass with zero errors.

### 6.2 Lint

```bash
cd apps/web && npx next lint
```

Must pass or only have pre-existing warnings.

### 6.3 Build Test

```bash
cd apps/web && npm run build
```

Must succeed.

### 6.4 Manual Functional Testing Checklist

**Shifts Tab**:
- [ ] Page loads at `/admin/shift-planning`
- [ ] "Shifts" tab is active by default
- [ ] Create new shift with all fields (code, name, description, color, qualification, day plan)
- [ ] Shift appears in table with color swatch
- [ ] Edit shift (name, color, qualification changes reflected)
- [ ] View shift details in detail sheet
- [ ] Delete shift (confirm dialog, success)
- [ ] Delete shift that has assignments (409 error shown)
- [ ] Search filter works (code + name)
- [ ] Active only toggle filters inactive shifts
- [ ] Clear filters resets everything

**Planning Board Tab**:
- [ ] Switch to "Planning Board" tab
- [ ] Calendar grid renders with employee rows and date columns
- [ ] Week navigation (prev/next) changes date range
- [ ] View mode toggle (week/2 weeks/month) works
- [ ] Department filter narrows employee list
- [ ] Search narrows employee list
- [ ] Shift palette shows active shifts with colors
- [ ] Click empty cell -> assignment dialog opens with date pre-filled
- [ ] Create assignment via dialog -> cell updates with shift color
- [ ] Click assigned cell -> dialog opens with existing data
- [ ] Edit assignment (change dates, notes) -> updates
- [ ] Remove assignment -> cell clears
- [ ] Drag shift from palette to cell -> creates assignment

**Navigation**:
- [ ] Sidebar shows "Shift Planning" in Management section
- [ ] Clicking sidebar entry navigates to page
- [ ] Active state highlights correctly
- [ ] Non-admin users are redirected to dashboard

---

## File Summary

### New files (8)
1. `apps/web/src/hooks/api/use-shift-planning.ts`
2. `apps/web/src/components/shift-planning/index.ts`
3. `apps/web/src/components/shift-planning/shift-data-table.tsx`
4. `apps/web/src/components/shift-planning/shift-form-sheet.tsx`
5. `apps/web/src/components/shift-planning/shift-detail-sheet.tsx`
6. `apps/web/src/components/shift-planning/shift-planning-board.tsx`
7. `apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`
8. `apps/web/src/components/shift-planning/shift-palette.tsx`
9. `apps/web/src/app/[locale]/(dashboard)/admin/shift-planning/page.tsx`

### Modified files (4)
1. `apps/web/src/hooks/api/index.ts` - add shift planning exports
2. `apps/web/messages/en.json` - add nav key + shiftPlanning namespace
3. `apps/web/messages/de.json` - add nav key + shiftPlanning namespace
4. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - add nav entry + Layers icon import

### NPM dependency (1)
- `@dnd-kit/core` + `@dnd-kit/utilities` (for drag-and-drop on planning board)

---

## Implementation Order

1. **Phase 1** (API Hooks) - 10 min - Foundation, no dependencies
2. **Phase 2** (Translations) - 15 min - All translation keys needed by components
3. **Phase 3** (Shift CRUD Components) - 45 min - Data table, form sheet, detail sheet
4. **Phase 4** (Planning Board) - 60 min - Calendar grid, palette, assignment dialog, DnD
5. **Phase 5** (Page + Nav) - 20 min - Wire everything together
6. **Phase 6** (Verification) - 15 min - TypeScript, lint, build, manual test

**Total estimated effort**: ~2.5 hours

---

## Key Patterns Reference

| Pattern | Source File |
|---------|------------|
| CRUD hooks | `apps/web/src/hooks/api/use-calculation-rules.ts` |
| Hook barrel exports | `apps/web/src/hooks/api/index.ts` |
| CRUD page (single entity) | `apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx` |
| Multi-tab page | `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx` |
| Calendar grid board | `apps/web/src/components/employee-day-plans/day-plan-calendar-grid.tsx` |
| Grid toolbar | `apps/web/src/components/employee-day-plans/day-plan-grid-toolbar.tsx` |
| Grid cell | `apps/web/src/components/employee-day-plans/day-plan-cell.tsx` |
| Grid skeleton | `apps/web/src/components/employee-day-plans/day-plan-grid-skeleton.tsx` |
| Cell edit dialog | `apps/web/src/components/employee-day-plans/day-plan-cell-edit-popover.tsx` |
| Data table | `apps/web/src/components/calculation-rules/calculation-rule-data-table.tsx` |
| Form sheet | `apps/web/src/components/calculation-rules/calculation-rule-form-sheet.tsx` |
| Detail sheet | `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx` |
| Color swatch | `apps/web/src/components/absence-types/absence-type-data-table.tsx` (line 128-132) |
| Component barrel | `apps/web/src/components/calculation-rules/index.ts` |
| Sidebar nav config | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |
| Time utilities | `apps/web/src/lib/time-utils.ts` |
