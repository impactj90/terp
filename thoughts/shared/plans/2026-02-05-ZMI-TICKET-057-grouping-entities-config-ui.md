# ZMI-TICKET-057: Grouping Entities Configuration UI - Implementation Plan

## Overview

Implement CRUD interfaces for account groups, booking type groups, and absence type groups. Each is embedded as a "Groups" tab within its respective existing admin page (accounts, booking-types, absence-types). The backend APIs are already fully implemented; this ticket is frontend-only.

## Current State Analysis

- **Accounts page** (`apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`): Single-page layout, no tabs. Groups accounts by type in an `AccountDataTable`.
- **Booking Types page** (`apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`): Single-page layout, uses `Tabs`/`TabsTrigger` only as a direction filter (in/out/all), not for page-level content switching.
- **Absence Types page** (`apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`): Single-page layout, no tabs.
- **API hooks pattern**: `apps/web/src/hooks/api/use-accounts.ts`, `use-booking-types.ts` -- `useApiQuery` / `useApiMutation` wrappers with `invalidateKeys`.
- **Data table pattern**: `apps/web/src/components/accounts/account-data-table.tsx` -- `Table` with props for data array, loading, callbacks. `DropdownMenu` actions per row.
- **Form sheet pattern**: `apps/web/src/components/accounts/account-form-sheet.tsx` -- `Sheet` with `FormState` interface, `INITIAL_STATE`, `useEffect` reset, client-side validation, create/update mutations.
- **Tab pattern**: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx` -- `Tabs` + `TabsContent` with controlled `useState`, `TabsTrigger` per tab.
- **Multi-select pattern**: `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` -- `SearchInput` + `ScrollArea` + `Checkbox` list.
- **Generated types**: All three group schemas available in `apps/web/src/lib/api/types.ts` (lines 7041, 7359, 7012).
- **Translation pattern**: Flat namespace keys in `apps/web/messages/en.json` and `de.json`, e.g. `"adminAccounts": { ... }`.

### Key Discoveries:
- All three backend APIs are fully implemented and registered in `apps/api/internal/handler/routes.go` (account-groups:152, booking-type-groups:719, absence-type-groups:679).
- `BookingTypeGroup` schema uniquely includes `booking_type_ids: string[]` for member assignment.
- `AccountGroup` uniquely includes `sort_order` field.
- `BookingTypeGroup.UpdateBookingTypeGroupRequest` does NOT include `code` -- code is immutable after creation for this type.
- The booking-types page currently uses `Tabs` for direction filtering. Adding page-level tabs requires renaming the existing direction filter tabs to avoid conflicts (use a different `Tabs` instance or a `Select`/`ToggleGroup` for the direction filter).

## Desired End State

After implementation:
1. Each of the three admin pages (accounts, booking-types, absence-types) has a two-tab layout: the original content in a primary tab and a "Groups" tab.
2. The "Groups" tab for each page provides full CRUD for the respective group type with a data table, form sheet, and delete confirmation.
3. Booking type groups additionally include a multi-select for assigning booking type members.
4. All UI text is translated in both English and German.
5. Tab state is preserved within each page (no URL sync needed -- simple `useState`).

### Verification:
- Navigate to each admin page and confirm two tabs appear.
- Create, edit, and delete a group in each tab.
- For booking type groups, assign members and verify member count in the table.
- Switch language to German and verify all labels render correctly.

## What We're NOT Doing

- No backend changes (APIs are complete).
- No new routes or sidebar entries.
- No detail sheet for groups (only table + form sheet + delete dialog).
- No URL-synced tab state (simple local state is sufficient).
- No component tests in this ticket (tests are listed in the ticket but not prioritized for this implementation).

## Implementation Approach

Build bottom-up: API hooks first, then components (data tables and form sheets), then page integration, and finally translations. Each group type follows the same pattern, so implement one fully (account groups) and then replicate for the other two, adding the multi-select for booking type groups.

---

## Phase 1: API Hooks

### Overview
Create the three API hook files and register exports.

### Changes Required:

#### 1. Account Groups Hook
**File**: `apps/web/src/hooks/api/use-account-groups.ts` (NEW)
**Pattern**: Follow `apps/web/src/hooks/api/use-booking-types.ts`

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAccountGroupsOptions {
  active?: boolean
  enabled?: boolean
}

export function useAccountGroups(options: UseAccountGroupsOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/account-groups', {
    params: { active },
    enabled,
  })
}

export function useAccountGroup(id: string, enabled = true) {
  return useApiQuery('/account-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccountGroup() {
  return useApiMutation('/account-groups', 'post', {
    invalidateKeys: [['/account-groups']],
  })
}

export function useUpdateAccountGroup() {
  return useApiMutation('/account-groups/{id}', 'patch', {
    invalidateKeys: [['/account-groups'], ['/account-groups/{id}']],
  })
}

export function useDeleteAccountGroup() {
  return useApiMutation('/account-groups/{id}', 'delete', {
    invalidateKeys: [['/account-groups'], ['/account-groups/{id}']],
  })
}
```

#### 2. Booking Type Groups Hook
**File**: `apps/web/src/hooks/api/use-booking-type-groups.ts` (NEW)
**Pattern**: Same as above, paths use `/booking-type-groups`

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseBookingTypeGroupsOptions {
  active?: boolean
  enabled?: boolean
}

export function useBookingTypeGroups(options: UseBookingTypeGroupsOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/booking-type-groups', {
    params: { active },
    enabled,
  })
}

export function useBookingTypeGroup(id: string, enabled = true) {
  return useApiQuery('/booking-type-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateBookingTypeGroup() {
  return useApiMutation('/booking-type-groups', 'post', {
    invalidateKeys: [['/booking-type-groups']],
  })
}

export function useUpdateBookingTypeGroup() {
  return useApiMutation('/booking-type-groups/{id}', 'patch', {
    invalidateKeys: [['/booking-type-groups'], ['/booking-type-groups/{id}']],
  })
}

export function useDeleteBookingTypeGroup() {
  return useApiMutation('/booking-type-groups/{id}', 'delete', {
    invalidateKeys: [['/booking-type-groups'], ['/booking-type-groups/{id}']],
  })
}
```

#### 3. Absence Type Groups Hook
**File**: `apps/web/src/hooks/api/use-absence-type-groups.ts` (NEW)
**Pattern**: Same as above, paths use `/absence-type-groups`

```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseAbsenceTypeGroupsOptions {
  active?: boolean
  enabled?: boolean
}

export function useAbsenceTypeGroups(options: UseAbsenceTypeGroupsOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/absence-type-groups', {
    params: { active },
    enabled,
  })
}

export function useAbsenceTypeGroup(id: string, enabled = true) {
  return useApiQuery('/absence-type-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAbsenceTypeGroup() {
  return useApiMutation('/absence-type-groups', 'post', {
    invalidateKeys: [['/absence-type-groups']],
  })
}

export function useUpdateAbsenceTypeGroup() {
  return useApiMutation('/absence-type-groups/{id}', 'patch', {
    invalidateKeys: [['/absence-type-groups'], ['/absence-type-groups/{id}']],
  })
}

export function useDeleteAbsenceTypeGroup() {
  return useApiMutation('/absence-type-groups/{id}', 'delete', {
    invalidateKeys: [['/absence-type-groups'], ['/absence-type-groups/{id}']],
  })
}
```

#### 4. Update Hook Index
**File**: `apps/web/src/hooks/api/index.ts` (MODIFY)
**Changes**: Add three new export blocks at the end of the file, before the closing.

```tsx
// Account Groups
export {
  useAccountGroups,
  useAccountGroup,
  useCreateAccountGroup,
  useUpdateAccountGroup,
  useDeleteAccountGroup,
} from './use-account-groups'

// Booking Type Groups
export {
  useBookingTypeGroups,
  useBookingTypeGroup,
  useCreateBookingTypeGroup,
  useUpdateBookingTypeGroup,
  useDeleteBookingTypeGroup,
} from './use-booking-type-groups'

// Absence Type Groups
export {
  useAbsenceTypeGroups,
  useAbsenceTypeGroup,
  useCreateAbsenceTypeGroup,
  useUpdateAbsenceTypeGroup,
  useDeleteAbsenceTypeGroup,
} from './use-absence-type-groups'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] All new hook files exist and export the expected functions
- [ ] Index file re-exports all new hooks

#### Manual Verification:
- [ ] N/A for this phase (hooks verified through component usage in Phase 2)

---

## Phase 2: Translation Keys

### Overview
Add translation namespaces for all three group types in both English and German.

### Changes Required:

#### 1. English Translations
**File**: `apps/web/messages/en.json` (MODIFY)
**Changes**: Add three new namespace objects. Insert after the `"adminAccounts"` section (after line 2222).

The namespaces to add are `"adminAccountGroups"`, `"adminBookingTypeGroups"`, and `"adminAbsenceTypeGroups"`. Each follows the same key structure as existing admin pages.

```json
"adminAccountGroups": {
  "title": "Account Groups",
  "subtitle": "Manage account groups for organizing accounts",
  "tabLabel": "Groups",
  "newGroup": "New Group",
  "searchPlaceholder": "Search by code or name...",
  "clearFilters": "Clear filters",
  "groupCount": "{count} group",
  "groupsCount": "{count} groups",
  "deleteGroup": "Delete Account Group",
  "deleteDescription": "Are you sure you want to delete \"{name}\" ({code})? This action cannot be undone.",
  "delete": "Delete",
  "emptyTitle": "No account groups found",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first account group",
  "addGroup": "Add Group",
  "actions": "Actions",
  "cancel": "Cancel",
  "codeHint": "Unique code (uppercase, max 20 chars)",
  "codePlaceholder": "e.g. OVERTIME",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Description",
  "columnSortOrder": "Sort Order",
  "columnStatus": "Status",
  "create": "Create",
  "createDescription": "Add a new account group.",
  "descriptionPlaceholder": "Optional description...",
  "edit": "Edit",
  "editGroup": "Edit Account Group",
  "editDescription": "Modify the selected account group.",
  "failedCreate": "Failed to create account group",
  "failedUpdate": "Failed to update account group",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive groups are hidden from selections",
  "fieldCode": "Code",
  "fieldDescription": "Description",
  "fieldName": "Name",
  "fieldSortOrder": "Sort Order",
  "namePlaceholder": "e.g. Overtime Accounts",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "sectionBasicInfo": "Basic Information",
  "sectionOrdering": "Ordering",
  "sectionStatus": "Status",
  "sortOrderHint": "Lower numbers appear first",
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "validationCodeMaxLength": "Code must be at most 20 characters",
  "validationCodeRequired": "Code is required",
  "validationNameMaxLength": "Name must be at most 255 characters",
  "validationNameRequired": "Name is required"
},
"adminBookingTypeGroups": {
  "title": "Booking Type Groups",
  "subtitle": "Manage booking type groups and member assignments",
  "tabLabel": "Groups",
  "newGroup": "New Group",
  "searchPlaceholder": "Search by code or name...",
  "clearFilters": "Clear filters",
  "groupCount": "{count} group",
  "groupsCount": "{count} groups",
  "deleteGroup": "Delete Booking Type Group",
  "deleteDescription": "Are you sure you want to delete \"{name}\" ({code})? This action cannot be undone.",
  "delete": "Delete",
  "emptyTitle": "No booking type groups found",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first booking type group",
  "addGroup": "Add Group",
  "actions": "Actions",
  "cancel": "Cancel",
  "codeHint": "Unique code (uppercase, max 20 chars)",
  "codePlaceholder": "e.g. ENTRY",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Description",
  "columnMembers": "Members",
  "columnStatus": "Status",
  "create": "Create",
  "createDescription": "Add a new booking type group.",
  "descriptionPlaceholder": "Optional description...",
  "edit": "Edit",
  "editGroup": "Edit Booking Type Group",
  "editDescription": "Modify the selected booking type group.",
  "failedCreate": "Failed to create booking type group",
  "failedUpdate": "Failed to update booking type group",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive groups are hidden from selections",
  "fieldCode": "Code",
  "fieldDescription": "Description",
  "fieldName": "Name",
  "namePlaceholder": "e.g. Entry Types",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "sectionBasicInfo": "Basic Information",
  "sectionMembers": "Booking Type Members",
  "sectionStatus": "Status",
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "validationCodeMaxLength": "Code must be at most 20 characters",
  "validationCodeRequired": "Code is required",
  "validationNameMaxLength": "Name must be at most 255 characters",
  "validationNameRequired": "Name is required",
  "membersSearchPlaceholder": "Search booking types...",
  "membersSelectAll": "Select all ({count})",
  "membersSelected": "{count} selected",
  "membersNone": "No booking types available",
  "memberCount": "{count} member",
  "membersCount": "{count} members"
},
"adminAbsenceTypeGroups": {
  "title": "Absence Type Groups",
  "subtitle": "Manage absence type groups for organizing absence types",
  "tabLabel": "Groups",
  "newGroup": "New Group",
  "searchPlaceholder": "Search by code or name...",
  "clearFilters": "Clear filters",
  "groupCount": "{count} group",
  "groupsCount": "{count} groups",
  "deleteGroup": "Delete Absence Type Group",
  "deleteDescription": "Are you sure you want to delete \"{name}\" ({code})? This action cannot be undone.",
  "delete": "Delete",
  "emptyTitle": "No absence type groups found",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Get started by creating your first absence type group",
  "addGroup": "Add Group",
  "actions": "Actions",
  "cancel": "Cancel",
  "codeHint": "Unique code (uppercase, max 20 chars)",
  "codePlaceholder": "e.g. MEDICAL",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Description",
  "columnStatus": "Status",
  "create": "Create",
  "createDescription": "Add a new absence type group.",
  "descriptionPlaceholder": "Optional description...",
  "edit": "Edit",
  "editGroup": "Edit Absence Type Group",
  "editDescription": "Modify the selected absence type group.",
  "failedCreate": "Failed to create absence type group",
  "failedUpdate": "Failed to update absence type group",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive groups are hidden from selections",
  "fieldCode": "Code",
  "fieldDescription": "Description",
  "fieldName": "Name",
  "namePlaceholder": "e.g. Medical Absences",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "sectionBasicInfo": "Basic Information",
  "sectionStatus": "Status",
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "validationCodeMaxLength": "Code must be at most 20 characters",
  "validationCodeRequired": "Code is required",
  "validationNameMaxLength": "Name must be at most 255 characters",
  "validationNameRequired": "Name is required"
}
```

Also add tab label keys to the existing parent namespaces:
- In `"adminAccounts"`: add `"tabAccounts": "Accounts"`, `"tabGroups": "Groups"`
- In `"adminBookingTypes"`: add `"tabBookingTypes": "Booking Types"`, `"tabGroups": "Groups"`
- In `"adminAbsenceTypes"`: add `"tabAbsenceTypes": "Absence Types"`, `"tabGroups": "Groups"`

#### 2. German Translations
**File**: `apps/web/messages/de.json` (MODIFY)
**Changes**: Mirror structure with German translations.

```json
"adminAccountGroups": {
  "title": "Kontogruppen",
  "subtitle": "Kontogruppen zur Organisation von Konten verwalten",
  "tabLabel": "Gruppen",
  "newGroup": "Neue Gruppe",
  "searchPlaceholder": "Nach Code oder Name suchen...",
  "clearFilters": "Filter zurücksetzen",
  "groupCount": "{count} Gruppe",
  "groupsCount": "{count} Gruppen",
  "deleteGroup": "Kontogruppe löschen",
  "deleteDescription": "Sind Sie sicher, dass Sie \"{name}\" ({code}) löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.",
  "delete": "Löschen",
  "emptyTitle": "Keine Kontogruppen gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Beginnen Sie mit der Erstellung Ihrer ersten Kontogruppe",
  "addGroup": "Gruppe hinzufügen",
  "actions": "Aktionen",
  "cancel": "Abbrechen",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 20 Zeichen)",
  "codePlaceholder": "z.B. UEBERSTD",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Beschreibung",
  "columnSortOrder": "Sortierung",
  "columnStatus": "Status",
  "create": "Erstellen",
  "createDescription": "Neue Kontogruppe hinzufügen.",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "edit": "Bearbeiten",
  "editGroup": "Kontogruppe bearbeiten",
  "editDescription": "Ausgewählte Kontogruppe bearbeiten.",
  "failedCreate": "Kontogruppe konnte nicht erstellt werden",
  "failedUpdate": "Kontogruppe konnte nicht aktualisiert werden",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Gruppen werden in Auswahlen ausgeblendet",
  "fieldCode": "Code",
  "fieldDescription": "Beschreibung",
  "fieldName": "Name",
  "fieldSortOrder": "Sortierreihenfolge",
  "namePlaceholder": "z.B. Überstundenkonten",
  "saveChanges": "Änderungen speichern",
  "saving": "Speichern...",
  "sectionBasicInfo": "Grundinformationen",
  "sectionOrdering": "Sortierung",
  "sectionStatus": "Status",
  "sortOrderHint": "Niedrigere Zahlen erscheinen zuerst",
  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "validationCodeMaxLength": "Code darf maximal 20 Zeichen lang sein",
  "validationCodeRequired": "Code ist erforderlich",
  "validationNameMaxLength": "Name darf maximal 255 Zeichen lang sein",
  "validationNameRequired": "Name ist erforderlich"
},
"adminBookingTypeGroups": {
  "title": "Buchungsartgruppen",
  "subtitle": "Buchungsartgruppen und Mitgliederzuweisungen verwalten",
  "tabLabel": "Gruppen",
  "newGroup": "Neue Gruppe",
  "searchPlaceholder": "Nach Code oder Name suchen...",
  "clearFilters": "Filter zurücksetzen",
  "groupCount": "{count} Gruppe",
  "groupsCount": "{count} Gruppen",
  "deleteGroup": "Buchungsartgruppe löschen",
  "deleteDescription": "Sind Sie sicher, dass Sie \"{name}\" ({code}) löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.",
  "delete": "Löschen",
  "emptyTitle": "Keine Buchungsartgruppen gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Beginnen Sie mit der Erstellung Ihrer ersten Buchungsartgruppe",
  "addGroup": "Gruppe hinzufügen",
  "actions": "Aktionen",
  "cancel": "Abbrechen",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 20 Zeichen)",
  "codePlaceholder": "z.B. EINGANG",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Beschreibung",
  "columnMembers": "Mitglieder",
  "columnStatus": "Status",
  "create": "Erstellen",
  "createDescription": "Neue Buchungsartgruppe hinzufügen.",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "edit": "Bearbeiten",
  "editGroup": "Buchungsartgruppe bearbeiten",
  "editDescription": "Ausgewählte Buchungsartgruppe bearbeiten.",
  "failedCreate": "Buchungsartgruppe konnte nicht erstellt werden",
  "failedUpdate": "Buchungsartgruppe konnte nicht aktualisiert werden",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Gruppen werden in Auswahlen ausgeblendet",
  "fieldCode": "Code",
  "fieldDescription": "Beschreibung",
  "fieldName": "Name",
  "namePlaceholder": "z.B. Eingangstypen",
  "saveChanges": "Änderungen speichern",
  "saving": "Speichern...",
  "sectionBasicInfo": "Grundinformationen",
  "sectionMembers": "Buchungsart-Mitglieder",
  "sectionStatus": "Status",
  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "validationCodeMaxLength": "Code darf maximal 20 Zeichen lang sein",
  "validationCodeRequired": "Code ist erforderlich",
  "validationNameMaxLength": "Name darf maximal 255 Zeichen lang sein",
  "validationNameRequired": "Name ist erforderlich",
  "membersSearchPlaceholder": "Buchungsarten suchen...",
  "membersSelectAll": "Alle auswählen ({count})",
  "membersSelected": "{count} ausgewählt",
  "membersNone": "Keine Buchungsarten verfügbar",
  "memberCount": "{count} Mitglied",
  "membersCount": "{count} Mitglieder"
},
"adminAbsenceTypeGroups": {
  "title": "Abwesenheitsartgruppen",
  "subtitle": "Abwesenheitsartgruppen zur Organisation verwalten",
  "tabLabel": "Gruppen",
  "newGroup": "Neue Gruppe",
  "searchPlaceholder": "Nach Code oder Name suchen...",
  "clearFilters": "Filter zurücksetzen",
  "groupCount": "{count} Gruppe",
  "groupsCount": "{count} Gruppen",
  "deleteGroup": "Abwesenheitsartgruppe löschen",
  "deleteDescription": "Sind Sie sicher, dass Sie \"{name}\" ({code}) löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.",
  "delete": "Löschen",
  "emptyTitle": "Keine Abwesenheitsartgruppen gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Beginnen Sie mit der Erstellung Ihrer ersten Abwesenheitsartgruppe",
  "addGroup": "Gruppe hinzufügen",
  "actions": "Aktionen",
  "cancel": "Abbrechen",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 20 Zeichen)",
  "codePlaceholder": "z.B. MEDIZIN",
  "columnCode": "Code",
  "columnName": "Name",
  "columnDescription": "Beschreibung",
  "columnStatus": "Status",
  "create": "Erstellen",
  "createDescription": "Neue Abwesenheitsartgruppe hinzufügen.",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "edit": "Bearbeiten",
  "editGroup": "Abwesenheitsartgruppe bearbeiten",
  "editDescription": "Ausgewählte Abwesenheitsartgruppe bearbeiten.",
  "failedCreate": "Abwesenheitsartgruppe konnte nicht erstellt werden",
  "failedUpdate": "Abwesenheitsartgruppe konnte nicht aktualisiert werden",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Gruppen werden in Auswahlen ausgeblendet",
  "fieldCode": "Code",
  "fieldDescription": "Beschreibung",
  "fieldName": "Name",
  "namePlaceholder": "z.B. Medizinische Abwesenheiten",
  "saveChanges": "Änderungen speichern",
  "saving": "Speichern...",
  "sectionBasicInfo": "Grundinformationen",
  "sectionStatus": "Status",
  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",
  "validationCodeMaxLength": "Code darf maximal 20 Zeichen lang sein",
  "validationCodeRequired": "Code ist erforderlich",
  "validationNameMaxLength": "Name darf maximal 255 Zeichen lang sein",
  "validationNameRequired": "Name ist erforderlich"
}
```

Also add to the German parent namespaces:
- In `"adminAccounts"`: add `"tabAccounts": "Konten"`, `"tabGroups": "Gruppen"`
- In `"adminBookingTypes"`: add `"tabBookingTypes": "Buchungsarten"`, `"tabGroups": "Gruppen"`
- In `"adminAbsenceTypes"`: add `"tabAbsenceTypes": "Abwesenheitsarten"`, `"tabGroups": "Gruppen"`

### Success Criteria:

#### Automated Verification:
- [ ] JSON files are valid: `node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/en.json','utf8'))"`
- [ ] JSON files are valid: `node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/de.json','utf8'))"`
- [ ] Both files have matching namespace keys (all three group namespaces present in both)

#### Manual Verification:
- [ ] N/A for this phase (translations verified through UI in Phase 4)

---

## Phase 3: Components (Data Tables + Form Sheets)

### Overview
Create data table and form sheet components for all three group types, plus barrel export files.

### 3A: Account Groups Components

#### 1. Account Group Data Table
**File**: `apps/web/src/components/account-groups/account-group-data-table.tsx` (NEW)
**Pattern**: Follow `apps/web/src/components/accounts/account-data-table.tsx` but simpler (no type icon, no system accounts, no view action)

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type AccountGroup = components['schemas']['AccountGroup']

interface AccountGroupDataTableProps {
  groups: AccountGroup[]
  isLoading: boolean
  onEdit: (group: AccountGroup) => void
  onDelete: (group: AccountGroup) => void
}
```

Columns: Code (mono), Name, Description (truncated), Sort Order, Status (Badge + Switch), Actions (Edit/Delete dropdown).

The skeleton loading variant should follow the same pattern as `AccountDataTableSkeleton` in `account-data-table.tsx`.

#### 2. Account Group Form Sheet
**File**: `apps/web/src/components/account-groups/account-group-form-sheet.tsx` (NEW)
**Pattern**: Follow `apps/web/src/components/booking-types/booking-type-form-sheet.tsx`

```tsx
interface AccountGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: AccountGroup | null  // null = create mode
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  sortOrder: number
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  isActive: true,
}
```

Key details:
- Uses `useTranslations('adminAccountGroups')`
- `isEdit = !!group`
- Code field: disabled in edit mode, `.toUpperCase()` on change, maxLength 20
- Sort Order field: type="number", min=0
- Active switch: only shown in edit mode
- Sections: "Basic Information" (code, name, description), "Ordering" (sort_order), "Status" (active, edit only)
- Create body: `{ code, name, description?, sort_order }`
- Update body: `{ code, name, description?, sort_order, is_active }`
- Uses `useCreateAccountGroup()` and `useUpdateAccountGroup()` from hooks

#### 3. Barrel Export
**File**: `apps/web/src/components/account-groups/index.ts` (NEW)

```tsx
export { AccountGroupDataTable } from './account-group-data-table'
export { AccountGroupFormSheet } from './account-group-form-sheet'
```

### 3B: Booking Type Groups Components

#### 1. Booking Type Group Data Table
**File**: `apps/web/src/components/booking-type-groups/booking-type-group-data-table.tsx` (NEW)
**Pattern**: Same as account group data table.

Columns: Code (mono), Name, Description (truncated), **Members** (count badge), Status (Badge + Switch), Actions.

The Members column shows `(group.booking_type_ids?.length ?? 0)` with a label like "3 members".

#### 2. Booking Type Group Form Sheet
**File**: `apps/web/src/components/booking-type-groups/booking-type-group-form-sheet.tsx` (NEW)
**Pattern**: Follow `booking-type-form-sheet.tsx` + multi-select from `bulk-assign-dialog.tsx`

```tsx
interface BookingTypeGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: BookingTypeGroup | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  isActive: boolean
  bookingTypeIds: Set<string>  // multi-select state
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  isActive: true,
  bookingTypeIds: new Set(),
}
```

Key details:
- Uses `useTranslations('adminBookingTypeGroups')`
- **Code is immutable on edit** -- the `UpdateBookingTypeGroupRequest` schema does not include `code`
- Must fetch available booking types: `useBookingTypes({ enabled: open })` for the member multi-select
- Multi-select section ("Booking Type Members"):
  - `SearchInput` for filtering booking types
  - `ScrollArea` with `Checkbox` for each booking type
  - Display: `{code} - {name}` for each booking type
  - "Select all" toggle at top (following `bulk-assign-dialog.tsx` pattern)
  - Count display: "{n} selected"
- `useEffect` to populate `bookingTypeIds` from `group.booking_type_ids` on open
- Create body: `{ code, name, description?, booking_type_ids: Array.from(bookingTypeIds) }`
- Update body: `{ name, description?, is_active, booking_type_ids: Array.from(bookingTypeIds) }`

Multi-select section implementation (inside the ScrollArea within the form):

```tsx
{/* Members section */}
<div className="space-y-4">
  <h3 className="text-sm font-medium text-muted-foreground">{t('sectionMembers')}</h3>
  <SearchInput
    value={memberSearch}
    onChange={setMemberSearch}
    placeholder={t('membersSearchPlaceholder')}
    className="w-full"
  />
  <ScrollArea className="h-48 rounded-md border p-2">
    {filteredBookingTypes.length > 0 && (
      <div className="flex items-center gap-2 pb-2 mb-2 border-b">
        <Checkbox
          checked={
            filteredBookingTypes.length > 0 &&
            filteredBookingTypes.every((bt) => form.bookingTypeIds.has(bt.id))
          }
          onCheckedChange={() => toggleAll()}
        />
        <span className="text-xs text-muted-foreground">
          {t('membersSelectAll', { count: filteredBookingTypes.length })}
        </span>
      </div>
    )}
    {filteredBookingTypes.map((bt) => (
      <div key={bt.id} className="flex items-center gap-2 py-1">
        <Checkbox
          checked={form.bookingTypeIds.has(bt.id)}
          onCheckedChange={() => toggleBookingType(bt.id)}
        />
        <span className="text-sm">
          <span className="font-mono text-xs">{bt.code}</span> - {bt.name}
        </span>
      </div>
    ))}
    {filteredBookingTypes.length === 0 && (
      <p className="text-sm text-muted-foreground text-center py-4">
        {t('membersNone')}
      </p>
    )}
  </ScrollArea>
  {form.bookingTypeIds.size > 0 && (
    <p className="text-xs text-muted-foreground">
      {t('membersSelected', { count: form.bookingTypeIds.size })}
    </p>
  )}
</div>
```

Helper functions in the component:

```tsx
const [memberSearch, setMemberSearch] = React.useState('')

const bookingTypes = (bookingTypesData?.data ?? []) as BookingType[]

const filteredBookingTypes = React.useMemo(() => {
  if (!memberSearch) return bookingTypes
  const s = memberSearch.toLowerCase()
  return bookingTypes.filter(
    (bt) => bt.code?.toLowerCase().includes(s) || bt.name?.toLowerCase().includes(s)
  )
}, [bookingTypes, memberSearch])

const toggleBookingType = (id: string) => {
  setForm((prev) => {
    const next = new Set(prev.bookingTypeIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { ...prev, bookingTypeIds: next }
  })
}

const toggleAll = () => {
  setForm((prev) => {
    const allSelected = filteredBookingTypes.every((bt) => prev.bookingTypeIds.has(bt.id))
    const next = new Set(prev.bookingTypeIds)
    filteredBookingTypes.forEach((bt) => {
      if (allSelected) next.delete(bt.id)
      else next.add(bt.id)
    })
    return { ...prev, bookingTypeIds: next }
  })
}
```

#### 3. Barrel Export
**File**: `apps/web/src/components/booking-type-groups/index.ts` (NEW)

```tsx
export { BookingTypeGroupDataTable } from './booking-type-group-data-table'
export { BookingTypeGroupFormSheet } from './booking-type-group-form-sheet'
```

### 3C: Absence Type Groups Components

#### 1. Absence Type Group Data Table
**File**: `apps/web/src/components/absence-type-groups/absence-type-group-data-table.tsx` (NEW)
**Pattern**: Same as account group data table but without Sort Order column.

Columns: Code (mono), Name, Description (truncated), Status (Badge + Switch), Actions.

#### 2. Absence Type Group Form Sheet
**File**: `apps/web/src/components/absence-type-groups/absence-type-group-form-sheet.tsx` (NEW)
**Pattern**: Same as account group form sheet but without sort_order field.

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

Key details:
- Uses `useTranslations('adminAbsenceTypeGroups')`
- Sections: "Basic Information" (code, name, description), "Status" (active, edit only)
- Create body: `{ code, name, description? }`
- Update body: `{ code, name, description?, is_active }`

#### 3. Barrel Export
**File**: `apps/web/src/components/absence-type-groups/index.ts` (NEW)

```tsx
export { AbsenceTypeGroupDataTable } from './absence-type-group-data-table'
export { AbsenceTypeGroupFormSheet } from './absence-type-group-form-sheet'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] All component files exist in their respective directories
- [ ] Barrel exports resolve correctly

#### Manual Verification:
- [ ] N/A for this phase (components verified through page integration in Phase 4)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the TypeScript compilation is clean before proceeding to the next phase.

---

## Phase 4: Page Integration

### Overview
Wrap each existing admin page's content in a `Tabs` / `TabsContent` layout and add the "Groups" tab.

### 4A: Accounts Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx` (MODIFY)

Changes:
1. Add imports for `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`
2. Add imports for group hooks: `useAccountGroups`, `useDeleteAccountGroup`, `useUpdateAccountGroup` from `@/hooks/api`
3. Add imports for group components: `AccountGroupDataTable`, `AccountGroupFormSheet` from `@/components/account-groups`
4. Add translation hook: `const tGroups = useTranslations('adminAccountGroups')`
5. Add tab state: `const [activeTab, setActiveTab] = React.useState<'accounts' | 'groups'>('accounts')`
6. Add group-specific state: `createGroupOpen`, `editGroupItem`, `deleteGroupItem`
7. Add group data fetch: `useAccountGroups({ enabled: !authLoading && isAdmin })`
8. Add group mutations: `useDeleteAccountGroup()`, `useUpdateAccountGroup()`
9. Wrap existing JSX return inside `<Tabs>` / `<TabsContent value="accounts">` for the existing content
10. Add `<TabsContent value="groups">` with the groups CRUD UI

The page structure becomes:

```tsx
return (
  <div className="space-y-6">
    {/* Page header -- remains at top, outside tabs */}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      <Button onClick={() => activeTab === 'groups' ? setCreateGroupOpen(true) : setCreateOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {activeTab === 'groups' ? tGroups('newGroup') : t('newAccount')}
      </Button>
    </div>

    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'accounts' | 'groups')}>
      <TabsList>
        <TabsTrigger value="accounts">{t('tabAccounts')}</TabsTrigger>
        <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
      </TabsList>

      <TabsContent value="accounts" className="space-y-6">
        {/* All existing filters, count display, Card with AccountDataTable, etc. */}
      </TabsContent>

      <TabsContent value="groups" className="space-y-6">
        {/* Groups tab content: search filter, data table, form sheet, delete dialog */}
      </TabsContent>
    </Tabs>

    {/* Existing sheets/dialogs stay here -- AccountFormSheet, AccountDetailSheet, ConfirmDialog */}
    {/* Add group sheets/dialogs here too -- AccountGroupFormSheet, group ConfirmDialog */}
  </div>
)
```

The groups tab content follows the same pattern as the existing accounts content but simpler:

```tsx
<TabsContent value="groups" className="space-y-6">
  {/* Filters */}
  <div className="flex flex-wrap items-center gap-4">
    <SearchInput
      value={groupSearch}
      onChange={setGroupSearch}
      placeholder={tGroups('searchPlaceholder')}
      className="w-full sm:w-64"
    />
    {groupSearch && (
      <Button variant="ghost" size="sm" onClick={() => setGroupSearch('')}>
        <X className="mr-2 h-4 w-4" />
        {tGroups('clearFilters')}
      </Button>
    )}
  </div>

  {/* Count */}
  <div className="text-sm text-muted-foreground">
    {filteredGroups.length === 1
      ? tGroups('groupCount', { count: filteredGroups.length })
      : tGroups('groupsCount', { count: filteredGroups.length })}
  </div>

  {/* Table */}
  <Card>
    <CardContent className="p-0">
      {groupsLoading ? (
        <div className="p-6"><Skeleton className="h-64" /></div>
      ) : filteredGroups.length === 0 ? (
        <GroupEmptyState hasFilters={!!groupSearch} onCreateClick={() => setCreateGroupOpen(true)} />
      ) : (
        <AccountGroupDataTable
          groups={filteredGroups}
          isLoading={false}
          onEdit={(g) => setEditGroupItem(g)}
          onDelete={(g) => setDeleteGroupItem(g)}
        />
      )}
    </CardContent>
  </Card>
</TabsContent>
```

State and data for groups:

```tsx
// Group state
const [groupSearch, setGroupSearch] = React.useState('')
const [createGroupOpen, setCreateGroupOpen] = React.useState(false)
const [editGroupItem, setEditGroupItem] = React.useState<AccountGroup | null>(null)
const [deleteGroupItem, setDeleteGroupItem] = React.useState<AccountGroup | null>(null)

// Group data
const { data: groupsData, isLoading: groupsLoading } = useAccountGroups({
  enabled: !authLoading && isAdmin,
})
const deleteGroupMutation = useDeleteAccountGroup()
const accountGroups = (groupsData as { data?: AccountGroup[] })?.data ?? []

const filteredGroups = React.useMemo(() => {
  if (!groupSearch) return accountGroups
  const s = groupSearch.toLowerCase()
  return accountGroups.filter(
    (g) => g.code?.toLowerCase().includes(s) || g.name?.toLowerCase().includes(s)
  )
}, [accountGroups, groupSearch])
```

Note: There is an existing variable called `accountGroups` on line 185 that holds the visual grouping of accounts by type. This must be renamed to something like `accountTypeGroups` to avoid collision with the new `accountGroups` data from the API. Check and rename accordingly.

### 4B: Booking Types Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx` (MODIFY)

This page is more complex because it already uses `<Tabs>` for direction filtering (in/out/all). The approach:

1. Add a **page-level** `<Tabs>` component wrapping everything (for "Booking Types" / "Groups" tabs)
2. The existing direction filter `<Tabs>` stays inside `<TabsContent value="booking-types">` -- it works independently because Radix Tabs are scoped by instance

Changes:
1. Add imports for `TabsContent` from `@/components/ui/tabs` (already imports `Tabs`, `TabsList`, `TabsTrigger`)
2. Add imports for group hooks and components
3. Add `tGroups = useTranslations('adminBookingTypeGroups')`
4. Add `activeTab` state for page-level tabs
5. Add group state, data fetch, and mutations (same pattern as accounts)
6. Wrap content with page-level Tabs

The structure becomes:

```tsx
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'booking-types' | 'groups')}>
  <TabsList>
    <TabsTrigger value="booking-types">{t('tabBookingTypes')}</TabsTrigger>
    <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
  </TabsList>

  <TabsContent value="booking-types" className="space-y-6">
    {/* Existing: search + direction filter Tabs + clearFilters */}
    {/* Existing: count display */}
    {/* Existing: Card with BookingTypeDataTable */}
  </TabsContent>

  <TabsContent value="groups" className="space-y-6">
    {/* Same pattern as accounts groups tab */}
  </TabsContent>
</Tabs>
```

The "Create" button at the top should be context-aware (same pattern as accounts page -- show "New Group" or "New Booking Type" depending on active tab).

### 4C: Absence Types Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` (MODIFY)

Same approach as accounts page (no existing tab conflicts).

Changes:
1. Add imports for `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`
2. Add imports for group hooks and components
3. Add `tGroups = useTranslations('adminAbsenceTypeGroups')`
4. Add tab state, group state, data, mutations
5. Wrap content with Tabs

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && npx tsc --noEmit`
- [ ] Next.js build succeeds: `cd apps/web && npx next build` (or at minimum, no TypeScript errors)

#### Manual Verification:
- [ ] Accounts page shows "Accounts" and "Groups" tabs; switching works
- [ ] Booking Types page shows "Booking Types" and "Groups" tabs; direction filter still works within booking types tab
- [ ] Absence Types page shows "Absence Types" and "Groups" tabs; switching works
- [ ] Create button text changes based on active tab
- [ ] Groups tab shows empty state when no groups exist
- [ ] Create group form opens and submits successfully
- [ ] Edit group form pre-populates and updates successfully
- [ ] Delete group confirmation dialog works
- [ ] Search filter works on groups tab
- [ ] Booking type group form shows multi-select for booking type members
- [ ] Multi-select search, select all, and individual selection work
- [ ] Member count shows correctly in booking type groups table
- [ ] All text displays correctly in English
- [ ] Switch to German and verify all labels render correctly
- [ ] 409 conflict error (duplicate code) shows inline error message

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the full flow works before considering the ticket complete.

---

## File Summary

### New Files (12)

| File | Description |
|------|-------------|
| `apps/web/src/hooks/api/use-account-groups.ts` | Account group API hooks |
| `apps/web/src/hooks/api/use-booking-type-groups.ts` | Booking type group API hooks |
| `apps/web/src/hooks/api/use-absence-type-groups.ts` | Absence type group API hooks |
| `apps/web/src/components/account-groups/account-group-data-table.tsx` | Account group data table |
| `apps/web/src/components/account-groups/account-group-form-sheet.tsx` | Account group form sheet |
| `apps/web/src/components/account-groups/index.ts` | Barrel export |
| `apps/web/src/components/booking-type-groups/booking-type-group-data-table.tsx` | Booking type group data table |
| `apps/web/src/components/booking-type-groups/booking-type-group-form-sheet.tsx` | Booking type group form sheet + multi-select |
| `apps/web/src/components/booking-type-groups/index.ts` | Barrel export |
| `apps/web/src/components/absence-type-groups/absence-type-group-data-table.tsx` | Absence type group data table |
| `apps/web/src/components/absence-type-groups/absence-type-group-form-sheet.tsx` | Absence type group form sheet |
| `apps/web/src/components/absence-type-groups/index.ts` | Barrel export |

### Modified Files (5)

| File | Description |
|------|-------------|
| `apps/web/src/hooks/api/index.ts` | Add exports for three new hook files |
| `apps/web/messages/en.json` | Add 3 group namespaces + tab keys in parent namespaces |
| `apps/web/messages/de.json` | Add 3 group namespaces + tab keys in parent namespaces |
| `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx` | Add Tabs wrapper + Groups tab |
| `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx` | Add page-level Tabs + Groups tab |
| `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` | Add Tabs wrapper + Groups tab |

## Testing Strategy

### Manual Testing Steps:
1. Navigate to Admin > Accounts, verify two tabs appear
2. Click "Groups" tab, verify empty state with "Add Group" button
3. Create an account group (Code: OVERTIME, Name: Overtime Accounts, Sort Order: 1)
4. Verify it appears in the table with correct data
5. Edit the group (change name), verify update
6. Delete the group, verify removal
7. Navigate to Admin > Booking Types, verify two tabs
8. Create a booking type group with 3 booking type members
9. Verify member count shows "3 members" in table
10. Edit the group, verify members are pre-selected
11. Navigate to Admin > Absence Types, verify two tabs
12. Create/edit/delete an absence type group
13. Test code uniqueness by creating duplicate codes (expect 409 inline error)
14. Switch to German and verify all labels

## Performance Considerations

- Groups data is fetched when the page loads (not lazily when the Groups tab is selected). This keeps the UX snappy when switching tabs.
- The booking type member multi-select loads all booking types. For most tenants this is a small list (<50 items), so no pagination is needed.
- `useMemo` filters are applied client-side for search, which is appropriate for the expected data volume.

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-057-grouping-entities-config-ui.md`
- Research: `thoughts/shared/research/2026-02-05-ZMI-TICKET-057-grouping-entities-config-ui.md`
- Account data table pattern: `apps/web/src/components/accounts/account-data-table.tsx`
- Form sheet pattern: `apps/web/src/components/booking-types/booking-type-form-sheet.tsx`
- Tab pattern: `apps/web/src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`
- Multi-select pattern: `apps/web/src/components/employee-day-plans/bulk-assign-dialog.tsx` (line 202+)
- Hook pattern: `apps/web/src/hooks/api/use-booking-types.ts`
- Translation pattern: `apps/web/messages/en.json` lines 2124-2222 (`adminAccounts`)
