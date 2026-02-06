# Implementation Plan: ZMI-TICKET-056 - Contact Type & Kind Configuration UI

## Overview

Implement a two-panel master-detail configuration page for managing contact types (left panel) and their associated contact kinds (right panel). The backend API is fully implemented with all CRUD endpoints. This is the **first** two-panel page in the codebase; the layout will be built from existing primitives (Card, ScrollArea, Badge) arranged in a CSS grid.

**Ticket**: ZMI-TICKET-056
**Backend dependency**: ZMI-TICKET-025 (complete)
**Primary pattern reference**: Cost Centers page (`apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx`)
**Badge pattern reference**: Member Role Badge (`apps/web/src/components/teams/member-role-badge.tsx`)
**Hook pattern reference**: Booking Types hooks (`apps/web/src/hooks/api/use-booking-types.ts`)

---

## Phase 1: API Hooks

Create CRUD hooks for both contact types and contact kinds. These follow the established hook pattern exactly.

### Step 1.1: Create `use-contact-types.ts`

**File to create**: `apps/web/src/hooks/api/use-contact-types.ts`
**Pattern reference**: `apps/web/src/hooks/api/use-booking-types.ts` (for query param filtering), `apps/web/src/hooks/api/use-locations.ts` (for standard CRUD)

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseContactTypesOptions {
  active?: boolean
  enabled?: boolean
}

export function useContactTypes(options: UseContactTypesOptions = {}) {
  const { active, enabled = true } = options
  return useApiQuery('/contact-types', {
    params: { active },
    enabled,
  })
}

export function useContactType(id: string, enabled = true) {
  return useApiQuery('/contact-types/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateContactType() {
  return useApiMutation('/contact-types', 'post', {
    invalidateKeys: [['/contact-types']],
  })
}

export function useUpdateContactType() {
  return useApiMutation('/contact-types/{id}', 'patch', {
    invalidateKeys: [['/contact-types']],
  })
}

export function useDeleteContactType() {
  return useApiMutation('/contact-types/{id}', 'delete', {
    invalidateKeys: [['/contact-types']],
  })
}
```

**Key details**:
- `useContactTypes` supports optional `active` boolean query param (matching the API: `GET /contact-types?active=true`)
- Invalidation key is `['/contact-types']` for all mutations
- TypeScript types auto-inferred from OpenAPI-generated `types.ts` via the generic `useApiQuery`/`useApiMutation` wrappers

### Step 1.2: Create `use-contact-kinds.ts`

**File to create**: `apps/web/src/hooks/api/use-contact-kinds.ts`
**Pattern reference**: `apps/web/src/hooks/api/use-booking-types.ts`

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseContactKindsOptions {
  contactTypeId?: string
  active?: boolean
  enabled?: boolean
}

export function useContactKinds(options: UseContactKindsOptions = {}) {
  const { contactTypeId, active, enabled = true } = options
  return useApiQuery('/contact-kinds', {
    params: { contact_type_id: contactTypeId, active },
    enabled,
  })
}

export function useCreateContactKind() {
  return useApiMutation('/contact-kinds', 'post', {
    invalidateKeys: [['/contact-kinds']],
  })
}

export function useUpdateContactKind() {
  return useApiMutation('/contact-kinds/{id}', 'patch', {
    invalidateKeys: [['/contact-kinds']],
  })
}

export function useDeleteContactKind() {
  return useApiMutation('/contact-kinds/{id}', 'delete', {
    invalidateKeys: [['/contact-kinds']],
  })
}
```

**Key details**:
- `useContactKinds` supports `contactTypeId` to filter kinds by parent type (maps to API query param `contact_type_id`)
- Also supports `active` boolean filter
- No `useContactKind(id)` single-item hook needed (edit uses inline list data, not a separate fetch)

### Step 1.3: Register hooks in barrel export

**File to modify**: `apps/web/src/hooks/api/index.ts`
**Pattern reference**: Lines 136-152 (Cost Centers block) in the same file

Add after the Tenants export block (end of file, ~line 346):

```ts
// Contact Types
export {
  useContactTypes,
  useContactType,
  useCreateContactType,
  useUpdateContactType,
  useDeleteContactType,
} from './use-contact-types'

// Contact Kinds
export {
  useContactKinds,
  useCreateContactKind,
  useUpdateContactKind,
  useDeleteContactKind,
} from './use-contact-kinds'
```

### Phase 1 Verification
- Run `cd apps/web && npx tsc --noEmit` -- should have no type errors in the new hook files
- Verify the generated `types.ts` has the correct paths: search for `listContactTypes`, `listContactKinds`, `createContactType`, `createContactKind` in `apps/web/src/lib/api/types.ts`

---

## Phase 2: Components

Create all UI components under `apps/web/src/components/contact-types/`.

### Step 2.1: Create barrel index

**File to create**: `apps/web/src/components/contact-types/index.ts`
**Pattern reference**: `apps/web/src/components/cost-centers/index.ts`

```ts
export { ContactTypeListPanel } from './contact-type-list-panel'
export { ContactKindListPanel } from './contact-kind-list-panel'
export { ContactTypeFormSheet } from './contact-type-form-sheet'
export { ContactKindFormSheet } from './contact-kind-form-sheet'
export { ContactTypePageSkeleton } from './contact-type-skeleton'
```

### Step 2.2: Create data type badge config

**File to create**: `apps/web/src/components/contact-types/data-type-badge.tsx`
**Pattern reference**: `apps/web/src/components/teams/member-role-badge.tsx` (config map pattern)

This is a small utility component for rendering data_type badges with color coding per the ticket spec:
- `text` = default/gray
- `email` = blue
- `phone` = green
- `url` = purple

```tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type DataType = 'text' | 'email' | 'phone' | 'url'

const dataTypeConfig: Record<DataType, { labelKey: string; className: string }> = {
  text: {
    labelKey: 'dataTypeText',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  email: {
    labelKey: 'dataTypeEmail',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  phone: {
    labelKey: 'dataTypePhone',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  url: {
    labelKey: 'dataTypeUrl',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
}

interface DataTypeBadgeProps {
  dataType: DataType
}

export function DataTypeBadge({ dataType }: DataTypeBadgeProps) {
  const t = useTranslations('adminContactTypes')
  const config = dataTypeConfig[dataType]
  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}
```

Also add to the barrel export in `index.ts`:
```ts
export { DataTypeBadge } from './data-type-badge'
```

### Step 2.3: Create Contact Type List Panel (left panel)

**File to create**: `apps/web/src/components/contact-types/contact-type-list-panel.tsx`
**Pattern reference**: No direct analog -- this is new. Use Card/CardHeader/CardContent from `apps/web/src/components/ui/card.tsx` and Badge from the data-type-badge component.

**Props**:
```tsx
interface ContactTypeListPanelProps {
  contactTypes: ContactType[]
  isLoading: boolean
  selectedTypeId: string | null
  onSelect: (type: ContactType) => void
  onCreateClick: () => void
  onEdit: (type: ContactType) => void
  onDelete: (type: ContactType) => void
}
```

**Implementation details**:
- Renders a `Card` with a `CardHeader` containing the title "Contact Types" and an "Add Type" `Button`
- `CardContent` contains a list of clickable items
- Each item is a `div` (or button) with `onClick={() => onSelect(type)}`
- Selected item gets a highlighted style: `bg-accent` or `ring-2 ring-primary`
- Each item displays:
  - `type.code` (small monospaced text)
  - `type.name` (primary label)
  - `DataTypeBadge` for `type.data_type`
  - Active/Inactive badge (follow team-status-badge pattern: green for active, gray for inactive)
- Three-dot dropdown menu (`DropdownMenu` from `apps/web/src/components/ui/dropdown-menu.tsx`) or inline icon buttons for Edit/Delete actions on each item
- When `isLoading`, show skeleton placeholders inside the card content (3-4 `Skeleton` rectangles)
- When list is empty, show an empty state with icon and message

**Key Tailwind classes**:
```tsx
// Item container (clickable)
<div
  className={cn(
    'flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent',
    selectedTypeId === type.id && 'border-primary bg-accent'
  )}
  onClick={() => onSelect(type)}
>
```

### Step 2.4: Create Contact Kind List Panel (right panel)

**File to create**: `apps/web/src/components/contact-types/contact-kind-list-panel.tsx`
**Pattern reference**: Same structure as the type list panel, but for kinds.

**Props**:
```tsx
interface ContactKindListPanelProps {
  contactKinds: ContactKind[]
  isLoading: boolean
  selectedType: ContactType | null
  onCreateClick: () => void
  onEdit: (kind: ContactKind) => void
  onDelete: (kind: ContactKind) => void
}
```

**Implementation details**:
- Renders a `Card` with a `CardHeader` containing the title "Contact Kinds" and an "Add Kind" `Button`
- The "Add Kind" button should be **disabled** when `selectedType` is null
- `CardContent` contains a list of kind items
- Each item displays:
  - `kind.code` (small monospaced text)
  - `kind.label` (primary label)
  - `kind.sort_order` if set
  - Active/Inactive badge
- Edit/Delete actions on each item (same dropdown or icon pattern)
- When `selectedType` is null: show empty state "Select a contact type to view its kinds" with an icon (e.g. `ArrowLeft` or `MousePointerClick`)
- When loading: skeleton placeholders
- When kinds list is empty but type is selected: "No contact kinds found. Add your first kind."

### Step 2.5: Create Contact Type Form Sheet

**File to create**: `apps/web/src/components/contact-types/contact-type-form-sheet.tsx`
**Pattern reference**: `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx` (exact pattern)

**Props**:
```tsx
interface ContactTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactType?: ContactType | null  // null = create mode
  onSuccess?: () => void
}
```

**FormState**:
```tsx
interface FormState {
  code: string
  name: string
  dataType: 'text' | 'email' | 'phone' | 'url'
  description: string
  sortOrder: string   // stored as string for input, parsed to number on submit
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  dataType: 'text',
  description: '',
  sortOrder: '',
  isActive: true,
}
```

**Form fields**:
1. **Code** (Input) -- required, max 50 chars, auto-uppercase, **disabled on edit** (immutable)
2. **Name** (Input) -- required, max 255 chars
3. **Data Type** (Select component from `apps/web/src/components/ui/select.tsx`) -- required, options: text/email/phone/url, **disabled on edit** (immutable per API)
4. **Description** (Textarea) -- optional
5. **Sort Order** (Input type="number") -- optional
6. **Active** (Switch) -- default true, show only on edit (same pattern as cost-center-form-sheet)

**Validation** (`validateForm`):
- Code required, max 50 chars
- Name required
- Data type required (always has default, so mainly a safety check)

**Submit logic**:
- Create: `useCreateContactType()` with body `{ code, name, data_type, description?, sort_order? }`
- Edit: `useUpdateContactType()` with `path: { id }` and body `{ name?, description?, is_active?, sort_order? }`
- Error handling: catch API errors, display `apiError.detail ?? apiError.message ?? t('failedCreate'/'failedUpdate')`
- 409 conflict on create means code already exists -- display the error message from the API

**Component structure** (follows cost-center-form-sheet exactly):
```
Sheet > SheetContent(side="right") >
  SheetHeader (title + description)
  ScrollArea (form fields grouped by sections)
  SheetFooter (Cancel + Submit buttons)
```

### Step 2.6: Create Contact Kind Form Sheet

**File to create**: `apps/web/src/components/contact-types/contact-kind-form-sheet.tsx`
**Pattern reference**: `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`

**Props**:
```tsx
interface ContactKindFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactKind?: ContactKind | null  // null = create mode
  contactType: ContactType          // the parent type (always required)
  onSuccess?: () => void
}
```

**FormState**:
```tsx
interface FormState {
  code: string
  label: string
  sortOrder: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  label: '',
  sortOrder: '',
  isActive: true,
}
```

**Form fields**:
1. **Contact Type** -- displayed as read-only text showing `contactType.name` (pre-filled and locked, not editable)
2. **Code** (Input) -- required, max 50 chars, auto-uppercase, **disabled on edit**
3. **Label** (Input) -- required, max 255 chars
4. **Sort Order** (Input type="number") -- optional
5. **Active** (Switch) -- default true, show only on edit

**Submit logic**:
- Create: `useCreateContactKind()` with body `{ contact_type_id: contactType.id, code, label, sort_order? }`
- Edit: `useUpdateContactKind()` with `path: { id }` and body `{ label?, is_active?, sort_order? }`
- 409 on create = code already exists

### Step 2.7: Create Page Skeleton

**File to create**: `apps/web/src/components/contact-types/contact-type-skeleton.tsx`
**Pattern reference**: `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` (lines 233-254, CostCentersPageSkeleton)

The skeleton should match the two-panel layout:

```tsx
export function ContactTypePageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      {/* Two-panel skeleton */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left panel skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
        {/* Right panel skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

### Phase 2 Verification
- All files created under `apps/web/src/components/contact-types/`
- Barrel `index.ts` exports all components
- Run `cd apps/web && npx tsc --noEmit` -- no type errors
- Each component uses `useTranslations('adminContactTypes')` (translation keys added in Phase 3)

---

## Phase 3: Page, Navigation & Translations

### Step 3.1: Add translation keys to `en.json`

**File to modify**: `apps/web/messages/en.json`

**Change 1**: Add to `nav` object (around line 94, after `"auditLogs": "Audit Logs"`):
```json
"contactTypes": "Contact Types"
```

**Change 2**: Add to `breadcrumbs` object (around line 195, after `"auditLogs": "Audit Logs"`):
```json
"contactTypes": "Contact Types"
```

**Change 3**: Add new `adminContactTypes` namespace. Insert after the last admin namespace block (find the right position alphabetically or at end of admin blocks):

```json
"adminContactTypes": {
  "title": "Contact Types",
  "subtitle": "Manage contact types and their associated kinds",

  "typesTitle": "Contact Types",
  "kindsTitle": "Contact Kinds",

  "newType": "Add Type",
  "newKind": "Add Kind",

  "searchPlaceholder": "Search...",

  "dataTypeText": "Text",
  "dataTypeEmail": "Email",
  "dataTypePhone": "Phone",
  "dataTypeUrl": "URL",

  "statusActive": "Active",
  "statusInactive": "Inactive",

  "edit": "Edit",
  "delete": "Delete",

  "editType": "Edit Contact Type",
  "createTypeDescription": "Add a new contact type with data format configuration.",
  "editTypeDescription": "Modify contact type details.",

  "editKind": "Edit Contact Kind",
  "createKindDescription": "Add a new contact kind for the selected type.",
  "editKindDescription": "Modify contact kind details.",

  "sectionBasicInfo": "Basic Information",
  "sectionStatus": "Status",

  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldLabel": "Label",
  "fieldDataType": "Data Type",
  "fieldDescription": "Description",
  "fieldSortOrder": "Sort Order",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive items are hidden from dropdowns",
  "fieldContactType": "Contact Type",

  "codePlaceholder": "e.g. EMAIL",
  "codeHint": "Unique code (uppercase, max 50 chars). Cannot be changed after creation.",
  "namePlaceholder": "e.g. Email Address",
  "labelPlaceholder": "e.g. Work Email",
  "descriptionPlaceholder": "Optional description...",
  "sortOrderPlaceholder": "e.g. 10",
  "dataTypePlaceholder": "Select data type...",
  "dataTypeHint": "Determines input validation format. Cannot be changed after creation.",

  "validationCodeRequired": "Code is required",
  "validationNameRequired": "Name is required",
  "validationLabelRequired": "Label is required",
  "validationDataTypeRequired": "Data type is required",
  "validationCodeMaxLength": "Code must be at most 50 characters",

  "cancel": "Cancel",
  "saveChanges": "Save Changes",
  "create": "Create",
  "saving": "Saving...",

  "failedCreateType": "Failed to create contact type",
  "failedUpdateType": "Failed to update contact type",
  "failedCreateKind": "Failed to create contact kind",
  "failedUpdateKind": "Failed to update contact kind",
  "failedDelete": "Failed to delete",

  "deleteType": "Delete Contact Type",
  "deleteTypeDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone.",
  "deleteTypeInUse": "This contact type cannot be deleted because it has associated contact kinds. Remove or reassign the kinds first.",

  "deleteKind": "Delete Contact Kind",
  "deleteKindDescription": "Are you sure you want to delete \"{label}\"? This action cannot be undone.",

  "emptyTypesTitle": "No contact types found",
  "emptyTypesHint": "Get started by creating your first contact type",

  "emptyKindsTitle": "No contact kinds found",
  "emptyKindsHint": "Add your first contact kind for this type",

  "selectTypePrompt": "Select a Contact Type",
  "selectTypeDescription": "Choose a contact type from the left panel to view and manage its kinds"
}
```

### Step 3.2: Add translation keys to `de.json`

**File to modify**: `apps/web/messages/de.json`

**Change 1**: Add to `nav` object:
```json
"contactTypes": "Kontaktarten"
```

**Change 2**: Add to `breadcrumbs` object:
```json
"contactTypes": "Kontaktarten"
```

**Change 3**: Add `adminContactTypes` namespace with German translations:

```json
"adminContactTypes": {
  "title": "Kontaktarten",
  "subtitle": "Kontaktarten und deren zugeordnete Ausprägungen verwalten",

  "typesTitle": "Kontaktarten",
  "kindsTitle": "Kontaktausprägungen",

  "newType": "Typ hinzufügen",
  "newKind": "Ausprägung hinzufügen",

  "searchPlaceholder": "Suchen...",

  "dataTypeText": "Text",
  "dataTypeEmail": "E-Mail",
  "dataTypePhone": "Telefon",
  "dataTypeUrl": "URL",

  "statusActive": "Aktiv",
  "statusInactive": "Inaktiv",

  "edit": "Bearbeiten",
  "delete": "Löschen",

  "editType": "Kontaktart bearbeiten",
  "createTypeDescription": "Eine neue Kontaktart mit Datenformat-Konfiguration hinzufügen.",
  "editTypeDescription": "Kontaktart-Details bearbeiten.",

  "editKind": "Kontaktausprägung bearbeiten",
  "createKindDescription": "Eine neue Kontaktausprägung für den ausgewählten Typ hinzufügen.",
  "editKindDescription": "Kontaktausprägung-Details bearbeiten.",

  "sectionBasicInfo": "Grundinformationen",
  "sectionStatus": "Status",

  "fieldCode": "Code",
  "fieldName": "Name",
  "fieldLabel": "Bezeichnung",
  "fieldDataType": "Datentyp",
  "fieldDescription": "Beschreibung",
  "fieldSortOrder": "Sortierung",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Einträge werden in Auswahlfeldern ausgeblendet",
  "fieldContactType": "Kontaktart",

  "codePlaceholder": "z.B. EMAIL",
  "codeHint": "Eindeutiger Code (Großbuchstaben, max. 50 Zeichen). Kann nach Erstellung nicht geändert werden.",
  "namePlaceholder": "z.B. E-Mail-Adresse",
  "labelPlaceholder": "z.B. Geschäftliche E-Mail",
  "descriptionPlaceholder": "Optionale Beschreibung...",
  "sortOrderPlaceholder": "z.B. 10",
  "dataTypePlaceholder": "Datentyp auswählen...",
  "dataTypeHint": "Bestimmt das Eingabevalidierungsformat. Kann nach Erstellung nicht geändert werden.",

  "validationCodeRequired": "Code ist erforderlich",
  "validationNameRequired": "Name ist erforderlich",
  "validationLabelRequired": "Bezeichnung ist erforderlich",
  "validationDataTypeRequired": "Datentyp ist erforderlich",
  "validationCodeMaxLength": "Code darf maximal 50 Zeichen lang sein",

  "cancel": "Abbrechen",
  "saveChanges": "Änderungen speichern",
  "create": "Erstellen",
  "saving": "Speichern...",

  "failedCreateType": "Kontaktart konnte nicht erstellt werden",
  "failedUpdateType": "Kontaktart konnte nicht aktualisiert werden",
  "failedCreateKind": "Kontaktausprägung konnte nicht erstellt werden",
  "failedUpdateKind": "Kontaktausprägung konnte nicht aktualisiert werden",
  "failedDelete": "Löschen fehlgeschlagen",

  "deleteType": "Kontaktart löschen",
  "deleteTypeDescription": "Möchten Sie \"{name}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteTypeInUse": "Diese Kontaktart kann nicht gelöscht werden, da ihr Kontaktausprägungen zugeordnet sind. Entfernen oder verschieben Sie die Ausprägungen zuerst.",

  "deleteKind": "Kontaktausprägung löschen",
  "deleteKindDescription": "Möchten Sie \"{label}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",

  "emptyTypesTitle": "Keine Kontaktarten gefunden",
  "emptyTypesHint": "Erstellen Sie Ihre erste Kontaktart",

  "emptyKindsTitle": "Keine Kontaktausprägungen gefunden",
  "emptyKindsHint": "Fügen Sie die erste Kontaktausprägung für diesen Typ hinzu",

  "selectTypePrompt": "Kontaktart auswählen",
  "selectTypeDescription": "Wählen Sie eine Kontaktart aus dem linken Panel, um deren Ausprägungen anzuzeigen und zu verwalten"
}
```

### Step 3.3: Add sidebar navigation entry

**File to modify**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

**Change 1**: Add `Contact` icon import (line ~2, in the lucide-react import block):
```ts
Contact,
```

**Change 2**: Add nav item in the `management` section (after `bookingTypes` entry, around line 201):
```ts
{
  titleKey: 'contactTypes',
  href: '/admin/contact-types',
  icon: Contact,
  roles: ['admin'],
},
```

### Step 3.4: Add breadcrumb segment mapping

**File to modify**: `apps/web/src/components/layout/breadcrumbs.tsx`

Add to the `segmentToKey` record (after `'audit-logs': 'auditLogs'` at line 59):
```ts
'contact-types': 'contactTypes',
```

### Step 3.5: Create the page

**File to create**: `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`
**Pattern reference**: `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx`

This is the main page file. It follows the standard page structure but with a **two-panel grid layout** instead of a single DataTable.

**Page state**:
```tsx
// Auth
const { isLoading: authLoading } = useAuth()
const isAdmin = useHasRole(['admin'])

// Contact Types state
const [selectedType, setSelectedType] = React.useState<ContactType | null>(null)
const [createTypeOpen, setCreateTypeOpen] = React.useState(false)
const [editType, setEditType] = React.useState<ContactType | null>(null)
const [deleteType, setDeleteType] = React.useState<ContactType | null>(null)
const [deleteTypeError, setDeleteTypeError] = React.useState<string | null>(null)

// Contact Kinds state
const [createKindOpen, setCreateKindOpen] = React.useState(false)
const [editKind, setEditKind] = React.useState<ContactKind | null>(null)
const [deleteKind, setDeleteKind] = React.useState<ContactKind | null>(null)

// Data fetching
const { data: typesData, isLoading: typesLoading } = useContactTypes({ enabled: !authLoading && isAdmin })
const contactTypes = typesData?.data ?? []

const { data: kindsData, isLoading: kindsLoading } = useContactKinds({
  contactTypeId: selectedType?.id,
  enabled: !authLoading && isAdmin && !!selectedType,
})
const contactKinds = kindsData?.data ?? []

// Delete mutations
const deleteTypeMutation = useDeleteContactType()
const deleteKindMutation = useDeleteContactKind()
```

**Layout structure**:
```tsx
<div className="space-y-6">
  {/* Page header - just title and subtitle, no create button (create is within panels) */}
  <div>
    <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
    <p className="text-muted-foreground">{t('subtitle')}</p>
  </div>

  {/* Two-panel grid layout */}
  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    {/* Left panel: Contact Types */}
    <ContactTypeListPanel
      contactTypes={contactTypes}
      isLoading={typesLoading}
      selectedTypeId={selectedType?.id ?? null}
      onSelect={handleSelectType}
      onCreateClick={() => setCreateTypeOpen(true)}
      onEdit={(type) => setEditType(type)}
      onDelete={(type) => { setDeleteType(type); setDeleteTypeError(null) }}
    />

    {/* Right panel: Contact Kinds */}
    <ContactKindListPanel
      contactKinds={contactKinds}
      isLoading={kindsLoading}
      selectedType={selectedType}
      onCreateClick={() => setCreateKindOpen(true)}
      onEdit={(kind) => setEditKind(kind)}
      onDelete={(kind) => setDeleteKind(kind)}
    />
  </div>

  {/* Form Sheets */}
  <ContactTypeFormSheet ... />
  <ContactKindFormSheet ... />

  {/* Delete Confirmations */}
  <ConfirmDialog ... />  {/* for types, with 409 handling */}
  <ConfirmDialog ... />  {/* for kinds */}
</div>
```

**Key event handlers**:

```tsx
const handleSelectType = (type: ContactType) => {
  setSelectedType(type)
}

// When a type is successfully created/edited, close the form
const handleTypeFormSuccess = () => {
  setCreateTypeOpen(false)
  setEditType(null)
}

// When a kind is successfully created/edited, close the form
const handleKindFormSuccess = () => {
  setCreateKindOpen(false)
  setEditKind(null)
}

// Delete type with 409 handling (type in use by kinds)
const handleConfirmDeleteType = async () => {
  if (!deleteType) return
  setDeleteTypeError(null)
  try {
    await deleteTypeMutation.mutateAsync({ path: { id: deleteType.id } })
    // If deleted type was selected, clear selection
    if (selectedType?.id === deleteType.id) {
      setSelectedType(null)
    }
    setDeleteType(null)
  } catch (err) {
    const apiError = err as { status?: number; detail?: string; message?: string }
    if (apiError.status === 409) {
      setDeleteTypeError(t('deleteTypeInUse'))
    } else {
      setDeleteTypeError(apiError.detail ?? apiError.message ?? t('failedDelete'))
    }
  }
}

// Delete kind (no 409 expected, but handle errors generically)
const handleConfirmDeleteKind = async () => {
  if (!deleteKind) return
  try {
    await deleteKindMutation.mutateAsync({ path: { id: deleteKind.id } })
    setDeleteKind(null)
  } catch (err) {
    const apiError = err as { detail?: string; message?: string }
    // generic error handling
  }
}
```

**Delete type ConfirmDialog** -- must show `deleteTypeError` if 409:
```tsx
<ConfirmDialog
  open={!!deleteType}
  onOpenChange={(open) => {
    if (!open) { setDeleteType(null); setDeleteTypeError(null) }
  }}
  title={t('deleteType')}
  description={
    deleteTypeError
      ? deleteTypeError
      : deleteType
        ? t('deleteTypeDescription', { name: deleteType.name })
        : ''
  }
  confirmLabel={t('delete')}
  variant="destructive"
  isLoading={deleteTypeMutation.isPending}
  onConfirm={handleConfirmDeleteType}
/>
```

**Important behavior notes**:
- When a type is deleted that was currently selected, clear `selectedType` to null so the right panel reverts to "Select a type" empty state
- When types data refetches after a mutation, if the previously selected type still exists in the new data, maintain selection (the `selectedType` state holds the full object; this should remain stable unless deleted)
- The contact kinds query is disabled when no type is selected (`enabled: !!selectedType`)

### Phase 3 Verification
- Sidebar shows "Contact Types" in the Management section
- Navigating to `/admin/contact-types` renders the page
- Breadcrumb shows: Home > Administration > Contact Types
- Run `cd apps/web && npx tsc --noEmit` -- no type errors
- Run `cd apps/web && npm run build` -- successful build

---

## Phase 4: Final Verification

### Step 4.1: Build verification

```bash
cd apps/web && npm run build
```

Must complete without errors.

### Step 4.2: Type check

```bash
cd apps/web && npx tsc --noEmit
```

Must pass with zero errors.

### Step 4.3: Manual test scenarios

**Test 1: Page load and navigation**
- Navigate to `/admin/contact-types`
- Verify: page header shows "Contact Types" title and subtitle
- Verify: left panel shows "Contact Types" card with "Add Type" button
- Verify: right panel shows "Select a Contact Type" empty state
- Verify: breadcrumb shows correct path
- Verify: sidebar highlights "Contact Types" entry

**Test 2: Create contact type**
- Click "Add Type"
- Verify: form sheet opens with fields: Code, Name, Data Type (select), Description, Sort Order
- Fill: Code="EMAIL", Name="Email Address", Data Type="email"
- Click Create
- Verify: type appears in left panel list with blue "Email" badge and green "Active" badge
- Verify: form sheet closes

**Test 3: Select type and view kinds**
- Click the "Email Address" type in the left panel
- Verify: item becomes highlighted/selected
- Verify: right panel switches from empty state to "Contact Kinds" list (empty initially)
- Verify: "Add Kind" button is now enabled

**Test 4: Create contact kind**
- Click "Add Kind" in right panel
- Verify: form sheet opens with Contact Type field showing "Email Address" (read-only)
- Fill: Code="WORK_EMAIL", Label="Work Email"
- Click Create
- Verify: kind appears in right panel list with "Active" badge

**Test 5: Edit contact type**
- Click Edit on a contact type
- Verify: form sheet opens with Code and Data Type disabled (grayed out)
- Modify name, click Save
- Verify: updated name appears in list

**Test 6: Edit contact kind**
- Click Edit on a contact kind
- Verify: form sheet opens with Code disabled
- Modify label, click Save
- Verify: updated label appears in list

**Test 7: Delete contact kind**
- Click Delete on a contact kind
- Verify: confirmation dialog appears
- Confirm delete
- Verify: kind removed from list

**Test 8: Delete contact type (with kinds -- 409)**
- Create a type, add kinds to it, then try to delete the type
- Verify: 409 error message displayed: "This contact type cannot be deleted because it has associated contact kinds..."
- Dialog stays open showing the error

**Test 9: Delete contact type (without kinds)**
- Create a type with no kinds
- Delete it
- Verify: type removed from left panel
- If it was selected, right panel reverts to "Select a type" empty state

**Test 10: Duplicate code handling (409 on create)**
- Create a type with code "PHONE"
- Try to create another type with code "PHONE"
- Verify: error message appears in the form sheet (from API 409 response)

**Test 11: Data type badges**
- Create types with each data_type: text, email, phone, url
- Verify: text=gray badge, email=blue badge, phone=green badge, url=purple badge

---

## Files Summary

### New files (8):
1. `apps/web/src/hooks/api/use-contact-types.ts` -- Contact type CRUD hooks
2. `apps/web/src/hooks/api/use-contact-kinds.ts` -- Contact kind CRUD hooks
3. `apps/web/src/components/contact-types/index.ts` -- Barrel exports
4. `apps/web/src/components/contact-types/data-type-badge.tsx` -- Data type badge component
5. `apps/web/src/components/contact-types/contact-type-list-panel.tsx` -- Left panel component
6. `apps/web/src/components/contact-types/contact-kind-list-panel.tsx` -- Right panel component
7. `apps/web/src/components/contact-types/contact-type-form-sheet.tsx` -- Type create/edit form
8. `apps/web/src/components/contact-types/contact-kind-form-sheet.tsx` -- Kind create/edit form
9. `apps/web/src/components/contact-types/contact-type-skeleton.tsx` -- Page loading skeleton
10. `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx` -- Main page

### Modified files (5):
1. `apps/web/src/hooks/api/index.ts` -- Add contact type/kind hook exports
2. `apps/web/messages/en.json` -- Add nav, breadcrumb, and adminContactTypes translations
3. `apps/web/messages/de.json` -- Add German translations
4. `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` -- Add Contact icon import and nav entry
5. `apps/web/src/components/layout/breadcrumbs.tsx` -- Add contact-types segment mapping
