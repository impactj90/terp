# Implementation Plan: ZMI-TICKET-063 - Access Control & Terminal UI

**Date**: 2026-02-09
**Ticket**: ZMI-TICKET-063
**Backend tickets**: ZMI-TICKET-028 (Access Control), ZMI-TICKET-027 (Terminal Integration)

---

## Overview

Two new admin pages:
1. **Access Control** (`/admin/access-control`) - Tabs: Zones, Profiles, Assignments
2. **Terminal Bookings** (`/admin/terminal-bookings`) - Tabs: Bookings, Import Batches

Both pages follow the **vacation-config extracted-tab pattern**: the page file is thin (auth guard, header, tab triggers) and each tab is a self-contained component in its own file with its own data fetching, CRUD state, table, form, and confirm dialog.

---

## Phase 1: API Hooks

### 1A. Create `use-access-control.ts`

**File**: `apps/web/src/hooks/api/use-access-control.ts`
**Pattern**: Follow `apps/web/src/hooks/api/use-orders.ts` for simple CRUD hooks.

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

// --- Access Zones ---

interface UseAccessZonesOptions {
  enabled?: boolean
}

export function useAccessZones(options: UseAccessZonesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/access-zones', { enabled })
}

export function useAccessZone(id: string, enabled = true) {
  return useApiQuery('/access-zones/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccessZone() {
  return useApiMutation('/access-zones', 'post', {
    invalidateKeys: [['/access-zones']],
  })
}

export function useUpdateAccessZone() {
  return useApiMutation('/access-zones/{id}', 'patch', {
    invalidateKeys: [['/access-zones']],
  })
}

export function useDeleteAccessZone() {
  return useApiMutation('/access-zones/{id}', 'delete', {
    invalidateKeys: [['/access-zones']],
  })
}

// --- Access Profiles ---

interface UseAccessProfilesOptions {
  enabled?: boolean
}

export function useAccessProfiles(options: UseAccessProfilesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/access-profiles', { enabled })
}

export function useAccessProfile(id: string, enabled = true) {
  return useApiQuery('/access-profiles/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccessProfile() {
  return useApiMutation('/access-profiles', 'post', {
    invalidateKeys: [['/access-profiles']],
  })
}

export function useUpdateAccessProfile() {
  return useApiMutation('/access-profiles/{id}', 'patch', {
    invalidateKeys: [['/access-profiles']],
  })
}

export function useDeleteAccessProfile() {
  return useApiMutation('/access-profiles/{id}', 'delete', {
    invalidateKeys: [['/access-profiles']],
  })
}

// --- Employee Access Assignments ---

interface UseEmployeeAccessAssignmentsOptions {
  employee_id?: string
  access_profile_id?: string
  enabled?: boolean
}

export function useEmployeeAccessAssignments(options: UseEmployeeAccessAssignmentsOptions = {}) {
  const { employee_id, access_profile_id, enabled = true } = options
  return useApiQuery('/employee-access-assignments', {
    params: { employee_id, access_profile_id },
    enabled,
  })
}

export function useCreateEmployeeAccessAssignment() {
  return useApiMutation('/employee-access-assignments', 'post', {
    invalidateKeys: [['/employee-access-assignments']],
  })
}

export function useUpdateEmployeeAccessAssignment() {
  return useApiMutation('/employee-access-assignments/{id}', 'patch', {
    invalidateKeys: [['/employee-access-assignments']],
  })
}

export function useDeleteEmployeeAccessAssignment() {
  return useApiMutation('/employee-access-assignments/{id}', 'delete', {
    invalidateKeys: [['/employee-access-assignments']],
  })
}
```

### 1B. Create `use-terminal-bookings.ts`

**File**: `apps/web/src/hooks/api/use-terminal-bookings.ts`
**Pattern**: Follow `apps/web/src/hooks/api/use-evaluations.ts` for hooks with required filter params and conditional enabling.

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

// --- Terminal Bookings ---

interface UseTerminalBookingsOptions {
  from?: string
  to?: string
  terminal_id?: string
  employee_id?: string
  status?: 'pending' | 'processed' | 'failed' | 'skipped'
  import_batch_id?: string
  limit?: number
  page?: number
  enabled?: boolean
}

export function useTerminalBookings(options: UseTerminalBookingsOptions = {}) {
  const { from, to, terminal_id, employee_id, status, import_batch_id, limit, page, enabled = true } = options
  return useApiQuery('/terminal-bookings', {
    params: { from: from!, to: to!, terminal_id, employee_id, status, import_batch_id, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

// --- Import Trigger ---

export function useTriggerTerminalImport() {
  return useApiMutation('/terminal-bookings/import', 'post', {
    invalidateKeys: [['/terminal-bookings'], ['/import-batches']],
  })
}

// --- Import Batches ---

interface UseImportBatchesOptions {
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  terminal_id?: string
  limit?: number
  page?: number
  enabled?: boolean
}

export function useImportBatches(options: UseImportBatchesOptions = {}) {
  const { status, terminal_id, limit, page, enabled = true } = options
  return useApiQuery('/import-batches', {
    params: { status, terminal_id, limit, page },
    enabled,
  })
}

export function useImportBatch(id: string, enabled = true) {
  return useApiQuery('/import-batches/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}
```

### 1C. Register hooks in barrel export

**File**: `apps/web/src/hooks/api/index.ts`
**Action**: Append two new export blocks at the end of the file.

```ts
// Access Control
export {
  useAccessZones,
  useAccessZone,
  useCreateAccessZone,
  useUpdateAccessZone,
  useDeleteAccessZone,
  useAccessProfiles,
  useAccessProfile,
  useCreateAccessProfile,
  useUpdateAccessProfile,
  useDeleteAccessProfile,
  useEmployeeAccessAssignments,
  useCreateEmployeeAccessAssignment,
  useUpdateEmployeeAccessAssignment,
  useDeleteEmployeeAccessAssignment,
} from './use-access-control'

// Terminal Bookings
export {
  useTerminalBookings,
  useTriggerTerminalImport,
  useImportBatches,
  useImportBatch,
} from './use-terminal-bookings'
```

### Verification
- Run `cd apps/web && npx tsc --noEmit` to check that all hook types resolve against the OpenAPI-generated types
- Verify hook paths match the endpoint paths in `apps/web/src/lib/api/types.ts`

---

## Phase 2: Access Control Components

All files go in `apps/web/src/components/access-control/`.
**Pattern to follow**: `apps/web/src/components/vacation-config/special-calculations-tab.tsx` (self-contained tab component with inline table, form sheet, and confirm dialog).

### 2A. `zones-tab.tsx` - Access Zones Tab

**File**: `apps/web/src/components/access-control/zones-tab.tsx`

This is a self-contained tab component. Internal structure:

1. **Type aliases**: `type AccessZone = components['schemas']['AccessZone']`
2. **FormState interface**: `{ code: string, name: string, description: string, sortOrder: string, isActive: boolean }`
3. **INITIAL_FORM constant**
4. **`ZonesTab` component** (exported):
   - `useTranslations('adminAccessControl')`
   - State: `search`, `createOpen`, `editItem`, `deleteItem`, `deleteError`
   - Data: `useAccessZones({ enabled: !authLoading && isAdmin })`
   - Delete mutation: `useDeleteAccessZone()`
   - Filtering: `useMemo` on `code`, `name` fields
   - Toolbar: New button + SearchInput + clear filters
   - Count text: `t('zones.count')` / `t('zones.countPlural')`
   - Empty state with `Shield` icon
   - Inline table:
     - Columns: Code, Name, Sort Order, Active (Badge), Actions (DropdownMenu)
     - Active column: `<Badge variant={is_active ? 'default' : 'secondary'}>`
   - `ZoneFormSheet` rendered below table
   - `ConfirmDialog` for delete
5. **`ZoneFormSheet` function** (internal, not exported):
   - Props: `open`, `onOpenChange`, `item?`, `onSuccess?`
   - Mutations: `useCreateAccessZone()`, `useUpdateAccessZone()`
   - Fields:
     - Code (Input, disabled on edit)
     - Name (Input, required)
     - Description (Textarea, optional)
     - Sort Order (Input type="number", optional)
     - Active (Switch, edit only)
   - Validation: code required, name required
   - Sheet with ScrollArea pattern from special-calculations-tab.tsx

### 2B. `profiles-tab.tsx` - Access Profiles Tab

**File**: `apps/web/src/components/access-control/profiles-tab.tsx`

Same self-contained pattern as zones-tab.tsx:

1. **Type**: `type AccessProfile = components['schemas']['AccessProfile']`
2. **FormState**: `{ code: string, name: string, description: string, isActive: boolean }`
3. **`ProfilesTab` component** (exported):
   - Toolbar: New button + SearchInput
   - Count text
   - Inline table:
     - Columns: Code, Name, Active (Badge), Actions
   - `ProfileFormSheet` rendered below
   - `ConfirmDialog` for delete (handle 409 when profile is referenced by assignments)
4. **`ProfileFormSheet` function** (internal):
   - Fields: Code (disabled on edit), Name, Description, Active (Switch, edit only)
   - Validation: code required, name required

### 2C. `assignments-tab.tsx` - Employee Access Assignments Tab

**File**: `apps/web/src/components/access-control/assignments-tab.tsx`

1. **Types**: `type EmployeeAccessAssignment = components['schemas']['EmployeeAccessAssignment']`
2. **`AssignmentsTab` component** (exported):
   - State: `search`, `createOpen`, `editItem`, `deleteItem`
   - Additional filter state: `profileFilter` (string, access_profile_id)
   - Data:
     - `useEmployeeAccessAssignments({ enabled: !authLoading && isAdmin })`
     - `useAccessProfiles({ enabled: !authLoading && isAdmin })` for profile name display
     - `useEmployees({ active: true, enabled: !authLoading && isAdmin })` for employee name display
   - Toolbar: New button + SearchInput + profile filter (Select) + clear filters
   - Count text
   - Inline table:
     - Columns: Employee (resolved from employee_id), Access Profile (resolved from access_profile_id), Valid From, Valid To, Active (Badge), Actions
     - Format dates with `format(new Date(date), 'dd.MM.yyyy')` from `date-fns`
   - `AssignmentFormDialog` rendered below
   - `ConfirmDialog` for delete
3. **`AssignmentFormDialog` function** (internal):
   - Uses `Dialog` pattern (not Sheet) -- follow `apps/web/src/components/orders/order-assignment-form-dialog.tsx`
   - Props: `open`, `onOpenChange`, `assignment?`, `onSuccess?`
   - Data: `useEmployees({ active: true, enabled: open })`, `useAccessProfiles({ enabled: open })`
   - Fields:
     - Employee (Select with `__none__` sentinel, disabled on edit)
     - Access Profile (Select with `__none__` sentinel, disabled on edit)
     - Valid From (Input type="date")
     - Valid To (Input type="date")
     - Active (Switch, edit only)
   - Mutations: `useCreateEmployeeAccessAssignment()`, `useUpdateEmployeeAccessAssignment()`
   - Validation: employee_id required, access_profile_id required

### 2D. `index.ts` - Barrel Export

**File**: `apps/web/src/components/access-control/index.ts`

```ts
export { ZonesTab } from './zones-tab'
export { ProfilesTab } from './profiles-tab'
export { AssignmentsTab } from './assignments-tab'
```

### Verification
- Run `cd apps/web && npx tsc --noEmit`
- Manually verify that each tab component follows the same structure as `special-calculations-tab.tsx`

---

## Phase 3: Terminal Bookings Components

All files go in `apps/web/src/components/terminal-bookings/`.

### 3A. `bookings-tab.tsx` - Terminal Bookings Tab

**File**: `apps/web/src/components/terminal-bookings/bookings-tab.tsx`

Self-contained tab component:

1. **Types**: `type RawTerminalBooking = components['schemas']['RawTerminalBooking']`
2. **Status badge config**:
   ```ts
   const STATUS_BADGE_CONFIG: Record<string, { className: string; labelKey: string }> = {
     pending: { className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', labelKey: 'bookings.statusPending' },
     processed: { className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', labelKey: 'bookings.statusProcessed' },
     failed: { className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', labelKey: 'bookings.statusFailed' },
     skipped: { className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', labelKey: 'bookings.statusSkipped' },
   }
   ```
3. **`BookingsTab` component** (exported):
   - State:
     - Filter state: `dateFrom`, `dateTo` (default to current month), `terminalId`, `employeeId`, `status`, `importBatchId`
     - No CRUD state (read-only view)
   - Data: `useTerminalBookings({ from: dateFrom, to: dateTo, terminal_id: terminalId, employee_id: employeeId, status, import_batch_id: importBatchId, enabled: ... })`
   - Also fetch: `useEmployees({ active: true, enabled: ... })` for employee filter select
   - Toolbar section with inline filters:
     - Date range: two `Input type="date"` fields (from/to) -- use simple date inputs, not DateRangePicker
     - Terminal ID (Input, optional text filter)
     - Employee (Select, optional)
     - Status (Select: all/pending/processed/failed/skipped)
     - Import Batch ID (Input, optional text filter)
     - Clear filters button
   - Count text with pagination info
   - Inline table (read-only, no edit/delete actions):
     - Columns: Timestamp (formatted), Employee PIN, Terminal ID, Raw Booking Code (with Tooltip for explanation), Status (Badge), Matched Employee, Error Message
     - Format `raw_timestamp` with `format(new Date(ts), 'dd.MM.yyyy HH:mm:ss')` from date-fns
     - `employee` field: display `employee.first_name employee.last_name` if resolved, else "-"
     - `error_message`: only show if `status === 'failed'`, truncated with tooltip
   - No form sheet or confirm dialog (read-only)
   - Empty state with `Terminal` icon

### 3B. `import-batches-tab.tsx` - Import Batches Tab

**File**: `apps/web/src/components/terminal-bookings/import-batches-tab.tsx`

Self-contained tab component:

1. **Types**: `type ImportBatch = components['schemas']['ImportBatch']`
2. **Batch status badge config**:
   ```ts
   const BATCH_STATUS_CONFIG: Record<string, { className: string; labelKey: string }> = {
     pending: { ... yellow ... },
     processing: { ... blue ... },
     completed: { ... green ... },
     failed: { ... red ... },
   }
   ```
3. **`ImportBatchesTab` component** (exported):
   - State: `statusFilter`, `triggerImportOpen`
   - Data: `useImportBatches({ status: statusFilter === 'all' ? undefined : statusFilter, enabled: ... })`
   - Toolbar:
     - "Trigger Import" button (primary action)
     - Status filter tabs (all/pending/processing/completed/failed) -- use `Tabs`/`TabsList`/`TabsTrigger` as inline filter pattern
     - Clear filters button
   - Count text
   - Inline table:
     - Columns: Batch Reference, Source, Terminal ID, Status (Badge), Total, Imported, Failed, Started At, Completed At
     - Format dates with `format(new Date(date), 'dd.MM.yyyy HH:mm')` from date-fns
     - Show "-" for null counts
   - `TriggerImportDialog` rendered below table
   - Empty state with `Upload` icon
4. **`TriggerImportDialog` function** (internal):
   - Uses `Dialog` pattern (not Sheet)
   - Props: `open`, `onOpenChange`, `onSuccess?`
   - State: `batchReference`, `terminalId`, `bookingsText` (textarea for pasting booking lines), `result` (import response)
   - Mutation: `useTriggerTerminalImport()`
   - Fields:
     - Batch Reference (Input, required)
     - Terminal ID (Input, required)
     - Bookings textarea: user pastes lines in format `employee_pin,raw_timestamp,raw_booking_code` (one per line)
   - Parse bookings text into array before submitting
   - On success: display result summary (`batch.records_total`, `batch.records_imported`, `batch.records_failed`, `was_duplicate`)
   - Two-state dialog: input form -> result summary (with "Close" button)
   - Validation: batch_reference required, terminal_id required, at least one booking line

### 3C. `index.ts` - Barrel Export

**File**: `apps/web/src/components/terminal-bookings/index.ts`

```ts
export { BookingsTab } from './bookings-tab'
export { ImportBatchesTab } from './import-batches-tab'
```

### Verification
- Run `cd apps/web && npx tsc --noEmit`
- Verify status badge color classes match project convention from `order-status-badge.tsx`

---

## Phase 4: Page Layouts

### 4A. Access Control Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/access-control/page.tsx`
**Pattern**: Follow exactly `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx`

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ZonesTab, ProfilesTab, AssignmentsTab } from '@/components/access-control'

type AccessControlTab = 'zones' | 'profiles' | 'assignments'

export default function AccessControlPage() {
  const router = useRouter()
  const t = useTranslations('adminAccessControl')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [activeTab, setActiveTab] = React.useState<AccessControlTab>('zones')

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  if (authLoading) return <AccessControlPageSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccessControlTab)}>
        <TabsList>
          <TabsTrigger value="zones">{t('tabZones')}</TabsTrigger>
          <TabsTrigger value="profiles">{t('tabProfiles')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
        </TabsList>
        <TabsContent value="zones" className="space-y-6"><ZonesTab /></TabsContent>
        <TabsContent value="profiles" className="space-y-6"><ProfilesTab /></TabsContent>
        <TabsContent value="assignments" className="space-y-6"><AssignmentsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function AccessControlPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
```

### 4B. Terminal Bookings Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx`
**Pattern**: Same as access-control page above.

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookingsTab, ImportBatchesTab } from '@/components/terminal-bookings'

type TerminalBookingsTab = 'bookings' | 'import-batches'

export default function TerminalBookingsPage() {
  const router = useRouter()
  const t = useTranslations('adminTerminalBookings')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [activeTab, setActiveTab] = React.useState<TerminalBookingsTab>('bookings')

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  if (authLoading) return <TerminalBookingsPageSkeleton />
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TerminalBookingsTab)}>
        <TabsList>
          <TabsTrigger value="bookings">{t('tabBookings')}</TabsTrigger>
          <TabsTrigger value="import-batches">{t('tabImportBatches')}</TabsTrigger>
        </TabsList>
        <TabsContent value="bookings" className="space-y-6"><BookingsTab /></TabsContent>
        <TabsContent value="import-batches" className="space-y-6"><ImportBatchesTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function TerminalBookingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
```

### Verification
- Both pages follow the exact structure of `vacation-config/page.tsx`
- Auth guard pattern matches
- Skeleton pattern matches

---

## Phase 5: Navigation and Translations

### 5A. Sidebar Navigation

**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

**Actions**:
1. Add `DoorOpen` and `Terminal` icons to the import from `lucide-react` (check if `Terminal` is available; if not, use `MonitorSmartphone` or `Scan`; `DoorOpen` for access control)
2. Add two new items in the `administration` section, after the `macros` entry:

```ts
{
  titleKey: 'accessControl',
  href: '/admin/access-control',
  icon: DoorOpen,
  roles: ['admin'],
},
{
  titleKey: 'terminalBookings',
  href: '/admin/terminal-bookings',
  icon: Terminal,
  roles: ['admin'],
},
```

### 5B. English Translations

**File**: `apps/web/messages/en.json`

Add to the `nav` section:
```json
"accessControl": "Access Control",
"terminalBookings": "Terminal Bookings"
```

Add new top-level namespace `adminAccessControl`:
```json
"adminAccessControl": {
  "title": "Access Control",
  "subtitle": "Manage access zones, profiles, and employee assignments",
  "tabZones": "Zones",
  "tabProfiles": "Profiles",
  "tabAssignments": "Assignments",

  "zones.new": "New Zone",
  "zones.edit": "Edit Zone",
  "zones.delete": "Delete",
  "zones.deleteTitle": "Delete Zone",
  "zones.deleteDescription": "Are you sure you want to delete zone \"{name}\"? This action cannot be undone.",
  "zones.searchPlaceholder": "Search zones...",
  "zones.clearFilters": "Clear Filters",
  "zones.count": "{count} zone",
  "zones.countPlural": "{count} zones",
  "zones.emptyTitle": "No zones",
  "zones.emptyGetStarted": "Create your first access zone to get started.",
  "zones.emptyFilterHint": "No zones match your current filters.",
  "zones.columnCode": "Code",
  "zones.columnName": "Name",
  "zones.columnSortOrder": "Sort Order",
  "zones.columnActive": "Active",
  "zones.statusActive": "Active",
  "zones.statusInactive": "Inactive",
  "zones.fieldCode": "Code",
  "zones.fieldName": "Name",
  "zones.fieldDescription": "Description",
  "zones.fieldSortOrder": "Sort Order",
  "zones.fieldActive": "Active",
  "zones.fieldActiveDescription": "Inactive zones are hidden from selection lists.",
  "zones.sectionBasicInfo": "Basic Information",
  "zones.sectionStatus": "Status",
  "zones.editDescription": "Update the zone details below.",
  "zones.createDescription": "Fill in the details for the new access zone.",
  "zones.validationCodeRequired": "Code is required",
  "zones.validationNameRequired": "Name is required",
  "zones.failedCreate": "Failed to create zone",
  "zones.failedUpdate": "Failed to update zone",
  "zones.failedDelete": "Cannot delete zone. It may be referenced by other entities.",
  "zones.saving": "Saving...",
  "zones.saveChanges": "Save Changes",
  "zones.create": "Create",
  "zones.cancel": "Cancel",

  "profiles.new": "New Profile",
  "profiles.edit": "Edit Profile",
  "profiles.delete": "Delete",
  "profiles.deleteTitle": "Delete Profile",
  "profiles.deleteDescription": "Are you sure you want to delete profile \"{name}\"? This action cannot be undone.",
  "profiles.searchPlaceholder": "Search profiles...",
  "profiles.clearFilters": "Clear Filters",
  "profiles.count": "{count} profile",
  "profiles.countPlural": "{count} profiles",
  "profiles.emptyTitle": "No profiles",
  "profiles.emptyGetStarted": "Create your first access profile to get started.",
  "profiles.emptyFilterHint": "No profiles match your current filters.",
  "profiles.columnCode": "Code",
  "profiles.columnName": "Name",
  "profiles.columnActive": "Active",
  "profiles.statusActive": "Active",
  "profiles.statusInactive": "Inactive",
  "profiles.fieldCode": "Code",
  "profiles.fieldName": "Name",
  "profiles.fieldDescription": "Description",
  "profiles.fieldActive": "Active",
  "profiles.fieldActiveDescription": "Inactive profiles are hidden from selection lists.",
  "profiles.sectionBasicInfo": "Basic Information",
  "profiles.sectionStatus": "Status",
  "profiles.editDescription": "Update the profile details below.",
  "profiles.createDescription": "Fill in the details for the new access profile.",
  "profiles.validationCodeRequired": "Code is required",
  "profiles.validationNameRequired": "Name is required",
  "profiles.failedCreate": "Failed to create profile",
  "profiles.failedUpdate": "Failed to update profile",
  "profiles.failedDelete": "Cannot delete profile. It may be assigned to employees.",
  "profiles.saving": "Saving...",
  "profiles.saveChanges": "Save Changes",
  "profiles.create": "Create",
  "profiles.cancel": "Cancel",

  "assignments.new": "New Assignment",
  "assignments.edit": "Edit Assignment",
  "assignments.delete": "Delete",
  "assignments.deleteTitle": "Delete Assignment",
  "assignments.deleteDescription": "Are you sure you want to delete this access assignment?",
  "assignments.searchPlaceholder": "Search assignments...",
  "assignments.clearFilters": "Clear Filters",
  "assignments.count": "{count} assignment",
  "assignments.countPlural": "{count} assignments",
  "assignments.emptyTitle": "No assignments",
  "assignments.emptyGetStarted": "Create your first employee access assignment.",
  "assignments.emptyFilterHint": "No assignments match your current filters.",
  "assignments.allProfiles": "All Profiles",
  "assignments.columnEmployee": "Employee",
  "assignments.columnProfile": "Access Profile",
  "assignments.columnValidFrom": "Valid From",
  "assignments.columnValidTo": "Valid To",
  "assignments.columnActive": "Active",
  "assignments.statusActive": "Active",
  "assignments.statusInactive": "Inactive",
  "assignments.fieldEmployee": "Employee",
  "assignments.fieldProfile": "Access Profile",
  "assignments.fieldValidFrom": "Valid From",
  "assignments.fieldValidTo": "Valid To",
  "assignments.fieldActive": "Active",
  "assignments.selectEmployee": "Select employee...",
  "assignments.selectProfile": "Select profile...",
  "assignments.validationEmployeeRequired": "Employee is required",
  "assignments.validationProfileRequired": "Access profile is required",
  "assignments.failedCreate": "Failed to create assignment",
  "assignments.failedUpdate": "Failed to update assignment",
  "assignments.saving": "Saving...",
  "assignments.save": "Save",
  "assignments.cancel": "Cancel"
}
```

Add new top-level namespace `adminTerminalBookings`:
```json
"adminTerminalBookings": {
  "title": "Terminal Bookings",
  "subtitle": "View terminal booking data and manage imports",
  "tabBookings": "Bookings",
  "tabImportBatches": "Import Batches",

  "bookings.searchPlaceholder": "Search bookings...",
  "bookings.clearFilters": "Clear Filters",
  "bookings.count": "{count} booking",
  "bookings.countPlural": "{count} bookings",
  "bookings.emptyTitle": "No bookings",
  "bookings.emptyHint": "No terminal bookings found for the selected date range.",
  "bookings.emptyFilterHint": "No bookings match your current filters.",
  "bookings.filterFrom": "From",
  "bookings.filterTo": "To",
  "bookings.filterTerminalId": "Terminal ID",
  "bookings.filterEmployee": "Employee",
  "bookings.filterStatus": "Status",
  "bookings.filterBatchId": "Import Batch ID",
  "bookings.filterAllStatuses": "All Statuses",
  "bookings.filterAllEmployees": "All Employees",
  "bookings.columnTimestamp": "Timestamp",
  "bookings.columnEmployeePin": "Employee PIN",
  "bookings.columnTerminalId": "Terminal ID",
  "bookings.columnBookingCode": "Booking Code",
  "bookings.columnStatus": "Status",
  "bookings.columnEmployee": "Matched Employee",
  "bookings.columnError": "Error",
  "bookings.statusPending": "Pending",
  "bookings.statusProcessed": "Processed",
  "bookings.statusFailed": "Failed",
  "bookings.statusSkipped": "Skipped",

  "batches.triggerImport": "Trigger Import",
  "batches.clearFilters": "Clear Filters",
  "batches.filterAll": "All",
  "batches.filterPending": "Pending",
  "batches.filterProcessing": "Processing",
  "batches.filterCompleted": "Completed",
  "batches.filterFailed": "Failed",
  "batches.count": "{count} batch",
  "batches.countPlural": "{count} batches",
  "batches.emptyTitle": "No import batches",
  "batches.emptyHint": "No import batches found.",
  "batches.emptyFilterHint": "No batches match your current filters.",
  "batches.columnBatchReference": "Batch Reference",
  "batches.columnSource": "Source",
  "batches.columnTerminalId": "Terminal ID",
  "batches.columnStatus": "Status",
  "batches.columnTotal": "Total",
  "batches.columnImported": "Imported",
  "batches.columnFailed": "Failed",
  "batches.columnStartedAt": "Started At",
  "batches.columnCompletedAt": "Completed At",
  "batches.statusPending": "Pending",
  "batches.statusProcessing": "Processing",
  "batches.statusCompleted": "Completed",
  "batches.statusFailed": "Failed",

  "import.title": "Trigger Terminal Import",
  "import.description": "Manually import terminal booking data.",
  "import.fieldBatchReference": "Batch Reference",
  "import.fieldTerminalId": "Terminal ID",
  "import.fieldBookings": "Booking Data",
  "import.bookingsHint": "One booking per line: employee_pin,timestamp,booking_code",
  "import.bookingsPlaceholder": "12345,2026-02-09T08:00:00Z,A1\n12345,2026-02-09T17:00:00Z,A2",
  "import.validationBatchRefRequired": "Batch reference is required",
  "import.validationTerminalIdRequired": "Terminal ID is required",
  "import.validationBookingsRequired": "At least one booking line is required",
  "import.validationInvalidLine": "Invalid format on line {line}. Expected: pin,timestamp,code",
  "import.submit": "Import",
  "import.importing": "Importing...",
  "import.cancel": "Cancel",
  "import.close": "Close",
  "import.failedImport": "Failed to trigger import",
  "import.resultTitle": "Import Result",
  "import.resultTotal": "Total Records",
  "import.resultImported": "Imported",
  "import.resultFailed": "Failed",
  "import.resultDuplicate": "This batch was a duplicate.",
  "import.resultSuccess": "Import completed successfully."
}
```

### 5C. German Translations

**File**: `apps/web/messages/de.json`

Add to the `nav` section:
```json
"accessControl": "Zutrittskontrolle",
"terminalBookings": "Terminal-Buchungen"
```

Add corresponding German translations for `adminAccessControl` and `adminTerminalBookings` namespaces (mirror the English structure with German values). Key translations:
- Access Control -> Zutrittskontrolle
- Zones -> Zonen
- Profiles -> Profile
- Assignments -> Zuweisungen
- Terminal Bookings -> Terminal-Buchungen
- Import Batches -> Import-Chargen
- Trigger Import -> Import ausloesen

### Verification
- Verify English and German JSON files are valid JSON (no trailing commas, proper escaping)
- Verify all `t()` calls in components have corresponding translation keys
- Verify nav translation keys exist in both language files

---

## Phase 6: Hook Registration and Final Wiring

### 6A. Verify all exports

**File**: `apps/web/src/hooks/api/index.ts`
- Confirm both new hook files are exported (done in Phase 1C)

### 6B. Verify barrel exports

**Files**:
- `apps/web/src/components/access-control/index.ts` - exports `ZonesTab`, `ProfilesTab`, `AssignmentsTab`
- `apps/web/src/components/terminal-bookings/index.ts` - exports `BookingsTab`, `ImportBatchesTab`

### 6C. Full type check

```bash
cd apps/web && npx tsc --noEmit
```

### 6D. Dev server smoke test

```bash
cd apps/web && npm run dev
```

Then visit:
- `/admin/access-control` - verify all three tabs render without errors
- `/admin/terminal-bookings` - verify both tabs render without errors
- Check sidebar shows both new navigation items under "Administration"

---

## File Summary

### New files (13 total)

| # | File | Phase |
|---|------|-------|
| 1 | `apps/web/src/hooks/api/use-access-control.ts` | 1A |
| 2 | `apps/web/src/hooks/api/use-terminal-bookings.ts` | 1B |
| 3 | `apps/web/src/components/access-control/zones-tab.tsx` | 2A |
| 4 | `apps/web/src/components/access-control/profiles-tab.tsx` | 2B |
| 5 | `apps/web/src/components/access-control/assignments-tab.tsx` | 2C |
| 6 | `apps/web/src/components/access-control/index.ts` | 2D |
| 7 | `apps/web/src/components/terminal-bookings/bookings-tab.tsx` | 3A |
| 8 | `apps/web/src/components/terminal-bookings/import-batches-tab.tsx` | 3B |
| 9 | `apps/web/src/components/terminal-bookings/index.ts` | 3C |
| 10 | `apps/web/src/app/[locale]/(dashboard)/admin/access-control/page.tsx` | 4A |
| 11 | `apps/web/src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx` | 4B |

### Modified files (4 total)

| # | File | Phase |
|---|------|-------|
| 1 | `apps/web/src/hooks/api/index.ts` | 1C |
| 2 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | 5A |
| 3 | `apps/web/messages/en.json` | 5B |
| 4 | `apps/web/messages/de.json` | 5C |

### Reference files (patterns to follow)

| Pattern | Reference File |
|---------|---------------|
| Self-contained tab component | `apps/web/src/components/vacation-config/special-calculations-tab.tsx` |
| Thin page with tabs | `apps/web/src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx` |
| CRUD API hooks | `apps/web/src/hooks/api/use-orders.ts` |
| Filter-based API hooks | `apps/web/src/hooks/api/use-evaluations.ts` |
| Form dialog (assignments) | `apps/web/src/components/orders/order-assignment-form-dialog.tsx` |
| Status badge config | `apps/web/src/components/orders/order-status-badge.tsx` |
| Sidebar nav config | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |
| Barrel export (tabs) | `apps/web/src/components/vacation-config/index.ts` |
| Hook barrel export | `apps/web/src/hooks/api/index.ts` |

---

## Implementation Order

Execute phases sequentially: 1 -> 2 -> 3 -> 4 -> 5 -> 6

Within each phase, files can be created in any order. The dependency chain is:
- Phase 2 and 3 depend on Phase 1 (hooks must exist before components use them)
- Phase 4 depends on Phase 2 and 3 (pages import tab components)
- Phase 5 is independent of 2/3/4 but needed for runtime (translations, nav)
- Phase 6 is verification only

---

## Notes

- The `ImportBatch` schema does NOT have a `records_skipped` field. The ticket mentions "Skipped" in columns but the actual schema only has `records_total`, `records_imported`, `records_failed`. Omit the skipped column from the import batch table.
- Terminal bookings list requires `from` and `to` date params. Default these to the current month (first day to last day) so the query is always enabled on initial load.
- The `employee_access_assignments` endpoint query params may or may not support `employee_id` and `access_profile_id` filtering on the server. If they do, wire them through; if not, filter client-side in the tab's `useMemo`.
- For the `DoorOpen` icon, verify availability in the project's lucide-react version. Fallback: `KeyRound` or `Lock`. For `Terminal`, fallback: `MonitorSmartphone` or `Scan`.
