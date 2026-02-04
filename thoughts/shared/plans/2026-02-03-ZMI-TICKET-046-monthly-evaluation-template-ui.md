# Monthly Evaluation Template UI Implementation Plan

## Overview

Implement a CRUD admin page for monthly evaluation templates. Templates define flextime caps, overtime thresholds, and vacation carryover limits. One template can be set as the tenant default. The backend already exists (ZMI-TICKET-016). This plan covers the full frontend: API hooks, data table, form sheet, detail sheet, delete dialog, page component, navigation, and translations.

## Current State Analysis

- **Backend**: Fully implemented with 7 endpoints at `/monthly-evaluations` (list, create, get, update, delete, get-default, set-default)
- **TypeScript types**: Generated and available in `apps/web/src/lib/api/types.ts` (lines 2551-2626, 8398-8456)
- **Existing viewer**: `apps/web/src/components/monthly-evaluation/` (singular) contains the employee-facing monthly evaluation viewer -- NOT template CRUD
- **Time utilities**: `formatDuration` in `apps/web/src/lib/time-utils.ts` already handles minutes-to-hours display (e.g., `formatDuration(510)` => `"8h 30m"`)
- **No existing hooks**: No API hooks exist yet for the `/monthly-evaluations` endpoints

### Key Discoveries:
- The `monthly-evaluation` (singular) directory and routes are for the employee-facing viewer; the new admin CRUD must use `monthly-evaluations` (plural) to avoid collisions
- `ConfirmDialog` component uses `Sheet` with `side="bottom"` -- can be reused for both delete and set-default confirmations
- `useApiMutation` supports `post` method for non-body endpoints like `set-default` (path params only)
- The `is_default` and `is_active` fields are `boolean` (required) on `MonthlyEvaluation`, but `is_default: boolean` (with `@default false`) and `is_active: boolean` (with `@default true`) on `CreateMonthlyEvaluationRequest`
- Delete returns 409 if trying to delete the default template -- error handling pattern is already established in export-interfaces page

## Desired End State

A fully functional admin page at `/admin/monthly-evaluations` where admins can:
1. View all monthly evaluation templates in a sortable, filterable table
2. Create new templates with flextime caps, overtime threshold, vacation carryover configuration
3. Edit existing templates
4. Set any active template as the tenant default
5. Delete non-default templates (with 409 protection for the default)
6. See all minute-based values formatted as human-readable duration (e.g., "8h 30m")
7. Navigate to the page via sidebar, with proper breadcrumbs

### Verification:
- Page renders at `/admin/monthly-evaluations` with skeleton while loading
- Table displays templates with correct columns and formatting
- Create/edit form works with validation
- Set-default action works with confirmation dialog
- Delete works for non-default templates, shows error for default
- Non-admin users are redirected to dashboard
- `npm run build` passes (Next.js compilation)
- Both EN and DE translations are complete

## What We're NOT Doing

- Monthly value calculation logic (ZMI-TICKET-043)
- Per-employee template assignment
- Account column configuration for templates
- Backend changes (backend is complete from ZMI-TICKET-016)
- Component tests (can be added as a follow-up)

## Implementation Approach

Follow the established admin CRUD pattern exactly as used by export-interfaces. Create files in this order: hooks first (data layer), then components (UI layer), then page (orchestration), then navigation/translations (integration). Each phase is independently verifiable.

---

## Phase 1: API Hooks

### Overview
Create the API hooks file for all monthly evaluation endpoints and register them in the hooks index.

### Changes Required:

#### 1. Create hooks file
**File**: `apps/web/src/hooks/api/use-monthly-evaluations.ts` (NEW)

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseMonthlyEvaluationsOptions {
  isActive?: boolean
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch list of monthly evaluation templates.
 */
export function useMonthlyEvaluations(options: UseMonthlyEvaluationsOptions = {}) {
  const { isActive, limit, cursor, enabled = true } = options
  return useApiQuery('/monthly-evaluations', {
    params: {
      is_active: isActive,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single monthly evaluation template by ID.
 */
export function useMonthlyEvaluation(id: string, enabled = true) {
  return useApiQuery('/monthly-evaluations/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch the default monthly evaluation template.
 */
export function useDefaultMonthlyEvaluation(enabled = true) {
  return useApiQuery('/monthly-evaluations/default', {
    enabled,
  })
}

/**
 * Hook to create a new monthly evaluation template.
 */
export function useCreateMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations', 'post', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/default'],
    ],
  })
}

/**
 * Hook to update an existing monthly evaluation template.
 */
export function useUpdateMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations/{id}', 'put', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/{id}'],
      ['/monthly-evaluations/default'],
    ],
  })
}

/**
 * Hook to delete a monthly evaluation template.
 */
export function useDeleteMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations/{id}', 'delete', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/{id}'],
    ],
  })
}

/**
 * Hook to set a monthly evaluation template as the default.
 */
export function useSetDefaultMonthlyEvaluation() {
  return useApiMutation('/monthly-evaluations/{id}/set-default', 'post', {
    invalidateKeys: [
      ['/monthly-evaluations'],
      ['/monthly-evaluations/default'],
      ['/monthly-evaluations/{id}'],
    ],
  })
}
```

**Pattern reference**: `apps/web/src/hooks/api/use-export-interfaces.ts`

Key details:
- `useMonthlyEvaluations` takes optional `isActive`, `limit`, `cursor` query params matching the API spec
- `useSetDefaultMonthlyEvaluation` is a POST mutation with only path params (no body) -- this works because `useApiMutation` handles `body?: undefined` gracefully
- Invalidation keys include `/monthly-evaluations/default` on create/update/set-default since any of these can change the default

#### 2. Register in hooks index
**File**: `apps/web/src/hooks/api/index.ts` (MODIFY)

Add at the end of the file, before the closing:

```typescript
// Monthly Evaluation Templates (admin CRUD)
export {
  useMonthlyEvaluations,
  useMonthlyEvaluation,
  useDefaultMonthlyEvaluation,
  useCreateMonthlyEvaluation,
  useUpdateMonthlyEvaluation,
  useDeleteMonthlyEvaluation,
  useSetDefaultMonthlyEvaluation,
} from './use-monthly-evaluations'
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `apps/web/src/hooks/api/use-monthly-evaluations.ts`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Hooks are exported from index: grep for `useMonthlyEvaluations` in `apps/web/src/hooks/api/index.ts`

#### Manual Verification:
- [ ] N/A (hooks are verified through compilation)

---

## Phase 2: Data Table Component

### Overview
Create the data table component that displays monthly evaluation templates with columns for name, description, flextime caps, overtime threshold, max vacation carryover, default badge, active badge, and actions dropdown.

### Changes Required:

#### 1. Create data table component
**File**: `apps/web/src/components/monthly-evaluations/monthly-evaluation-data-table.tsx` (NEW)

```typescript
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']
```

Props interface:
```typescript
interface MonthlyEvaluationDataTableProps {
  items: MonthlyEvaluation[]
  isLoading: boolean
  onView: (item: MonthlyEvaluation) => void
  onEdit: (item: MonthlyEvaluation) => void
  onSetDefault: (item: MonthlyEvaluation) => void
  onDelete: (item: MonthlyEvaluation) => void
}
```

Implementation details:
- **Columns**: Name, Description (truncated), Flextime Cap (+), Flextime Cap (-), Overtime Threshold, Max Vacation Carryover, Default, Status, Actions
- **Default column**: Show `<Star className="h-4 w-4 text-amber-500 fill-amber-500" />` for the default template, empty for non-default
- **Minute-based values**: Use `formatDuration(value)` from `@/lib/time-utils` for `flextime_cap_positive`, `flextime_cap_negative`, `overtime_threshold`. Show `'-'` if undefined/null/0.
- **Max Vacation Carryover**: Display as `"{value} d"` (days), not minutes. Show `'-'` if undefined/null.
- **Status badge**: `<Badge variant={item.is_active ? 'default' : 'secondary'}>`
- **Actions dropdown**: View Details, Edit, Set as Default (only for non-default active items), separator, Delete
- **Default row highlight**: Add `className={item.is_default ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}` to the TableRow
- **Skeleton**: Include `MonthlyEvaluationDataTableSkeleton` inline function matching the export-interfaces pattern (Table with Skeleton cells, 5 rows)

**Pattern reference**: `apps/web/src/components/export-interfaces/export-interface-data-table.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `apps/web/src/components/monthly-evaluations/monthly-evaluation-data-table.tsx`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Table renders with correct columns
- [ ] Default template shows star icon and subtle background highlight
- [ ] Minute values display in "Xh Ym" format
- [ ] "Set as Default" only appears for non-default active templates

---

## Phase 3: Form Sheet Component

### Overview
Create the form sheet component for creating and editing monthly evaluation templates. The form includes special handling for minute-based fields (showing formatted duration next to input) and a warning when setting as default.

### Changes Required:

#### 1. Create form sheet component
**File**: `apps/web/src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx` (NEW)

Props interface:
```typescript
interface MonthlyEvaluationFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: MonthlyEvaluation | null  // null = create, populated = edit
  onSuccess?: () => void
}
```

FormState interface:
```typescript
interface FormState {
  name: string
  description: string
  flextimeCapPositive: number | ''
  flextimeCapNegative: number | ''
  overtimeThreshold: number | ''
  maxCarryoverVacation: number | ''
  isDefault: boolean
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  flextimeCapPositive: '',
  flextimeCapNegative: '',
  overtimeThreshold: '',
  maxCarryoverVacation: '',
  isDefault: false,
  isActive: true,
}
```

Implementation details:
- Use `useCreateMonthlyEvaluation()` and `useUpdateMonthlyEvaluation()` hooks
- **Form sections**:
  1. **Basic Information**: Name (required, text input, maxLength=100), Description (textarea, optional)
  2. **Time Configuration**: Flextime Cap Positive, Flextime Cap Negative, Overtime Threshold -- each a number input (minutes, min=0) with a helper text below showing formatted duration: `<p className="text-xs text-muted-foreground">{value ? formatDuration(Number(value)) : ''}</p>`
  3. **Vacation Configuration**: Max Vacation Carryover -- decimal number input (days, min=0, step=0.5)
  4. **Settings**: Is Default (switch) with warning text if checked: `<p className="text-xs text-amber-600">{t('defaultWarning')}</p>`, Is Active (switch) with description text
- **Validation**: Name required (non-empty, max 100 chars). Number fields must be >= 0 if provided.
- **Submit**: On create, send `{ name, description?, flextime_cap_positive?, flextime_cap_negative?, overtime_threshold?, max_carryover_vacation?, is_default, is_active }`. On update, send partial update via PUT with path `{ id }`.
- **Number field handling**: Use `number | ''` to allow empty fields. On submit, convert `''` to `undefined` for optional fields.
- **Error display**: Same pattern as export-interfaces -- catch error, show in `Alert variant="destructive"`
- **Imports**: `Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle`, `Input`, `Label`, `Switch`, `Textarea`, `Alert, AlertDescription`, `ScrollArea`, `Loader2`, `formatDuration` from `@/lib/time-utils`

**Pattern reference**: `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `apps/web/src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Form shows correct fields in create mode (empty form, defaults)
- [ ] Form populates correctly in edit mode
- [ ] Minute fields show formatted duration helper text below input
- [ ] Default switch shows warning when enabled
- [ ] Validation prevents submit without name
- [ ] Successful create/edit closes sheet and refreshes data

---

## Phase 4: Detail Sheet Component

### Overview
Create the detail sheet component for viewing full details of a monthly evaluation template. Displays all fields with proper formatting and provides action buttons.

### Changes Required:

#### 1. Create detail sheet component
**File**: `apps/web/src/components/monthly-evaluations/monthly-evaluation-detail-sheet.tsx` (NEW)

Props interface:
```typescript
interface MonthlyEvaluationDetailSheetProps {
  itemId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: MonthlyEvaluation) => void
  onSetDefault: (item: MonthlyEvaluation) => void
  onDelete: (item: MonthlyEvaluation) => void
}
```

Implementation details:
- Use `useMonthlyEvaluation(itemId, open && !!itemId)` to fetch full details
- **Header**: Template name with `FileText` icon, plus badges for Default (amber variant with Star icon) and Active/Inactive
- **Sections with `DetailRow` helper** (same pattern as export-interfaces):
  1. **Basic Information**: Name, Description
  2. **Time Configuration**: Flextime Cap (+) shown as `formatDuration(value)` with raw minutes in parentheses, Flextime Cap (-) same, Overtime Threshold same
  3. **Vacation Configuration**: Max Vacation Carryover shown as `"{value} days"`
  4. **Settings**: Is Default (Yes/No), Is Active (Active/Inactive badge)
  5. **Timestamps**: Created, Last Updated (formatted with `format(new Date(date), 'dd.MM.yyyy HH:mm')` using date-fns)
- **Footer buttons**: Close, Set as Default (only for non-default active templates, outline variant), Edit (outline variant), Delete (destructive variant)
- **Loading state**: Skeleton placeholder while fetching

**Pattern reference**: `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `apps/web/src/components/monthly-evaluations/monthly-evaluation-detail-sheet.tsx`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Detail sheet shows all template fields correctly formatted
- [ ] Default badge displays for default template
- [ ] Set as Default button hidden for current default
- [ ] Footer action buttons work (trigger edit/delete/set-default)

---

## Phase 5: Delete Dialog with Default Template Protection

### Overview
The delete functionality uses the existing `ConfirmDialog` component, with special error handling for the 409 (cannot delete default) case. A separate set-default confirmation dialog is also needed. No new component file is required -- both dialogs are implemented inline on the page component. This phase defines the logic.

### Implementation Details (applied in Phase 6 page component):

**Delete handling**:
```typescript
const handleConfirmDelete = async () => {
  if (!deleteItem) return
  setDeleteError(null)
  try {
    await deleteMutation.mutateAsync({
      path: { id: deleteItem.id },
    })
    setDeleteItem(null)
    setViewItem(null)
  } catch (err) {
    const apiError = err as { status?: number; detail?: string; message?: string }
    if (apiError.status === 409) {
      setDeleteError(t('deleteDefaultError'))
    } else {
      setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
    }
  }
}
```

**Set-default handling**:
```typescript
const handleConfirmSetDefault = async () => {
  if (!setDefaultItem) return
  setSetDefaultError(null)
  try {
    await setDefaultMutation.mutateAsync({
      path: { id: setDefaultItem.id },
    })
    setSetDefaultItem(null)
    setViewItem(null)
  } catch (err) {
    const apiError = err as { detail?: string; message?: string }
    setSetDefaultError(apiError.detail ?? apiError.message ?? t('failedSetDefault'))
  }
}
```

**Both use `ConfirmDialog`**:
- Delete: `variant="destructive"`, title=`t('deleteTitle')`, description=error or `t('deleteDescription', { name })`
- Set-default: `variant="default"`, title=`t('setDefaultTitle')`, description=`t('setDefaultDescription', { name })`

### Success Criteria:

#### Automated Verification:
- [ ] N/A (logic is part of page component in Phase 6)

#### Manual Verification:
- [ ] Delete confirmation shows correct template name
- [ ] Deleting non-default template succeeds and removes from list
- [ ] Deleting default template shows 409 error message in dialog
- [ ] Set-default confirmation shows correct template name
- [ ] Set-default succeeds and updates the default badge

---

## Phase 6: Page Component with Skeleton

### Overview
Create the main page component that orchestrates all sub-components, state management, filtering, and dialogs. Also create the barrel export file for the component directory.

### Changes Required:

#### 1. Create barrel index
**File**: `apps/web/src/components/monthly-evaluations/index.ts` (NEW)

```typescript
export { MonthlyEvaluationDataTable } from './monthly-evaluation-data-table'
export { MonthlyEvaluationFormSheet } from './monthly-evaluation-form-sheet'
export { MonthlyEvaluationDetailSheet } from './monthly-evaluation-detail-sheet'
```

#### 2. Create page component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/monthly-evaluations/page.tsx` (NEW)

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, FileText, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useMonthlyEvaluations,
  useDeleteMonthlyEvaluation,
  useSetDefaultMonthlyEvaluation,
} from '@/hooks/api/use-monthly-evaluations'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  MonthlyEvaluationDataTable,
  MonthlyEvaluationFormSheet,
  MonthlyEvaluationDetailSheet,
} from '@/components/monthly-evaluations'
import type { components } from '@/lib/api/types'

type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']
```

**State management**:
```typescript
// Filters
const [search, setSearch] = React.useState('')
const [statusFilter, setStatusFilter] = React.useState<string>('all')

// Dialog/sheet state
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<MonthlyEvaluation | null>(null)
const [viewItem, setViewItem] = React.useState<MonthlyEvaluation | null>(null)
const [deleteItem, setDeleteItem] = React.useState<MonthlyEvaluation | null>(null)
const [deleteError, setDeleteError] = React.useState<string | null>(null)
const [setDefaultItem, setSetDefaultItem] = React.useState<MonthlyEvaluation | null>(null)
const [setDefaultError, setSetDefaultError] = React.useState<string | null>(null)
```

**Data fetching and filtering**:
- `useMonthlyEvaluations({ enabled: !authLoading && isAdmin })`
- Extract items: `const templates = (data as { items?: MonthlyEvaluation[] })?.items ?? []`
- Client-side search filter on name and description
- Status filter: 'all', 'active', 'inactive'
- **Sorting**: Default template first, then alphabetical by name: `filteredTemplates.sort((a, b) => { if (a.is_default && !b.is_default) return -1; if (!a.is_default && b.is_default) return 1; return (a.name || '').localeCompare(b.name || ''); })`

**Handler functions**:
- `handleView(item)`: Set viewItem
- `handleEdit(item)`: Set editItem, clear viewItem
- `handleDelete(item)`: Set deleteItem, clear deleteError
- `handleSetDefault(item)`: Set setDefaultItem, clear setDefaultError
- `handleConfirmDelete()`: Async delete with 409 handling (see Phase 5)
- `handleConfirmSetDefault()`: Async set-default (see Phase 5)
- `handleFormSuccess()`: Close create/edit sheets

**Render structure**:
1. Auth loading -> `MonthlyEvaluationsPageSkeleton`
2. Not admin -> null (redirect in useEffect)
3. Main content:
   - Page header with title/subtitle and "New Template" button
   - Filters bar (SearchInput + Select for status + clear button)
   - Count display: `"{count} template"` / `"{count} templates"`
   - Card > DataTable or EmptyState
   - FormSheet (create/edit)
   - DetailSheet (view)
   - ConfirmDialog (delete, destructive)
   - ConfirmDialog (set-default, default variant)

**EmptyState sub-component**: Icon (FileText), title, hint based on hasFilters, "Add Template" button

**Skeleton sub-component**: Header + filters + content skeleton matching export-interfaces pattern

**Pattern reference**: `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `apps/web/src/app/[locale]/(dashboard)/admin/monthly-evaluations/page.tsx`
- [ ] File exists: `apps/web/src/components/monthly-evaluations/index.ts`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Next.js build passes: `cd apps/web && npx next build` (this verifies page routing works)

#### Manual Verification:
- [ ] Page renders at `/admin/monthly-evaluations`
- [ ] Table shows templates with correct formatting
- [ ] Filters work (search by name, status toggle)
- [ ] Default template appears first in table
- [ ] Create form opens and creates template
- [ ] Edit form opens pre-populated and updates template
- [ ] Detail sheet shows full template info
- [ ] Delete works for non-default, shows error for default
- [ ] Set-default works with confirmation
- [ ] Non-admin users are redirected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Navigation, Sidebar, Breadcrumbs, Translations

### Overview
Add the sidebar navigation entry, breadcrumb mapping, and all translation strings in both English and German.

### Changes Required:

#### 1. Sidebar navigation
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)

Add `ClipboardList` to the icon imports from `lucide-react`:
```typescript
import {
  // ... existing imports ...
  ClipboardList,  // NEW
} from 'lucide-react'
```

Add entry to the `administration` section items array, after the `exportInterfaces` entry:
```typescript
{
  titleKey: 'monthlyEvaluations',
  href: '/admin/monthly-evaluations',
  icon: ClipboardList,
  roles: ['admin'],
},
```

Note: Using `ClipboardList` icon to avoid collision with `ClipboardCheck` (used for approvals) and `FileText` (used for reports and monthly evaluation viewer). `ClipboardList` evokes a checklist/template concept.

#### 2. Breadcrumb mapping
**File**: `apps/web/src/components/layout/breadcrumbs.tsx` (MODIFY)

Add to the `segmentToKey` record after the `'export-interfaces'` entry:
```typescript
'monthly-evaluations': 'monthlyEvaluations',
```

#### 3. English translations
**File**: `apps/web/messages/en.json` (MODIFY)

Add to `nav` section:
```json
"monthlyEvaluations": "Evaluation Templates"
```

Add to `breadcrumbs` section:
```json
"monthlyEvaluations": "Evaluation Templates"
```

Add new top-level namespace `adminMonthlyEvaluations` (before the closing `}` of the JSON, or after `adminExportInterfaces`):
```json
"adminMonthlyEvaluations": {
  "title": "Evaluation Templates",
  "subtitle": "Configure monthly evaluation templates with flextime caps, overtime thresholds, and vacation carryover limits",
  "newTemplate": "New Template",
  "searchPlaceholder": "Search by name or description...",
  "allStatuses": "All Statuses",
  "active": "Active",
  "inactive": "Inactive",
  "clearFilters": "Clear filters",
  "templateCount": "{count} template",
  "templatesCount": "{count} templates",
  "emptyTitle": "No evaluation templates configured",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first evaluation template to define monthly evaluation rules",
  "addTemplate": "Add Template",
  "actions": "Actions",
  "cancel": "Cancel",
  "close": "Close",

  "columnName": "Name",
  "columnDescription": "Description",
  "columnFlextimePositive": "Flextime Cap (+)",
  "columnFlextimeNegative": "Flextime Cap (−)",
  "columnOvertimeThreshold": "Overtime Threshold",
  "columnMaxCarryover": "Max Vacation Carryover",
  "columnDefault": "Default",
  "columnStatus": "Status",

  "templateDetails": "Template Details",
  "viewTemplateInfo": "View evaluation template configuration",
  "sectionBasicInfo": "Basic Information",
  "sectionTimeConfig": "Time Configuration",
  "sectionVacationConfig": "Vacation Configuration",
  "sectionSettings": "Settings",
  "sectionTimestamps": "Timestamps",
  "fieldName": "Name",
  "fieldDescription": "Description",
  "fieldFlextimePositive": "Flextime Cap (Positive)",
  "fieldFlextimeNegative": "Flextime Cap (Negative)",
  "fieldOvertimeThreshold": "Overtime Threshold",
  "fieldMaxCarryover": "Max Vacation Carryover",
  "fieldIsDefault": "Default Template",
  "fieldIsActive": "Active",
  "fieldActiveDescription": "Inactive templates are not available for assignment",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",
  "labelYes": "Yes",
  "labelNo": "No",
  "labelDays": "{value} days",

  "create": "Create",
  "createTitle": "New Evaluation Template",
  "createDescription": "Create a new monthly evaluation template with flextime and overtime rules.",
  "edit": "Edit",
  "editTitle": "Edit Evaluation Template",
  "editDescription": "Modify the selected evaluation template.",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "failedCreate": "Failed to create evaluation template",
  "failedUpdate": "Failed to update evaluation template",
  "viewDetails": "View Details",

  "namePlaceholder": "e.g. Standard Template",
  "descriptionPlaceholder": "Optional description of this template's purpose...",
  "minutesPlaceholder": "Minutes (e.g. 600)",
  "daysPlaceholder": "Days (e.g. 5.0)",

  "validationNameRequired": "Name is required",
  "validationNameMaxLength": "Name must be at most 100 characters",
  "validationMinZero": "Value must be 0 or greater",

  "defaultWarning": "Setting this as default will unset the current default template",

  "deleteTitle": "Delete Evaluation Template",
  "deleteDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone.",
  "deleteDefaultError": "Cannot delete the default evaluation template. Set another template as default first.",
  "delete": "Delete",
  "failedDelete": "Failed to delete evaluation template",

  "setDefaultTitle": "Set as Default Template",
  "setDefaultDescription": "Set \"{name}\" as the default evaluation template? This will unset the current default.",
  "setDefault": "Set as Default",
  "failedSetDefault": "Failed to set template as default",

  "statusActive": "Active",
  "statusInactive": "Inactive",
  "defaultBadge": "Default"
}
```

#### 4. German translations
**File**: `apps/web/messages/de.json` (MODIFY)

Add to `nav` section:
```json
"monthlyEvaluations": "Auswertungsvorlagen"
```

Add to `breadcrumbs` section:
```json
"monthlyEvaluations": "Auswertungsvorlagen"
```

Add new top-level namespace `adminMonthlyEvaluations`:
```json
"adminMonthlyEvaluations": {
  "title": "Auswertungsvorlagen",
  "subtitle": "Monatliche Auswertungsvorlagen mit Gleitzeitkappen, Überstundenschwellen und Urlaubsübertragungslimits konfigurieren",
  "newTemplate": "Neue Vorlage",
  "searchPlaceholder": "Nach Name oder Beschreibung suchen...",
  "allStatuses": "Alle Status",
  "active": "Aktiv",
  "inactive": "Inaktiv",
  "clearFilters": "Filter zurücksetzen",
  "templateCount": "{count} Vorlage",
  "templatesCount": "{count} Vorlagen",
  "emptyTitle": "Keine Auswertungsvorlagen konfiguriert",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Erstellen Sie Ihre erste Auswertungsvorlage, um monatliche Auswertungsregeln zu definieren",
  "addTemplate": "Vorlage hinzufügen",
  "actions": "Aktionen",
  "cancel": "Abbrechen",
  "close": "Schließen",

  "columnName": "Name",
  "columnDescription": "Beschreibung",
  "columnFlextimePositive": "Gleitzeitkappe (+)",
  "columnFlextimeNegative": "Gleitzeitkappe (−)",
  "columnOvertimeThreshold": "Überstundenschwelle",
  "columnMaxCarryover": "Max. Urlaubsübertragung",
  "columnDefault": "Standard",
  "columnStatus": "Status",

  "templateDetails": "Vorlagendetails",
  "viewTemplateInfo": "Auswertungsvorlage-Konfiguration anzeigen",
  "sectionBasicInfo": "Grundinformationen",
  "sectionTimeConfig": "Zeitkonfiguration",
  "sectionVacationConfig": "Urlaubskonfiguration",
  "sectionSettings": "Einstellungen",
  "sectionTimestamps": "Zeitstempel",
  "fieldName": "Name",
  "fieldDescription": "Beschreibung",
  "fieldFlextimePositive": "Gleitzeitkappe (Positiv)",
  "fieldFlextimeNegative": "Gleitzeitkappe (Negativ)",
  "fieldOvertimeThreshold": "Überstundenschwelle",
  "fieldMaxCarryover": "Max. Urlaubsübertragung",
  "fieldIsDefault": "Standardvorlage",
  "fieldIsActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Vorlagen stehen nicht zur Zuweisung zur Verfügung",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",
  "labelYes": "Ja",
  "labelNo": "Nein",
  "labelDays": "{value} Tage",

  "create": "Erstellen",
  "createTitle": "Neue Auswertungsvorlage",
  "createDescription": "Erstellen Sie eine neue monatliche Auswertungsvorlage mit Gleitzeit- und Überstundenregeln.",
  "edit": "Bearbeiten",
  "editTitle": "Auswertungsvorlage bearbeiten",
  "editDescription": "Ausgewählte Auswertungsvorlage ändern.",
  "saveChanges": "Änderungen speichern",
  "saving": "Speichern...",
  "failedCreate": "Auswertungsvorlage konnte nicht erstellt werden",
  "failedUpdate": "Auswertungsvorlage konnte nicht aktualisiert werden",
  "viewDetails": "Details anzeigen",

  "namePlaceholder": "z.B. Standardvorlage",
  "descriptionPlaceholder": "Optionale Beschreibung des Zwecks dieser Vorlage...",
  "minutesPlaceholder": "Minuten (z.B. 600)",
  "daysPlaceholder": "Tage (z.B. 5,0)",

  "validationNameRequired": "Name ist erforderlich",
  "validationNameMaxLength": "Name darf maximal 100 Zeichen lang sein",
  "validationMinZero": "Wert muss 0 oder größer sein",

  "defaultWarning": "Das Setzen als Standard hebt die aktuelle Standardvorlage auf",

  "deleteTitle": "Auswertungsvorlage löschen",
  "deleteDescription": "Möchten Sie \"{name}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteDefaultError": "Die Standardvorlage kann nicht gelöscht werden. Setzen Sie zuerst eine andere Vorlage als Standard.",
  "delete": "Löschen",
  "failedDelete": "Auswertungsvorlage konnte nicht gelöscht werden",

  "setDefaultTitle": "Als Standardvorlage festlegen",
  "setDefaultDescription": "\"{name}\" als Standardvorlage festlegen? Dies hebt die aktuelle Standardvorlage auf.",
  "setDefault": "Als Standard festlegen",
  "failedSetDefault": "Vorlage konnte nicht als Standard festgelegt werden",

  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "defaultBadge": "Standard"
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Next.js build passes: `cd apps/web && npx next build`
- [ ] Sidebar entry exists: grep for `monthlyEvaluations` in `sidebar-nav-config.ts`
- [ ] Breadcrumb mapping exists: grep for `monthly-evaluations` in `breadcrumbs.tsx`
- [ ] EN translations exist: grep for `adminMonthlyEvaluations` in `messages/en.json`
- [ ] DE translations exist: grep for `adminMonthlyEvaluations` in `messages/de.json`

#### Manual Verification:
- [ ] Sidebar shows "Evaluation Templates" under Administration section
- [ ] Clicking sidebar entry navigates to `/admin/monthly-evaluations`
- [ ] Breadcrumbs show "Home > Administration > Evaluation Templates"
- [ ] All text on page displays translated strings (no raw keys visible)
- [ ] German translations appear when switching locale

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 8: Verification

### Overview
Full end-to-end verification of the complete feature.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] Next.js production build succeeds: `cd apps/web && npx next build`
- [ ] All new files exist:
  - `apps/web/src/hooks/api/use-monthly-evaluations.ts`
  - `apps/web/src/components/monthly-evaluations/index.ts`
  - `apps/web/src/components/monthly-evaluations/monthly-evaluation-data-table.tsx`
  - `apps/web/src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx`
  - `apps/web/src/components/monthly-evaluations/monthly-evaluation-detail-sheet.tsx`
  - `apps/web/src/app/[locale]/(dashboard)/admin/monthly-evaluations/page.tsx`

#### Manual Verification:
- [ ] Navigate to `/admin/monthly-evaluations` -- page loads with skeleton then data
- [ ] Create a template "Standard" with flextime_cap_positive=600, overtime_threshold=60 -- values show as "10h" and "1h"
- [ ] Create a second template "Extended" -- both appear in table
- [ ] Set "Extended" as default -- star icon moves, "Standard" loses star
- [ ] Attempt to delete "Extended" (default) -- 409 error message appears
- [ ] Delete "Standard" (non-default) -- template removed from list
- [ ] Edit "Extended" -- change flextime_cap_negative to 300, verify shows "5h"
- [ ] Toggle active filter -- only active/inactive templates shown
- [ ] Search filter -- filters by name/description
- [ ] Non-admin user is redirected to dashboard
- [ ] Sidebar entry appears in Administration section
- [ ] Breadcrumbs display correctly

---

## File Summary

### New Files (7):
| File | Purpose |
|------|---------|
| `apps/web/src/hooks/api/use-monthly-evaluations.ts` | API hooks for all monthly evaluation endpoints |
| `apps/web/src/components/monthly-evaluations/index.ts` | Barrel exports for component directory |
| `apps/web/src/components/monthly-evaluations/monthly-evaluation-data-table.tsx` | Data table with columns, formatting, actions |
| `apps/web/src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx` | Create/edit form sheet with minute helpers |
| `apps/web/src/components/monthly-evaluations/monthly-evaluation-detail-sheet.tsx` | Detail view sheet with all fields |
| `apps/web/src/app/[locale]/(dashboard)/admin/monthly-evaluations/page.tsx` | Page component orchestrating everything |

### Modified Files (5):
| File | Change |
|------|--------|
| `apps/web/src/hooks/api/index.ts` | Add monthly evaluation hook exports |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add ClipboardList import and nav entry |
| `apps/web/src/components/layout/breadcrumbs.tsx` | Add `monthly-evaluations` segment mapping |
| `apps/web/messages/en.json` | Add nav, breadcrumb, and `adminMonthlyEvaluations` namespace |
| `apps/web/messages/de.json` | Add nav, breadcrumb, and `adminMonthlyEvaluations` namespace |

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-046-monthly-evaluation-template-ui.md`
- Research: `thoughts/shared/research/2026-02-03-ZMI-TICKET-046-monthly-evaluation-template-ui.md`
- Export interfaces hook pattern: `apps/web/src/hooks/api/use-export-interfaces.ts`
- Export interfaces data table: `apps/web/src/components/export-interfaces/export-interface-data-table.tsx`
- Export interfaces form sheet: `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx`
- Export interfaces detail sheet: `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx`
- Export interfaces page: `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`
- Time utilities: `apps/web/src/lib/time-utils.ts`
- ConfirmDialog: `apps/web/src/components/ui/confirm-dialog.tsx`
- Sidebar config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- Breadcrumbs: `apps/web/src/components/layout/breadcrumbs.tsx`
