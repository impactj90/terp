# Implementation Plan: ZMI-TICKET-050 - Cost Center & Employment Type CRUD UI

**Ticket:** ZMI-TICKET-050
**Date:** 2026-02-04
**Research:** `thoughts/shared/research/2026-02-04-ZMI-TICKET-050-cost-center-employment-type-crud-ui.md`

---

## Overview

Build full CRUD admin pages for Cost Centers (new page from scratch) and Employment Types (new page from scratch). Both entities already have complete backend APIs, OpenAPI specs, generated TypeScript types, and query-only API hooks. This plan adds mutation hooks, UI components (data table, form sheet, detail sheet), admin pages, navigation entries, and translations.

**Primary reference pattern:** Departments page (`adminDepartments`) -- simpler CRUD pattern without domain-specific extras like account types or tree views. The departments pattern has code, name, description, active status, and follows the exact component structure we need.

---

## Phase 1: API Mutation Hooks

### 1.1 Extend Cost Center Hooks

**File to modify:** `apps/web/src/hooks/api/use-cost-centers.ts`

Add three mutation hooks following the exact pattern from `use-holidays.ts` (lines 70-107):

```ts
import { useApiQuery, useApiMutation } from '@/hooks'  // add useApiMutation to import

// Add after existing query hooks:

export function useCreateCostCenter() {
  return useApiMutation('/cost-centers', 'post', {
    invalidateKeys: [['/cost-centers']],
  })
}

export function useUpdateCostCenter() {
  return useApiMutation('/cost-centers/{id}', 'patch', {
    invalidateKeys: [['/cost-centers']],
  })
}

export function useDeleteCostCenter() {
  return useApiMutation('/cost-centers/{id}', 'delete', {
    invalidateKeys: [['/cost-centers']],
  })
}
```

### 1.2 Extend Employment Type Hooks

**File to modify:** `apps/web/src/hooks/api/use-employment-types.ts`

Same pattern -- add `useApiMutation` import and three mutation hooks:

```ts
import { useApiQuery, useApiMutation } from '@/hooks'  // add useApiMutation to import

export function useCreateEmploymentType() {
  return useApiMutation('/employment-types', 'post', {
    invalidateKeys: [['/employment-types']],
  })
}

export function useUpdateEmploymentType() {
  return useApiMutation('/employment-types/{id}', 'patch', {
    invalidateKeys: [['/employment-types']],
  })
}

export function useDeleteEmploymentType() {
  return useApiMutation('/employment-types/{id}', 'delete', {
    invalidateKeys: [['/employment-types']],
  })
}
```

### 1.3 Update Hooks Index

**File to modify:** `apps/web/src/hooks/api/index.ts`

Update the Cost Centers export block (currently line 137) to include the new mutation hooks:

```ts
// Cost Centers
export {
  useCostCenters,
  useCostCenter,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
} from './use-cost-centers'

// Employment Types
export {
  useEmploymentTypes,
  useEmploymentType,
  useCreateEmploymentType,
  useUpdateEmploymentType,
  useDeleteEmploymentType,
} from './use-employment-types'
```

### Phase 1 Verification

- TypeScript compiles without errors (`npx tsc --noEmit` from `apps/web/`)
- Hooks export correctly (check barrel exports resolve)

---

## Phase 2: Cost Center Components

Create 4 files in `apps/web/src/components/cost-centers/`.

### 2.1 Barrel Export

**File to create:** `apps/web/src/components/cost-centers/index.ts`

Follow exact pattern from `apps/web/src/components/accounts/index.ts`:

```ts
export { CostCenterDataTable } from './cost-center-data-table'
export { CostCenterFormSheet } from './cost-center-form-sheet'
export { CostCenterDetailSheet } from './cost-center-detail-sheet'
```

### 2.2 Data Table

**File to create:** `apps/web/src/components/cost-centers/cost-center-data-table.tsx`

Follow the pattern from `apps/web/src/components/departments/department-data-table.tsx` (simpler than accounts since cost centers have no special type config).

**Structure:**

```tsx
'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Trash2, Landmark } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type CostCenter = components['schemas']['CostCenter']

interface CostCenterDataTableProps {
  items: CostCenter[]
  isLoading: boolean
  onView: (item: CostCenter) => void
  onEdit: (item: CostCenter) => void
  onDelete: (item: CostCenter) => void
}
```

**Columns:** Code (font-mono), Name (with Landmark icon in rounded bg-muted div), Description (truncated, text-muted-foreground), Status (Badge active/inactive), Actions (dropdown with View, Edit, separator, Delete destructive).

**Key behaviors:**
- Translation namespace: `adminCostCenters`
- Row click triggers `onView`
- Action cell has `onClick={(e) => e.stopPropagation()}`
- Skeleton component `CostCenterDataTableSkeleton` with 5 placeholder rows
- Return null if `items.length === 0`

### 2.3 Form Sheet

**File to create:** `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`

Follow the pattern from `apps/web/src/components/departments/department-form-sheet.tsx` (simplify by removing parent selector).

**Props interface:**

```tsx
interface CostCenterFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  costCenter?: CostCenter | null    // null = create, defined = edit
  onSuccess?: () => void
}
```

**Form state:**

```tsx
interface FormState {
  code: string
  name: string
  description: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  isActive: true,
}
```

**Form fields:**
1. Section "Basic Information" (`sectionBasicInfo`):
   - Code (Input, required, maxLength=50, uppercase transform like departments, disabled when editing)
   - Name (Input, required, maxLength=255)
   - Description (Textarea, optional, rows=3)
2. Section "Status" (`sectionStatus`) - only visible when editing:
   - Active (Switch with description about inactive being hidden from dropdowns)

**Submit logic:**
- Validation: code required, name required
- Create: `useCreateCostCenter` with `body: { code, name, description? }`
- Update: `useUpdateCostCenter` with `path: { id }` and `body: { name, description?, is_active }`
- Error handling: catch API error, display `detail` or `message` or fallback translation
- Special handling for 409: display the error detail which says "Code already exists"

**Layout:**
- Sheet side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col"
- SheetHeader with title/description (conditional on isEdit)
- ScrollArea with form content
- SheetFooter with Cancel + Submit buttons (flex-row gap-2 border-t pt-4)

### 2.4 Detail Sheet

**File to create:** `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx`

Follow the pattern from `apps/web/src/components/departments/department-detail-sheet.tsx`.

**Props interface:**

```tsx
interface CostCenterDetailSheetProps {
  costCenterId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (costCenter: CostCenter) => void
  onDelete: (costCenter: CostCenter) => void
}
```

**Content sections:**
1. Header with Landmark icon (h-12 w-12 rounded-lg bg-muted), name, code (font-mono), and status Badge
2. Description section (only if description exists)
3. Details section (rounded-lg border p-4): DetailRow for Code, Name
4. Timestamps section: Created, Last Updated (format: `dd.MM.yyyy HH:mm`)

**Footer:** Close button (flex-1), Edit button (outline), Delete button (destructive)

**DetailRow helper:** Inline function, flex justify-between py-2 border-b last:border-b-0, label muted + value font-medium.

**Data fetching:** `useCostCenter(costCenterId || '', open && !!costCenterId)` -- only fetches when sheet is open with valid ID.

### Phase 2 Verification

- All 4 files created in `apps/web/src/components/cost-centers/`
- TypeScript compiles without errors
- Imports resolve correctly from barrel export

---

## Phase 3: Cost Center Admin Page

**File to create:** `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx`

Follow the pattern from `apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx` but simpler (no tree view, no parent hierarchy, no active filter dropdown -- just search + table).

**Structure:**

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Landmark, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useCostCenters, useDeleteCostCenter } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CostCenterDataTable, CostCenterFormSheet, CostCenterDetailSheet } from '@/components/cost-centers'
import type { components } from '@/lib/api/types'

type CostCenter = components['schemas']['CostCenter']
```

**State management:**

```tsx
const [search, setSearch] = React.useState('')
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<CostCenter | null>(null)
const [viewItem, setViewItem] = React.useState<CostCenter | null>(null)
const [deleteItem, setDeleteItem] = React.useState<CostCenter | null>(null)
```

**Data fetching:**

```tsx
const { data: costCentersData, isLoading } = useCostCenters({ enabled: !authLoading && isAdmin })
const deleteMutation = useDeleteCostCenter()
const costCenters = costCentersData?.data ?? []
```

**Client-side filtering:**

```tsx
const filteredItems = React.useMemo(() => {
  if (!search.trim()) return costCenters
  const searchLower = search.toLowerCase()
  return costCenters.filter(
    (cc) =>
      cc.code.toLowerCase().includes(searchLower) ||
      cc.name.toLowerCase().includes(searchLower)
  )
}, [costCenters, search])
```

**Handlers:** `handleView`, `handleEdit`, `handleDelete`, `handleConfirmDelete`, `handleFormSuccess` -- exact same pattern as departments.

**handleConfirmDelete special handling:**
```tsx
const handleConfirmDelete = async () => {
  if (!deleteItem) return
  try {
    await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
    setDeleteItem(null)
  } catch {
    // Error handled by mutation
  }
}
```

**Render structure:**
1. Auth loading skeleton (`CostCentersPageSkeleton`)
2. Not admin guard (return null after redirect)
3. Page header: title + subtitle + "New Cost Center" button
4. Filters bar: SearchInput + clear filters button
5. Item count text (muted, `t('countSingular')` / `t('countPlural')`)
6. Card with CardContent p-0:
   - Loading: Skeleton h-96
   - Empty + no filters: EmptyState with Landmark icon
   - Empty + has filters: EmptyState with filter hint
   - Has data: `<CostCenterDataTable items={filteredItems} ... />`
7. `<CostCenterFormSheet>` -- open when createOpen or editItem
8. `<CostCenterDetailSheet>` -- open when viewItem
9. `<ConfirmDialog>` -- open when deleteItem, with delete warning about assigned employees

**ConfirmDialog description for delete:**
```tsx
description={
  deleteItem
    ? t('deleteDescription', { name: deleteItem.name })
    : ''
}
```

**EmptyState component:** Inline function component with Landmark icon, same structure as departments page.

**PageSkeleton component:** Inline function component with header + filters + content skeletons.

### Phase 3 Verification

- Page renders at `/admin/cost-centers` route
- Create, view, edit, delete flows all work
- Search filtering works on code and name
- Auth guard redirects non-admin users

---

## Phase 4: Employment Type Components

Create 4 files in `apps/web/src/components/employment-types/`.

### 4.1 Barrel Export

**File to create:** `apps/web/src/components/employment-types/index.ts`

```ts
export { EmploymentTypeDataTable } from './employment-type-data-table'
export { EmploymentTypeFormSheet } from './employment-type-form-sheet'
export { EmploymentTypeDetailSheet } from './employment-type-detail-sheet'
```

### 4.2 Data Table

**File to create:** `apps/web/src/components/employment-types/employment-type-data-table.tsx`

Same structure as `cost-center-data-table.tsx` but with different columns.

**Type:**
```tsx
type EmploymentType = components['schemas']['EmploymentType']
```

**Props:**
```tsx
interface EmploymentTypeDataTableProps {
  items: EmploymentType[]
  isLoading: boolean
  onView: (item: EmploymentType) => void
  onEdit: (item: EmploymentType) => void
  onDelete: (item: EmploymentType) => void
}
```

**Columns:** Code (font-mono), Name (with Briefcase icon), Weekly Hours (formatted as `default_weekly_hours` with "hrs/week" suffix, text-muted-foreground), Status (Badge), Actions (dropdown).

**Weekly hours display:**
```tsx
<TableCell className="text-sm text-muted-foreground">
  {item.default_weekly_hours != null
    ? `${Number(item.default_weekly_hours).toFixed(2)} ${t('hrsPerWeek')}`
    : '-'}
</TableCell>
```

Translation namespace: `adminEmploymentTypes`.

### 4.3 Form Sheet

**File to create:** `apps/web/src/components/employment-types/employment-type-form-sheet.tsx`

Follow same pattern as cost center form sheet with different fields.

**Form state:**
```tsx
interface FormState {
  code: string
  name: string
  description: string
  defaultWeeklyHours: string  // stored as string for input, parsed to number on submit
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  defaultWeeklyHours: '40.00',
  isActive: true,
}
```

**Form fields:**
1. Section "Basic Information":
   - Code (Input, required, maxLength=20, uppercase, disabled on edit)
   - Name (Input, required, maxLength=255)
   - Description (Textarea, optional, rows=3)
2. Section "Configuration" (`sectionConfiguration`):
   - Default Weekly Hours (Input type="number", step="0.01", min="0", max="168", placeholder="40.00")
3. Section "Status" (edit only):
   - Active switch

**Submit body for create:**
```tsx
body: {
  code: form.code.trim(),
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  default_weekly_hours: form.defaultWeeklyHours ? parseFloat(form.defaultWeeklyHours) : undefined,
}
```

**Submit body for update:**
```tsx
body: {
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  default_weekly_hours: form.defaultWeeklyHours ? parseFloat(form.defaultWeeklyHours) : undefined,
  is_active: form.isActive,
}
```

**Reset form on edit:**
```tsx
setForm({
  code: employmentType.code || '',
  name: employmentType.name || '',
  description: employmentType.description || '',
  defaultWeeklyHours: employmentType.default_weekly_hours != null
    ? Number(employmentType.default_weekly_hours).toFixed(2)
    : '40.00',
  isActive: employmentType.is_active ?? true,
})
```

### 4.4 Detail Sheet

**File to create:** `apps/web/src/components/employment-types/employment-type-detail-sheet.tsx`

Same pattern as cost center detail sheet but with different fields.

**Type:**
```tsx
type EmploymentType = components['schemas']['EmploymentType']
```

**Content sections:**
1. Header with Briefcase icon, name, code, status badge
2. Description section (if exists)
3. Details section: DetailRow for Code, Name
4. Configuration section: DetailRow for Default Weekly Hours (formatted with 2 decimal places + " hrs/week")
5. Timestamps section: Created, Last Updated

**Data fetching:** `useEmploymentType(employmentTypeId || '', open && !!employmentTypeId)`

### Phase 4 Verification

- All 4 files created in `apps/web/src/components/employment-types/`
- TypeScript compiles without errors
- Barrel imports resolve

---

## Phase 5: Employment Type Admin Page

**File to create:** `apps/web/src/app/[locale]/(dashboard)/admin/employment-types/page.tsx`

Follow the same structure as the cost center page (Phase 3) with these differences:

- Translation namespace: `adminEmploymentTypes`
- Type: `EmploymentType` from `components['schemas']['EmploymentType']`
- Icon: `Briefcase` (instead of `Landmark`)
- Hooks: `useEmploymentTypes`, `useDeleteEmploymentType`
- Components: `EmploymentTypeDataTable`, `EmploymentTypeFormSheet`, `EmploymentTypeDetailSheet`
- Filter: search on code and name
- Data extraction: `employmentTypesData?.data ?? []`

Everything else is identical in structure.

### Phase 5 Verification

- Page renders at `/admin/employment-types` route
- Full CRUD flows work
- Weekly hours display correctly in table and detail view
- Auth guard works

---

## Phase 6: Navigation & Breadcrumbs

### 6.1 Add Cost Centers to Sidebar

**File to modify:** `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add `Landmark` to the lucide-react imports at the top of the file:

```ts
import {
  // ... existing imports
  Landmark,
} from 'lucide-react'
```

Add cost centers entry in the `management` section, after the `departments` entry (line 137) and before the `employmentTypes` entry (line 139). This groups related organizational entities together:

```ts
{
  titleKey: 'costCenters',
  href: '/admin/cost-centers',
  icon: Landmark,
  roles: ['admin'],
},
```

The employment types entry already exists at line 139-143 -- no change needed.

### 6.2 Add Cost Centers to Breadcrumbs

**File to modify:** `apps/web/src/components/layout/breadcrumbs.tsx`

Add to the `segmentToKey` mapping (around line 29, after `'employment-types': 'employmentTypes'`):

```ts
'cost-centers': 'costCenters',
```

The `'employment-types': 'employmentTypes'` mapping already exists at line 29.

### Phase 6 Verification

- Cost Centers appears in sidebar under Management section (between Departments and Employment Types)
- Breadcrumbs show "Home > Administration > Cost Centers" when on the cost centers page
- Employment Types breadcrumbs still work correctly

---

## Phase 7: Translations

### 7.1 English Translations (en.json)

**File to modify:** `apps/web/messages/en.json`

#### 7.1.1 Add nav key for Cost Centers

In the `"nav"` section (around line 69, after `"employmentTypes": "Employment Types"`):

```json
"costCenters": "Cost Centers",
```

#### 7.1.2 Add breadcrumbs key for Cost Centers

In the `"breadcrumbs"` section (around line 160, after `"employmentTypes": "Employment Types"`):

```json
"costCenters": "Cost Centers",
```

#### 7.1.3 Add adminCostCenters namespace

Add a new top-level namespace `"adminCostCenters"` (place it near `"adminDepartments"` for logical grouping):

```json
"adminCostCenters": {
  "title": "Cost Centers",
  "subtitle": "Manage cost centers for time and cost allocation",
  "newCostCenter": "New Cost Center",
  "searchPlaceholder": "Search cost centers...",
  "clearFilters": "Clear filters",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Description",
  "columnStatus": "Status",
  "columnActions": "Actions",
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "viewDetails": "View Details",
  "edit": "Edit",
  "delete": "Delete",
  "editCostCenter": "Edit Cost Center",
  "createDescription": "Add a new cost center.",
  "editDescription": "Modify cost center details.",
  "costCenterDetails": "Cost Center Details",
  "viewCostCenterInfo": "View cost center information.",
  "sectionBasicInfo": "Basic Information",
  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Description",
  "codePlaceholder": "e.g. DEV-001",
  "codeHint": "Unique code (uppercase, max 50 chars)",
  "namePlaceholder": "e.g. Development",
  "descriptionPlaceholder": "Optional description...",
  "validationCodeRequired": "Code is required",
  "validationNameRequired": "Name is required",
  "validationCodeMaxLength": "Code must be at most 50 characters",
  "sectionStatus": "Status",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive cost centers are hidden from dropdowns",
  "cancel": "Cancel",
  "close": "Close",
  "saveChanges": "Save Changes",
  "create": "Create",
  "saving": "Saving...",
  "failedCreate": "Failed to create cost center",
  "failedUpdate": "Failed to update cost center",
  "deleteCostCenter": "Delete Cost Center",
  "deleteDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone. If employees are assigned to this cost center, consider deactivating instead.",
  "detailsSection": "Details",
  "timestampsSection": "Timestamps",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",
  "emptyTitle": "No cost centers found",
  "emptyFilterHint": "Try adjusting your search",
  "emptyGetStarted": "Get started by creating your first cost center",
  "addCostCenter": "Add Cost Center",
  "countSingular": "{count} cost center",
  "countPlural": "{count} cost centers"
}
```

#### 7.1.4 Add adminEmploymentTypes namespace

Add a new top-level namespace `"adminEmploymentTypes"`:

```json
"adminEmploymentTypes": {
  "title": "Employment Types",
  "subtitle": "Manage employment types and their default configurations",
  "newEmploymentType": "New Employment Type",
  "searchPlaceholder": "Search employment types...",
  "clearFilters": "Clear filters",
  "columnCode": "Code",
  "columnName": "Name",
  "columnWeeklyHours": "Weekly Hours",
  "columnStatus": "Status",
  "columnActions": "Actions",
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "hrsPerWeek": "hrs/week",
  "viewDetails": "View Details",
  "edit": "Edit",
  "delete": "Delete",
  "editEmploymentType": "Edit Employment Type",
  "createDescription": "Add a new employment type.",
  "editDescription": "Modify employment type details.",
  "employmentTypeDetails": "Employment Type Details",
  "viewEmploymentTypeInfo": "View employment type information.",
  "sectionBasicInfo": "Basic Information",
  "sectionConfiguration": "Configuration",
  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Description",
  "fieldDefaultWeeklyHours": "Default Weekly Hours",
  "codePlaceholder": "e.g. FT",
  "codeHint": "Unique code (uppercase, max 20 chars)",
  "namePlaceholder": "e.g. Full-time",
  "descriptionPlaceholder": "Optional description...",
  "weeklyHoursPlaceholder": "40.00",
  "weeklyHoursHint": "Default weekly working hours for this employment type",
  "validationCodeRequired": "Code is required",
  "validationNameRequired": "Name is required",
  "validationCodeMaxLength": "Code must be at most 20 characters",
  "sectionStatus": "Status",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive employment types are hidden from dropdowns",
  "cancel": "Cancel",
  "close": "Close",
  "saveChanges": "Save Changes",
  "create": "Create",
  "saving": "Saving...",
  "failedCreate": "Failed to create employment type",
  "failedUpdate": "Failed to update employment type",
  "deleteEmploymentType": "Delete Employment Type",
  "deleteDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone. If employees are assigned to this type, consider deactivating instead.",
  "detailsSection": "Details",
  "timestampsSection": "Timestamps",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",
  "emptyTitle": "No employment types found",
  "emptyFilterHint": "Try adjusting your search",
  "emptyGetStarted": "Get started by creating your first employment type",
  "addEmploymentType": "Add Employment Type",
  "countSingular": "{count} employment type",
  "countPlural": "{count} employment types"
}
```

### 7.2 German Translations (de.json)

**File to modify:** `apps/web/messages/de.json`

#### 7.2.1 Nav key

In `"nav"` section (after `"employmentTypes": "Beschäftigungsarten"`):

```json
"costCenters": "Kostenstellen",
```

#### 7.2.2 Breadcrumbs key

In `"breadcrumbs"` section (after `"employmentTypes": "Beschäftigungsarten"`):

```json
"costCenters": "Kostenstellen",
```

#### 7.2.3 adminCostCenters namespace

```json
"adminCostCenters": {
  "title": "Kostenstellen",
  "subtitle": "Kostenstellen für Zeit- und Kostenzuordnung verwalten",
  "newCostCenter": "Neue Kostenstelle",
  "searchPlaceholder": "Kostenstellen suchen...",
  "clearFilters": "Filter zurücksetzen",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Beschreibung",
  "columnStatus": "Status",
  "columnActions": "Aktionen",
  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "viewDetails": "Details anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen",
  "editCostCenter": "Kostenstelle bearbeiten",
  "createDescription": "Eine neue Kostenstelle hinzufügen.",
  "editDescription": "Kostenstellendetails ändern.",
  "costCenterDetails": "Kostenstellendetails",
  "viewCostCenterInfo": "Kostenstelleninformationen anzeigen.",
  "sectionBasicInfo": "Grundinformationen",
  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Beschreibung",
  "codePlaceholder": "z.B. DEV-001",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 50 Zeichen)",
  "namePlaceholder": "z.B. Entwicklung",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "validationCodeRequired": "Code ist erforderlich",
  "validationNameRequired": "Name ist erforderlich",
  "validationCodeMaxLength": "Code darf maximal 50 Zeichen lang sein",
  "sectionStatus": "Status",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Kostenstellen werden in Auswahllisten ausgeblendet",
  "cancel": "Abbrechen",
  "close": "Schließen",
  "saveChanges": "Änderungen speichern",
  "create": "Erstellen",
  "saving": "Speichern...",
  "failedCreate": "Kostenstelle konnte nicht erstellt werden",
  "failedUpdate": "Kostenstelle konnte nicht aktualisiert werden",
  "deleteCostCenter": "Kostenstelle löschen",
  "deleteDescription": "Sind Sie sicher, dass Sie \"{name}\" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden. Falls Mitarbeiter dieser Kostenstelle zugeordnet sind, erwägen Sie stattdessen die Deaktivierung.",
  "detailsSection": "Details",
  "timestampsSection": "Zeitstempel",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",
  "emptyTitle": "Keine Kostenstellen gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Suche anzupassen",
  "emptyGetStarted": "Beginnen Sie mit der Erstellung Ihrer ersten Kostenstelle",
  "addCostCenter": "Kostenstelle hinzufügen",
  "countSingular": "{count} Kostenstelle",
  "countPlural": "{count} Kostenstellen"
}
```

#### 7.2.4 adminEmploymentTypes namespace

```json
"adminEmploymentTypes": {
  "title": "Beschäftigungsarten",
  "subtitle": "Beschäftigungsarten und deren Standardkonfigurationen verwalten",
  "newEmploymentType": "Neue Beschäftigungsart",
  "searchPlaceholder": "Beschäftigungsarten suchen...",
  "clearFilters": "Filter zurücksetzen",
  "columnCode": "Code",
  "columnName": "Name",
  "columnWeeklyHours": "Wochenstunden",
  "columnStatus": "Status",
  "columnActions": "Aktionen",
  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "hrsPerWeek": "Std./Woche",
  "viewDetails": "Details anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen",
  "editEmploymentType": "Beschäftigungsart bearbeiten",
  "createDescription": "Eine neue Beschäftigungsart hinzufügen.",
  "editDescription": "Beschäftigungsartdetails ändern.",
  "employmentTypeDetails": "Beschäftigungsartdetails",
  "viewEmploymentTypeInfo": "Beschäftigungsartinformationen anzeigen.",
  "sectionBasicInfo": "Grundinformationen",
  "sectionConfiguration": "Konfiguration",
  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldDescription": "Beschreibung",
  "fieldDefaultWeeklyHours": "Standard-Wochenstunden",
  "codePlaceholder": "z.B. VZ",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 20 Zeichen)",
  "namePlaceholder": "z.B. Vollzeit",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "weeklyHoursPlaceholder": "40,00",
  "weeklyHoursHint": "Standard-Wochenarbeitszeit für diese Beschäftigungsart",
  "validationCodeRequired": "Code ist erforderlich",
  "validationNameRequired": "Name ist erforderlich",
  "validationCodeMaxLength": "Code darf maximal 20 Zeichen lang sein",
  "sectionStatus": "Status",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Beschäftigungsarten werden in Auswahllisten ausgeblendet",
  "cancel": "Abbrechen",
  "close": "Schließen",
  "saveChanges": "Änderungen speichern",
  "create": "Erstellen",
  "saving": "Speichern...",
  "failedCreate": "Beschäftigungsart konnte nicht erstellt werden",
  "failedUpdate": "Beschäftigungsart konnte nicht aktualisiert werden",
  "deleteEmploymentType": "Beschäftigungsart löschen",
  "deleteDescription": "Sind Sie sicher, dass Sie \"{name}\" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden. Falls Mitarbeiter diesem Typ zugeordnet sind, erwägen Sie stattdessen die Deaktivierung.",
  "detailsSection": "Details",
  "timestampsSection": "Zeitstempel",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",
  "emptyTitle": "Keine Beschäftigungsarten gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Suche anzupassen",
  "emptyGetStarted": "Beginnen Sie mit der Erstellung Ihrer ersten Beschäftigungsart",
  "addEmploymentType": "Beschäftigungsart hinzufügen",
  "countSingular": "{count} Beschäftigungsart",
  "countPlural": "{count} Beschäftigungsarten"
}
```

### Phase 7 Verification

- No JSON parse errors in either en.json or de.json
- All translation keys used in components exist in both files
- Pages render correctly in English
- Switching locale to German shows German labels

---

## Complete File Summary

### Files to Create (10 files)

| # | File Path | Purpose |
|---|-----------|---------|
| 1 | `apps/web/src/components/cost-centers/index.ts` | Barrel exports |
| 2 | `apps/web/src/components/cost-centers/cost-center-data-table.tsx` | Data table with skeleton |
| 3 | `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx` | Create/edit form sheet |
| 4 | `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx` | Detail view sheet |
| 5 | `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` | Cost centers admin page |
| 6 | `apps/web/src/components/employment-types/index.ts` | Barrel exports |
| 7 | `apps/web/src/components/employment-types/employment-type-data-table.tsx` | Data table with skeleton |
| 8 | `apps/web/src/components/employment-types/employment-type-form-sheet.tsx` | Create/edit form sheet |
| 9 | `apps/web/src/components/employment-types/employment-type-detail-sheet.tsx` | Detail view sheet |
| 10 | `apps/web/src/app/[locale]/(dashboard)/admin/employment-types/page.tsx` | Employment types admin page |

### Files to Modify (7 files)

| # | File Path | Change |
|---|-----------|--------|
| 1 | `apps/web/src/hooks/api/use-cost-centers.ts` | Add 3 mutation hooks |
| 2 | `apps/web/src/hooks/api/use-employment-types.ts` | Add 3 mutation hooks |
| 3 | `apps/web/src/hooks/api/index.ts` | Export 6 new hooks |
| 4 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add cost centers nav item + Landmark import |
| 5 | `apps/web/src/components/layout/breadcrumbs.tsx` | Add cost-centers segment mapping |
| 6 | `apps/web/messages/en.json` | Add nav/breadcrumb keys + 2 admin namespaces |
| 7 | `apps/web/messages/de.json` | Add nav/breadcrumb keys + 2 admin namespaces |

---

## Success Criteria

1. **Cost Centers page** at `/admin/cost-centers`:
   - Lists all cost centers in a data table (code, name, description, status)
   - "New Cost Center" button opens form sheet for creation
   - Row click opens detail sheet
   - Actions dropdown: View Details, Edit, Delete
   - Edit opens form sheet pre-filled with entity data
   - Delete shows confirmation dialog with employee assignment warning
   - Search filters by code and name
   - Non-admin users are redirected to dashboard

2. **Employment Types page** at `/admin/employment-types`:
   - Lists all employment types in a data table (code, name, weekly hours, status)
   - Weekly hours displayed as "XX.XX hrs/week"
   - Same CRUD flows as cost centers
   - Default weekly hours field (decimal input) in create/edit form

3. **Navigation:**
   - Cost Centers appears in sidebar under Management (between Departments and Employment Types)
   - Employment Types already in sidebar -- unchanged
   - Breadcrumbs work correctly for both pages

4. **Error handling:**
   - 409 duplicate code errors show the backend error message inline
   - Delete failure (e.g., employees assigned) shows error from backend
   - Form validation catches missing required fields before API call

5. **Translations:**
   - All UI text uses translation keys (no hardcoded strings)
   - Both English and German translations are complete

6. **TypeScript:**
   - Project compiles with no type errors
   - All components use `components['schemas']` types from `@/lib/api/types`

---

## Reference Files (for pattern copying)

| Pattern | Reference File |
|---------|---------------|
| API mutation hooks | `apps/web/src/hooks/api/use-holidays.ts` (lines 70-107) |
| Hook barrel exports | `apps/web/src/hooks/api/index.ts` |
| Data table component | `apps/web/src/components/departments/department-data-table.tsx` |
| Form sheet component | `apps/web/src/components/departments/department-form-sheet.tsx` |
| Detail sheet component | `apps/web/src/components/departments/department-detail-sheet.tsx` |
| Component barrel exports | `apps/web/src/components/accounts/index.ts` |
| Admin page (simpler) | `apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx` |
| Admin page (full) | `apps/web/src/app/[locale]/(dashboard)/admin/holidays/page.tsx` |
| Sidebar config | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |
| Breadcrumbs config | `apps/web/src/components/layout/breadcrumbs.tsx` |
| Translation pattern | `apps/web/messages/en.json` ("adminDepartments" namespace, line 1374) |
| German translation pattern | `apps/web/messages/de.json` ("adminDepartments" namespace, line 1374) |
