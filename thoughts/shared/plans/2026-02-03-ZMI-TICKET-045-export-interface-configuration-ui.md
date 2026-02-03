# ZMI-TICKET-045: Export Interface Configuration UI - Implementation Plan

## Overview

Implement a full admin CRUD page for managing export interfaces, including an account mapping editor with a dual-list transfer pattern. This is a **frontend-only** ticket -- all backend API endpoints already exist and are tested. The implementation follows the established admin page patterns from the Accounts, Tariffs, and Booking Types pages.

## Current State Analysis

### What Exists
- **Backend API**: Full CRUD + account management endpoints at `/export-interfaces` (7 endpoints total), all requiring `payroll.manage` permission
- **TypeScript types**: Auto-generated in `apps/web/src/lib/api/types.ts` -- `ExportInterface`, `ExportInterfaceSummary`, `ExportInterfaceAccount`, `CreateExportInterfaceRequest`, `UpdateExportInterfaceRequest`, `SetExportInterfaceAccountsRequest`
- **Minimal hook**: `useExportInterfaces()` in `apps/web/src/hooks/api/use-payroll-exports.ts` (only fetches active interfaces for the payroll export generate dialog dropdown)

### What Does NOT Exist
- No dedicated API hooks file for export interfaces CRUD
- No page at `/admin/export-interfaces`
- No component directory `components/export-interfaces/`
- No nav sidebar entry for "Export Interfaces"
- No breadcrumb segment mapping
- No translation namespace for the admin page (EN or DE)

### Key Discoveries
- All admin pages follow identical patterns: page component with useState-based state management, data table, form sheet, detail sheet, confirm dialog (`apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`)
- No zod or react-hook-form exists in the codebase -- all forms use manual `useState` with inline validation (`apps/web/src/components/accounts/account-form-sheet.tsx`)
- No dual-list/transfer-list component exists -- this will be the first instance of this pattern
- The existing `ConfirmDialog` component (`apps/web/src/components/ui/confirm-dialog.tsx`) is reusable and handles destructive confirmations
- Domain hooks follow a consistent pattern: list, get, create, update, delete with `invalidateKeys` (`apps/web/src/hooks/api/use-accounts.ts`)
- Skeletons are defined inline in data table files as private components
- Translation namespaces use camelCase (e.g., `adminAccounts`, `adminTariffs`)

## Desired End State

An admin user can:
1. Navigate to `/admin/export-interfaces` via the sidebar
2. View a filterable/searchable table of export interfaces
3. Create a new export interface via a right-side sheet form
4. Edit an existing export interface
5. View interface details including assigned accounts in a detail sheet
6. Manage account assignments via a dual-list dialog (available accounts vs. assigned accounts with reordering)
7. Delete interfaces (with 409 handling when interface has generated exports)

### Verification
- Page loads at `/admin/export-interfaces` with correct breadcrumbs
- CRUD operations work end-to-end against the backend
- Account mapping dialog correctly shows available/assigned accounts and saves via PUT
- 409 errors display user-friendly messages
- All text is translated in both EN and DE
- Non-admin users are redirected to dashboard

## What We're NOT Doing

- **No backend changes** -- all API endpoints already exist
- **No zod validation schemas** -- the codebase uses manual useState validation; we follow that pattern
- **No react-hook-form** -- not used anywhere in the codebase
- **No drag-and-drop reordering** -- use up/down buttons instead to avoid adding new dependencies
- **No separate delete dialog component** -- use the existing reusable `ConfirmDialog` with 409 handling in the page component
- **No export script execution or file path validation** -- out of scope per ticket
- **No component tests** -- not part of this frontend-only implementation ticket

## Implementation Approach

Follow the exact patterns from the Accounts admin page, implementing in incremental phases where each phase produces testable output. The account mapping dialog is the only truly new pattern, built from existing UI primitives (Sheet, ScrollArea, Button, Checkbox, Input).

The existing `useExportInterfaces` hook in `use-payroll-exports.ts` will be preserved as-is for backward compatibility. The new dedicated hooks file will contain the full CRUD hooks plus account management hooks.

---

## Phase 1: API Hooks and Barrel Exports

### Overview
Create the dedicated API hooks file for export interface CRUD operations and account management, then register it in the hooks barrel export.

### Changes Required

#### 1. Create Export Interface Hooks
**File**: `apps/web/src/hooks/api/use-export-interfaces.ts` (new)

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseExportInterfacesOptions {
  activeOnly?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of export interfaces.
 */
export function useExportInterfaces(options: UseExportInterfacesOptions = {}) {
  const { activeOnly, enabled = true } = options
  return useApiQuery('/export-interfaces', {
    params: {
      active_only: activeOnly,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single export interface by ID.
 */
export function useExportInterface(id: string, enabled = true) {
  return useApiQuery('/export-interfaces/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch accounts assigned to an export interface.
 */
export function useExportInterfaceAccounts(id: string, enabled = true) {
  return useApiQuery('/export-interfaces/{id}/accounts', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new export interface.
 */
export function useCreateExportInterface() {
  return useApiMutation('/export-interfaces', 'post', {
    invalidateKeys: [['/export-interfaces']],
  })
}

/**
 * Hook to update an existing export interface.
 */
export function useUpdateExportInterface() {
  return useApiMutation('/export-interfaces/{id}', 'patch', {
    invalidateKeys: [
      ['/export-interfaces'],
      ['/export-interfaces/{id}'],
    ],
  })
}

/**
 * Hook to delete an export interface.
 */
export function useDeleteExportInterface() {
  return useApiMutation('/export-interfaces/{id}', 'delete', {
    invalidateKeys: [
      ['/export-interfaces'],
      ['/export-interfaces/{id}'],
    ],
  })
}

/**
 * Hook to set (replace all) accounts for an export interface.
 */
export function useSetExportInterfaceAccounts() {
  return useApiMutation('/export-interfaces/{id}/accounts', 'put', {
    invalidateKeys: [
      ['/export-interfaces/{id}/accounts'],
      ['/export-interfaces/{id}'],
      ['/export-interfaces'],
    ],
  })
}
```

#### 2. Register in Hooks Barrel Export
**File**: `apps/web/src/hooks/api/index.ts`

Add after the existing Payroll Exports section:
```ts
// Export Interfaces (admin CRUD)
export {
  useExportInterfaces as useExportInterfacesList,
  useExportInterface,
  useExportInterfaceAccounts,
  useCreateExportInterface,
  useUpdateExportInterface,
  useDeleteExportInterface,
  useSetExportInterfaceAccounts,
} from './use-export-interfaces'
```

**Note**: The list hook is re-exported as `useExportInterfacesList` to avoid name collision with the existing `useExportInterfaces` from `use-payroll-exports.ts`. The page component will import directly from the hooks file instead of the barrel, so this alias is just for documentation. The existing `useExportInterfaces` in `use-payroll-exports.ts` remains untouched for backward compatibility.

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/hooks/api/use-export-interfaces.ts`
- [ ] Hooks barrel export includes new hooks: verify `apps/web/src/hooks/api/index.ts` contains export-interfaces exports

#### Manual Verification
- [ ] N/A -- hooks are tested via the page in subsequent phases

---

## Phase 2: Translations (EN + DE)

### Overview
Add all translation keys for the export interfaces admin page in both English and German. This is done early so all subsequent component implementations can reference translations immediately.

### Changes Required

#### 1. English Translations
**File**: `apps/web/messages/en.json`

Add to `nav` object:
```json
"exportInterfaces": "Export Interfaces"
```

Add to `breadcrumbs` object:
```json
"exportInterfaces": "Export Interfaces"
```

Add new top-level namespace (after the `payrollExports` namespace):
```json
"adminExportInterfaces": {
  "title": "Export Interfaces",
  "subtitle": "Configure export interfaces and assign accounts for payroll exports",
  "newInterface": "New Interface",
  "searchPlaceholder": "Search by name or number...",
  "allStatuses": "All Statuses",
  "active": "Active",
  "inactive": "Inactive",
  "clearFilters": "Clear filters",
  "interfaceCount": "{count} interface",
  "interfacesCount": "{count} interfaces",
  "emptyTitle": "No export interfaces configured",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first export interface to enable payroll exports",
  "addInterface": "Add Interface",
  "actions": "Actions",
  "cancel": "Cancel",
  "close": "Close",

  "columnNumber": "#",
  "columnName": "Name",
  "columnMandant": "Mandant",
  "columnExportPath": "Export Path",
  "columnStatus": "Status",
  "columnAccounts": "Accounts",

  "interfaceDetails": "Interface Details",
  "viewInterfaceInfo": "View export interface information",
  "sectionBasicInfo": "Basic Information",
  "sectionExportConfig": "Export Configuration",
  "sectionAssignedAccounts": "Assigned Accounts",
  "sectionTimestamps": "Timestamps",
  "fieldNumber": "Interface Number",
  "fieldName": "Name",
  "fieldMandant": "Mandant Number",
  "fieldExportScript": "Export Script",
  "fieldExportPath": "Export Path",
  "fieldOutputFilename": "Output Filename",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive interfaces are not available for payroll exports",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",
  "noAccountsAssigned": "No accounts assigned",
  "accountCode": "Code",
  "accountName": "Name",
  "accountPayrollCode": "Payroll Code",

  "create": "Create",
  "createTitle": "New Export Interface",
  "createDescription": "Add a new export interface for payroll exports.",
  "edit": "Edit",
  "editTitle": "Edit Export Interface",
  "editDescription": "Modify the selected export interface.",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "failedCreate": "Failed to create export interface",
  "failedUpdate": "Failed to update export interface",
  "viewDetails": "View Details",
  "manageAccounts": "Manage Accounts",

  "numberPlaceholder": "e.g. 1",
  "namePlaceholder": "e.g. Payroll Export DATEV",
  "mandantPlaceholder": "e.g. 12345",
  "exportScriptPlaceholder": "e.g. export_datev.sh",
  "exportPathPlaceholder": "e.g. /exports/payroll/",
  "outputFilenamePlaceholder": "e.g. payroll_{year}_{month}.csv",

  "validationNumberRequired": "Interface number is required",
  "validationNumberMin": "Interface number must be at least 1",
  "validationNameRequired": "Name is required",
  "validationNameMaxLength": "Name must be at most 255 characters",
  "validationMandantMaxLength": "Mandant number must be at most 50 characters",
  "validationExportScriptMaxLength": "Export script must be at most 255 characters",
  "validationExportPathMaxLength": "Export path must be at most 500 characters",
  "validationOutputFilenameMaxLength": "Output filename must be at most 255 characters",

  "deleteTitle": "Delete Export Interface",
  "deleteDescription": "Are you sure you want to delete \"{name}\" (#{number})? This action cannot be undone.",
  "deleteInUse": "This interface has generated exports and cannot be deleted. Deactivate it instead.",
  "delete": "Delete",
  "failedDelete": "Failed to delete export interface",

  "accountMapping": {
    "title": "Manage Account Assignments",
    "description": "Configure which accounts are included in \"{name}\"",
    "availableAccounts": "Available Accounts",
    "assignedAccounts": "Assigned Accounts",
    "searchAvailable": "Search available...",
    "searchAssigned": "Search assigned...",
    "addSelected": "Add Selected",
    "removeSelected": "Remove Selected",
    "addAll": "Add All",
    "removeAll": "Remove All",
    "moveUp": "Move Up",
    "moveDown": "Move Down",
    "noAvailable": "No available accounts",
    "noAssigned": "No accounts assigned",
    "noSearchResults": "No accounts match your search",
    "save": "Save Assignments",
    "saving": "Saving...",
    "saveSuccess": "Accounts updated successfully",
    "saveFailed": "Failed to update account assignments",
    "selectedCount": "{count} selected",
    "accountCount": "{count} accounts"
  },

  "statusActive": "Active",
  "statusInactive": "Inactive"
}
```

#### 2. German Translations
**File**: `apps/web/messages/de.json`

Add to `nav` object:
```json
"exportInterfaces": "Exportschnittstellen"
```

Add to `breadcrumbs` object:
```json
"exportInterfaces": "Exportschnittstellen"
```

Add new top-level namespace:
```json
"adminExportInterfaces": {
  "title": "Exportschnittstellen",
  "subtitle": "Exportschnittstellen konfigurieren und Konten für Lohnexporte zuweisen",
  "newInterface": "Neue Schnittstelle",
  "searchPlaceholder": "Nach Name oder Nummer suchen...",
  "allStatuses": "Alle Status",
  "active": "Aktiv",
  "inactive": "Inaktiv",
  "clearFilters": "Filter zurücksetzen",
  "interfaceCount": "{count} Schnittstelle",
  "interfacesCount": "{count} Schnittstellen",
  "emptyTitle": "Keine Exportschnittstellen konfiguriert",
  "emptyFilterHint": "Versuchen Sie die Filter anzupassen",
  "emptyGetStarted": "Erstellen Sie Ihre erste Exportschnittstelle, um Lohnexporte zu ermöglichen",
  "addInterface": "Schnittstelle hinzufügen",
  "actions": "Aktionen",
  "cancel": "Abbrechen",
  "close": "Schließen",

  "columnNumber": "#",
  "columnName": "Name",
  "columnMandant": "Mandant",
  "columnExportPath": "Exportpfad",
  "columnStatus": "Status",
  "columnAccounts": "Konten",

  "interfaceDetails": "Schnittstellendetails",
  "viewInterfaceInfo": "Exportschnittstellen-Informationen anzeigen",
  "sectionBasicInfo": "Grundinformationen",
  "sectionExportConfig": "Export-Konfiguration",
  "sectionAssignedAccounts": "Zugewiesene Konten",
  "sectionTimestamps": "Zeitstempel",
  "fieldNumber": "Schnittstellennummer",
  "fieldName": "Name",
  "fieldMandant": "Mandantennummer",
  "fieldExportScript": "Exportskript",
  "fieldExportPath": "Exportpfad",
  "fieldOutputFilename": "Ausgabedateiname",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Schnittstellen sind nicht für Lohnexporte verfügbar",
  "labelCreated": "Erstellt",
  "labelLastUpdated": "Zuletzt aktualisiert",
  "noAccountsAssigned": "Keine Konten zugewiesen",
  "accountCode": "Code",
  "accountName": "Name",
  "accountPayrollCode": "Lohnartenschlüssel",

  "create": "Erstellen",
  "createTitle": "Neue Exportschnittstelle",
  "createDescription": "Eine neue Exportschnittstelle für Lohnexporte hinzufügen.",
  "edit": "Bearbeiten",
  "editTitle": "Exportschnittstelle bearbeiten",
  "editDescription": "Die ausgewählte Exportschnittstelle ändern.",
  "saveChanges": "Änderungen speichern",
  "saving": "Wird gespeichert...",
  "failedCreate": "Exportschnittstelle konnte nicht erstellt werden",
  "failedUpdate": "Exportschnittstelle konnte nicht aktualisiert werden",
  "viewDetails": "Details anzeigen",
  "manageAccounts": "Konten verwalten",

  "numberPlaceholder": "z.B. 1",
  "namePlaceholder": "z.B. Lohnexport DATEV",
  "mandantPlaceholder": "z.B. 12345",
  "exportScriptPlaceholder": "z.B. export_datev.sh",
  "exportPathPlaceholder": "z.B. /exports/payroll/",
  "outputFilenamePlaceholder": "z.B. payroll_{year}_{month}.csv",

  "validationNumberRequired": "Schnittstellennummer ist erforderlich",
  "validationNumberMin": "Schnittstellennummer muss mindestens 1 sein",
  "validationNameRequired": "Name ist erforderlich",
  "validationNameMaxLength": "Name darf maximal 255 Zeichen lang sein",
  "validationMandantMaxLength": "Mandantennummer darf maximal 50 Zeichen lang sein",
  "validationExportScriptMaxLength": "Exportskript darf maximal 255 Zeichen lang sein",
  "validationExportPathMaxLength": "Exportpfad darf maximal 500 Zeichen lang sein",
  "validationOutputFilenameMaxLength": "Ausgabedateiname darf maximal 255 Zeichen lang sein",

  "deleteTitle": "Exportschnittstelle löschen",
  "deleteDescription": "Möchten Sie \"{name}\" (#{number}) wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteInUse": "Diese Schnittstelle hat bereits Exporte generiert und kann nicht gelöscht werden. Deaktivieren Sie sie stattdessen.",
  "delete": "Löschen",
  "failedDelete": "Exportschnittstelle konnte nicht gelöscht werden",

  "accountMapping": {
    "title": "Kontenzuweisungen verwalten",
    "description": "Konfigurieren Sie, welche Konten in \"{name}\" enthalten sind",
    "availableAccounts": "Verfügbare Konten",
    "assignedAccounts": "Zugewiesene Konten",
    "searchAvailable": "Verfügbare suchen...",
    "searchAssigned": "Zugewiesene suchen...",
    "addSelected": "Ausgewählte hinzufügen",
    "removeSelected": "Ausgewählte entfernen",
    "addAll": "Alle hinzufügen",
    "removeAll": "Alle entfernen",
    "moveUp": "Nach oben",
    "moveDown": "Nach unten",
    "noAvailable": "Keine verfügbaren Konten",
    "noAssigned": "Keine Konten zugewiesen",
    "noSearchResults": "Keine Konten entsprechen Ihrer Suche",
    "save": "Zuweisungen speichern",
    "saving": "Wird gespeichert...",
    "saveSuccess": "Konten erfolgreich aktualisiert",
    "saveFailed": "Kontenzuweisungen konnten nicht aktualisiert werden",
    "selectedCount": "{count} ausgewählt",
    "accountCount": "{count} Konten"
  },

  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv"
}
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] JSON is valid in both translation files (no syntax errors)
- [ ] Both files have matching keys in the `adminExportInterfaces` namespace

#### Manual Verification
- [ ] N/A -- translations are verified visually in subsequent phases

---

## Phase 3: Navigation and Breadcrumbs

### Overview
Add the "Export Interfaces" entry to the sidebar navigation and breadcrumb segment mapping so the route is accessible.

### Changes Required

#### 1. Sidebar Navigation Config
**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Add `Settings2` to the lucide-react import:
```ts
import {
  // ... existing imports ...
  FileOutput,
  Settings2,
} from 'lucide-react'
```

Add new nav item in the `administration` section, after the `payrollExports` entry:
```ts
{
  titleKey: 'exportInterfaces',
  href: '/admin/export-interfaces',
  icon: Settings2,
  roles: ['admin'],
},
```

#### 2. Breadcrumb Segment Mapping
**File**: `apps/web/src/components/layout/breadcrumbs.tsx`

Add to `segmentToKey` mapping after the `'payroll-exports'` entry:
```ts
'export-interfaces': 'exportInterfaces',
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`

#### Manual Verification
- [ ] "Export Interfaces" appears in the sidebar under the "Administration" section
- [ ] Navigating to `/admin/export-interfaces` shows correct breadcrumbs: Home > Administration > Export Interfaces

---

## Phase 4: Data Table Component + Skeleton

### Overview
Create the data table component for displaying export interfaces in a tabular format with sorting, status badges, account counts, and action dropdowns. Include the inline skeleton component.

### Changes Required

#### 1. Data Table Component
**File**: `apps/web/src/components/export-interfaces/export-interface-data-table.tsx` (new)

Follow pattern from `apps/web/src/components/accounts/account-data-table.tsx`.

Structure:
```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Users, Trash2 } from 'lucide-react'
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
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']

interface ExportInterfaceDataTableProps {
  items: ExportInterface[]
  isLoading: boolean
  onView: (item: ExportInterface) => void
  onEdit: (item: ExportInterface) => void
  onManageAccounts: (item: ExportInterface) => void
  onDelete: (item: ExportInterface) => void
}
```

Props:
- `items: ExportInterface[]` -- the filtered list to display
- `isLoading: boolean` -- shows skeleton when true
- `onView` -- row click and "View Details" menu item
- `onEdit` -- "Edit" menu item
- `onManageAccounts` -- "Manage Accounts" menu item
- `onDelete` -- "Delete" menu item

Columns:
1. **#** (interface_number) -- `w-16`, font-mono, numeric
2. **Name** -- primary text, `font-medium`
3. **Mandant** -- `w-28`, text-muted-foreground, show `-` if null
4. **Export Path** -- truncated, text-muted-foreground, show `-` if null
5. **Status** -- `w-24`, `Badge` with `variant="default"` for active, `variant="secondary"` for inactive
6. **Accounts** -- `w-20`, count from `item.accounts?.length ?? 0`
7. **Actions** -- `w-16`, DropdownMenu with View Details, Edit, Manage Accounts, separator, Delete (destructive)

Row click: `onClick={() => onView(item)}`, `className="cursor-pointer"`
Actions column: `onClick={(e) => e.stopPropagation()}` on the cell

Skeleton component: `ExportInterfaceDataTableSkeleton` -- private function at bottom of same file, matching column widths with 5 skeleton rows.

If `isLoading`, return `<ExportInterfaceDataTableSkeleton />`.
If `items.length === 0`, return `null` (empty state handled at page level).

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/export-interfaces/export-interface-data-table.tsx`

#### Manual Verification
- [ ] N/A -- component is tested via the page in Phase 7

---

## Phase 5: Form Sheet Component

### Overview
Create the create/edit form sheet for export interfaces, following the exact pattern from `account-form-sheet.tsx` with manual useState-based validation.

### Changes Required

#### 1. Form Sheet Component
**File**: `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx` (new)

Follow pattern from `apps/web/src/components/accounts/account-form-sheet.tsx`.

Structure:
```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateExportInterface,
  useUpdateExportInterface,
} from '@/hooks/api/use-export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']

interface ExportInterfaceFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ExportInterface | null
  onSuccess?: () => void
}
```

FormState interface:
```ts
interface FormState {
  interfaceNumber: number
  name: string
  mandantNumber: string
  exportScript: string
  exportPath: string
  outputFilename: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  interfaceNumber: 1,
  name: '',
  mandantNumber: '',
  exportScript: '',
  exportPath: '',
  outputFilename: '',
  isActive: true,
}
```

`isEdit = !!item` determines create vs. edit mode.

`React.useEffect` resets form from `item` when `open` or `item` changes.

Validation (in `handleSubmit`):
```ts
const errors: string[] = []
if (!form.interfaceNumber || form.interfaceNumber < 1) errors.push(t('validationNumberRequired'))
if (!form.name.trim()) errors.push(t('validationNameRequired'))
else if (form.name.length > 255) errors.push(t('validationNameMaxLength'))
if (form.mandantNumber.length > 50) errors.push(t('validationMandantMaxLength'))
if (form.exportScript.length > 255) errors.push(t('validationExportScriptMaxLength'))
if (form.exportPath.length > 500) errors.push(t('validationExportPathMaxLength'))
if (form.outputFilename.length > 255) errors.push(t('validationOutputFilenameMaxLength'))
```

API call body:
- **Create**: `{ interface_number, name, mandant_number?, export_script?, export_path?, output_filename? }` (no `is_active` -- new interfaces default to active)
- **Update**: `{ name, mandant_number?, export_script?, export_path?, output_filename?, is_active }` (interface_number NOT editable after creation per business logic)

Error handling: catch block uses `(err as { detail?: string; message?: string })` pattern.

Form sections:
1. **Basic Information**: Interface Number (number input, min 1, disabled on edit), Name (text input)
2. **Export Configuration**: Mandant Number, Export Script, Export Path, Output Filename
3. **Status** (edit only): Active switch

Footer: Cancel + Submit buttons with Loader2 spinner.

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx`

#### Manual Verification
- [ ] N/A -- component is tested via the page in Phase 7

---

## Phase 6: Detail Sheet Component

### Overview
Create the read-only detail sheet that displays all export interface information including assigned accounts.

### Changes Required

#### 1. Detail Sheet Component
**File**: `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx` (new)

Follow pattern from `apps/web/src/components/accounts/account-detail-sheet.tsx`.

Structure:
```tsx
'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Users, Settings2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useExportInterface,
} from '@/hooks/api/use-export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']

interface ExportInterfaceDetailSheetProps {
  itemId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: ExportInterface) => void
  onManageAccounts: (item: ExportInterface) => void
  onDelete: (item: ExportInterface) => void
}
```

Props:
- `itemId` -- fetched via `useExportInterface(id, open && !!id)`
- `onEdit`, `onManageAccounts`, `onDelete` -- footer actions

Sections:
1. **Header**: Settings2 icon + name + status badge
2. **Basic Information**: Interface Number, Name (in rounded border card with `DetailRow` helper)
3. **Export Configuration**: Mandant Number, Export Script, Export Path, Output Filename (show `-` for null/empty values)
4. **Assigned Accounts**: If `item.accounts` has entries, show a mini table (Code, Name, Payroll Code). If empty, show `t('noAccountsAssigned')` muted text.
5. **Timestamps**: Created, Last Updated (formatted with `date-fns` `format()`)

Loading state: Skeleton placeholders (same pattern as account-detail-sheet).

Footer buttons:
- Close (outline)
- Manage Accounts (outline, with Users icon)
- Edit (outline, with Edit icon)
- Delete (destructive, with Trash2 icon)

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx`

#### Manual Verification
- [ ] N/A -- component is tested via the page in Phase 7

---

## Phase 7: Account Mapping Dialog

### Overview
Create the account mapping dialog -- a wide sheet with dual-list layout for transferring accounts between "Available" and "Assigned" panels. This is a new pattern in the codebase, built entirely from existing UI primitives.

### Changes Required

#### 1. Account Mapping Dialog
**File**: `apps/web/src/components/export-interfaces/account-mapping-dialog.tsx` (new)

This is a new UI pattern. No existing dual-list exists to follow. Build from primitives.

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Loader2, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft,
  ChevronUp, ChevronDown, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { useAccounts } from '@/hooks/api/use-accounts'
import {
  useExportInterfaceAccounts,
  useSetExportInterfaceAccounts,
} from '@/hooks/api/use-export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']
type Account = components['schemas']['Account']
type ExportInterfaceAccount = components['schemas']['ExportInterfaceAccount']

interface AccountMappingDialogProps {
  item: ExportInterface | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}
```

Internal state:
```ts
// Local state for assigned account IDs (ordered array)
const [assignedIds, setAssignedIds] = React.useState<string[]>([])
// Selected checkboxes for each panel
const [selectedAvailable, setSelectedAvailable] = React.useState<Set<string>>(new Set())
const [selectedAssigned, setSelectedAssigned] = React.useState<Set<string>>(new Set())
// Search filters
const [searchAvailable, setSearchAvailable] = React.useState('')
const [searchAssigned, setSearchAssigned] = React.useState('')
// Error/success state
const [error, setError] = React.useState<string | null>(null)
const [success, setSuccess] = React.useState<string | null>(null)
```

Data loading:
- `useAccounts({ active: true, enabled: open && !!item })` -- all active accounts
- `useExportInterfaceAccounts(item?.id ?? '', open && !!item)` -- currently assigned accounts

On open (useEffect when `open` changes to `true`):
- Initialize `assignedIds` from the fetched assigned accounts data (ordered by `sort_order`)
- Clear selections, search, error/success states

Computed lists:
- `allAccounts`: the full list from `useAccounts` result
- `availableAccounts`: `allAccounts.filter(a => !assignedIds.includes(a.id))`, further filtered by `searchAvailable`
- `assignedAccountsFull`: map `assignedIds` to full account objects (from allAccounts + assigned accounts data), further filtered by `searchAssigned`

Transfer actions:
- **Add Selected** (right arrow): move `selectedAvailable` items to end of `assignedIds`, clear `selectedAvailable`
- **Remove Selected** (left arrow): remove `selectedAssigned` items from `assignedIds`, clear `selectedAssigned`
- **Add All** (double right arrow): move all visible available accounts to `assignedIds`
- **Remove All** (double left arrow): clear `assignedIds`

Reorder actions (on assigned panel):
- **Move Up**: for each selected assigned item (in order), swap with previous item
- **Move Down**: for each selected assigned item (in reverse order), swap with next item

Layout (inside Sheet with `side="right"` and wider width `sm:max-w-4xl`):
```
+------------------------------------------+
| Sheet Header: title + description        |
+------------------------------------------+
| [Available Panel]  [Btns]  [Assigned]    |
| +------------+   [>>]   +------------+   |
| | Search...  |   [>]    | Search...  |   |
| | [x] ACC01  |   [<]    | [x] ACC03  |   |
| | [x] ACC02  |   [<<]   | [ ] ACC04  |   |
| | [ ] ACC05  |          | [ ] ACC06  |   |
| +------------+          +--------+---+   |
|                         | [^] [v]    |   |
+------------------------------------------+
| [Cancel]            [Save Assignments]   |
+------------------------------------------+
```

Each account row in both panels shows:
- Checkbox for multi-select
- Account code (font-mono, muted)
- Account name

Save action:
- Calls `setAccountsMutation.mutateAsync({ path: { id: item.id }, body: { account_ids: assignedIds } })`
- On success: set `success` message, call `onSuccess?.()` after brief delay
- On error: display error message

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/components/export-interfaces/account-mapping-dialog.tsx`

#### Manual Verification
- [ ] N/A -- component is tested via the page in Phase 8

---

## Phase 8: Barrel Export and Page Component

### Overview
Create the barrel export file, and the main page component that wires everything together -- data fetching, filtering, state management, and all dialog/sheet orchestration. This phase also adds the page skeleton.

### Changes Required

#### 1. Barrel Export
**File**: `apps/web/src/components/export-interfaces/index.ts` (new)

```ts
export { ExportInterfaceDataTable } from './export-interface-data-table'
export { ExportInterfaceFormSheet } from './export-interface-form-sheet'
export { ExportInterfaceDetailSheet } from './export-interface-detail-sheet'
export { AccountMappingDialog } from './account-mapping-dialog'
```

#### 2. Page Component
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx` (new)

Follow pattern from `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`.

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Settings2, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useExportInterfaces,
  useDeleteExportInterface,
} from '@/hooks/api/use-export-interfaces'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  ExportInterfaceDataTable,
  ExportInterfaceFormSheet,
  ExportInterfaceDetailSheet,
  AccountMappingDialog,
} from '@/components/export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']
```

State management:
```ts
// Filters
const [search, setSearch] = React.useState('')
const [statusFilter, setStatusFilter] = React.useState<string>('all')

// Dialog/sheet state
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<ExportInterface | null>(null)
const [viewItem, setViewItem] = React.useState<ExportInterface | null>(null)
const [deleteItem, setDeleteItem] = React.useState<ExportInterface | null>(null)
const [deleteError, setDeleteError] = React.useState<string | null>(null)
const [accountMappingItem, setAccountMappingItem] = React.useState<ExportInterface | null>(null)
```

Data fetching:
```ts
const { data: interfacesData, isLoading } = useExportInterfaces({
  enabled: !authLoading && isAdmin,
})
const deleteMutation = useDeleteExportInterface()
```

Extract interfaces from wrapped response:
```ts
const interfaces = (interfacesData as { data?: ExportInterface[] })?.data ?? []
```

Client-side filtering:
```ts
const filteredInterfaces = React.useMemo(() => {
  return interfaces.filter((item) => {
    if (search) {
      const s = search.toLowerCase()
      if (
        !item.name?.toLowerCase().includes(s) &&
        !String(item.interface_number).includes(s)
      ) {
        return false
      }
    }
    if (statusFilter === 'active' && !item.is_active) return false
    if (statusFilter === 'inactive' && item.is_active) return false
    return true
  })
}, [interfaces, search, statusFilter])
```

Handler functions:
- `handleView(item)` -- sets `viewItem`
- `handleEdit(item)` -- sets `editItem`, clears `viewItem`
- `handleDelete(item)` -- sets `deleteItem`, clears `deleteError`
- `handleManageAccounts(item)` -- sets `accountMappingItem`, clears `viewItem`
- `handleConfirmDelete` -- calls `deleteMutation.mutateAsync`, on success clears `deleteItem` and `viewItem`. On error: check if 409 (interface in use), set `deleteError` with `t('deleteInUse')` message, otherwise set generic error.
- `handleFormSuccess` -- clears `createOpen` and `editItem`

Delete 409 handling:
```ts
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
      setDeleteError(t('deleteInUse'))
    } else {
      setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
    }
  }
}
```

For the delete dialog, use a custom description that includes `deleteError` if present:
```tsx
<ConfirmDialog
  open={!!deleteItem}
  onOpenChange={(open) => {
    if (!open) {
      setDeleteItem(null)
      setDeleteError(null)
    }
  }}
  title={t('deleteTitle')}
  description={
    deleteError
      ? deleteError
      : deleteItem
        ? t('deleteDescription', {
            name: deleteItem.name,
            number: deleteItem.interface_number,
          })
        : ''
  }
  confirmLabel={t('delete')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

Page layout:
```
<div className="space-y-6">
  <!-- Header: title, subtitle, "New Interface" button -->
  <!-- Filters bar: SearchInput, Status Select, Clear filters button -->
  <!-- Count display -->
  <Card>
    <CardContent className="p-0">
      <!-- isLoading ? Skeleton : empty state or DataTable -->
    </CardContent>
  </Card>
  <ExportInterfaceFormSheet ... />
  <ExportInterfaceDetailSheet ... />
  <AccountMappingDialog ... />
  <ConfirmDialog ... />  <!-- Delete confirmation -->
</div>
```

Status filter options:
```ts
const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'inactive', labelKey: 'inactive' },
] as const
```

Empty state: `EmptyState` component (private function at bottom of file) with Settings2 icon, using `t('emptyTitle')`, `t('emptyFilterHint')`, `t('emptyGetStarted')`, and a button to `setCreateOpen(true)`.

Page skeleton: `ExportInterfacesPageSkeleton` (private function at bottom of file) with header + filters + content skeleton.

Admin guard: same pattern as accounts page (`useHasRole(['admin'])`, redirect to `/dashboard` if not admin, return null during check).

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] File exists: `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`
- [ ] File exists: `apps/web/src/components/export-interfaces/index.ts`
- [ ] No linting errors: `cd apps/web && npx next lint`

#### Manual Verification
- [ ] Navigate to `/admin/export-interfaces` -- page loads with correct layout
- [ ] Table displays existing export interfaces (if any from backend seeding)
- [ ] Empty state shows when no interfaces exist, with "Add Interface" button
- [ ] Search filter works (filters by name and number)
- [ ] Status filter works (shows all, active only, inactive only)
- [ ] Count display updates correctly with filters
- [ ] Row click opens detail sheet with all interface information
- [ ] Detail sheet shows assigned accounts section (empty or populated)
- [ ] "New Interface" button opens form sheet in create mode
- [ ] Create form validates required fields (number, name)
- [ ] Create form submits successfully and new interface appears in table
- [ ] Attempting to create with duplicate number shows 409 error inline
- [ ] Edit from detail sheet or table action opens form sheet in edit mode, number field disabled
- [ ] Edit saves successfully
- [ ] "Manage Accounts" opens account mapping dialog
- [ ] Account mapping shows available vs. assigned accounts correctly
- [ ] Transfer buttons move accounts between panels
- [ ] Reorder (up/down) buttons change order of assigned accounts
- [ ] Search works in both account panels
- [ ] Save in account mapping calls PUT and persists changes
- [ ] Delete confirmation dialog appears with correct interface name/number
- [ ] Delete succeeds for interfaces without generated exports
- [ ] Delete shows 409 error message for interfaces with generated exports
- [ ] Breadcrumbs show: Home > Administration > Export Interfaces
- [ ] Sidebar highlights "Export Interfaces" when on the page
- [ ] Non-admin users are redirected to dashboard
- [ ] Switching language to German shows all text in German

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## File Summary

### Files to Create (8 files)

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/web/src/hooks/api/use-export-interfaces.ts` | API hooks: list, get, create, update, delete, get accounts, set accounts |
| 2 | `apps/web/src/components/export-interfaces/export-interface-data-table.tsx` | Data table with columns, sorting, action dropdowns, inline skeleton |
| 3 | `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx` | Create/edit form sheet with manual validation |
| 4 | `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx` | Read-only detail sheet with assigned accounts display |
| 5 | `apps/web/src/components/export-interfaces/account-mapping-dialog.tsx` | Dual-list account assignment dialog (new pattern) |
| 6 | `apps/web/src/components/export-interfaces/index.ts` | Barrel export |
| 7 | `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx` | Page component with all state management |

### Files to Modify (5 files)

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/hooks/api/index.ts` | Add export-interfaces hook exports |
| 2 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add nav item + Settings2 import |
| 3 | `apps/web/src/components/layout/breadcrumbs.tsx` | Add segment mapping |
| 4 | `apps/web/messages/en.json` | Add nav, breadcrumbs, adminExportInterfaces translations |
| 5 | `apps/web/messages/de.json` | Add nav, breadcrumbs, adminExportInterfaces translations |

### Files NOT Modified (preserved)

| File | Reason |
|------|--------|
| `apps/web/src/hooks/api/use-payroll-exports.ts` | Existing `useExportInterfaces` hook preserved for backward compatibility |

## Testing Strategy

### Manual Testing Steps
1. Create interface "DATEV Standard" with number 1, mandant "12345" -- verify it appears in table
2. Create another interface with number 1 -- verify 409 "Interface number already exists" error
3. Edit "DATEV Standard" name to "DATEV Export" -- verify update persists on page refresh
4. Open account mapping for "DATEV Export" -- verify available accounts list populated
5. Add 3 accounts from available to assigned, reorder, save -- verify in detail sheet
6. Remove 1 account from assigned, save -- verify 2 remain
7. Delete "DATEV Export" (no generated exports) -- verify it disappears
8. Create another interface, generate a payroll export for it via payroll exports page, then try to delete -- verify 409 error
9. Switch language to German -- verify all UI text updates

## Performance Considerations

- Client-side filtering is appropriate since export interface counts are typically low (under 50)
- Account list for the mapping dialog could be larger; ScrollArea handles virtualization-free rendering for lists under ~500 items
- `useMemo` used for filtered lists to prevent unnecessary re-computation

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-045-export-interface-configuration-ui.md`
- Research document: `thoughts/shared/research/2026-02-03-ZMI-TICKET-045-export-interface-configuration-ui.md`
- Accounts page pattern: `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
- Accounts data table: `apps/web/src/components/accounts/account-data-table.tsx`
- Accounts form sheet: `apps/web/src/components/accounts/account-form-sheet.tsx`
- Accounts detail sheet: `apps/web/src/components/accounts/account-detail-sheet.tsx`
- Accounts hooks: `apps/web/src/hooks/api/use-accounts.ts`
- Confirm dialog: `apps/web/src/components/ui/confirm-dialog.tsx`
- Sidebar nav config: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`
- Breadcrumbs: `apps/web/src/components/layout/breadcrumbs.tsx`
- API error handling: `apps/web/src/lib/api/errors.ts`
- Backend handler: `apps/api/internal/handler/exportinterface.go`
- OpenAPI spec: `api/paths/export-interfaces.yaml`, `api/schemas/export-interfaces.yaml`
