# Implementation Plan: ZMI-TICKET-055 System Settings & Tenant Admin UI

## Overview

This ticket implements two admin pages:
- **Part A**: System Settings page at `/admin/settings` -- a full-page form with grouped collapsible sections and a cleanup tools area
- **Part B**: Tenant Management page at `/admin/tenants` -- a standard CRUD page with data table, form sheet, detail sheet, and deactivation dialog

Both page directories need to be created (they do not exist yet). The sidebar navigation entries already exist in `sidebar-nav-config.ts`.

## Key Architecture Decisions

1. **Settings form is full-page, not a sheet** -- unlike CRUD entities. Uses `Card` components for each section.
2. **Cleanup dialog is two-step** -- preview (confirm=false) then typed confirmation (confirm=true). This is a new pattern.
3. **Tenant "delete" is actually deactivation** -- the DELETE endpoint calls Deactivate(), not hard delete.
4. **Password field is write-only** -- `proxy_password` is in update request but never returned in GET response.
5. **Settings should always send all fields** -- backend handler limitation means false boolean values won't be detected as "present" unless all fields are sent.
6. **GET /tenants returns array directly** -- response type is `Tenant[]`, but the spec also defines `TenantList` with `{ data: Tenant[] }`. Check generated types during implementation and handle accordingly (use `.data` if wrapped, direct array if not).

---

## Phase 1: API Hooks

Create the API hooks for both system settings and tenants. These are prerequisite for all UI work.

### File 1: `apps/web/src/hooks/api/use-system-settings.ts` (CREATE)

**Template**: `apps/web/src/hooks/api/use-locations.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

// GET /system-settings -- singleton, no list
export function useSystemSettings(enabled = true) {
  return useApiQuery('/system-settings', { enabled })
}

// PUT /system-settings -- full update (always send all fields)
export function useUpdateSystemSettings() {
  return useApiMutation('/system-settings', 'put', {
    invalidateKeys: [['/system-settings']],
  })
}

// POST /system-settings/cleanup/delete-bookings
export function useCleanupDeleteBookings() {
  return useApiMutation('/system-settings/cleanup/delete-bookings', 'post')
}

// POST /system-settings/cleanup/delete-booking-data
export function useCleanupDeleteBookingData() {
  return useApiMutation('/system-settings/cleanup/delete-booking-data', 'post')
}

// POST /system-settings/cleanup/re-read-bookings
export function useCleanupReReadBookings() {
  return useApiMutation('/system-settings/cleanup/re-read-bookings', 'post')
}

// POST /system-settings/cleanup/mark-delete-orders
export function useCleanupMarkDeleteOrders() {
  return useApiMutation('/system-settings/cleanup/mark-delete-orders', 'post')
}
```

Note: Cleanup mutations do NOT need invalidateKeys since they don't affect settings cache. They produce one-off results.

### File 2: `apps/web/src/hooks/api/use-tenants.ts` (CREATE)

**Template**: `apps/web/src/hooks/api/use-locations.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseTenantsOptions {
  enabled?: boolean
  params?: { active?: boolean; include_inactive?: boolean; name?: string }
}

export function useTenants(options: UseTenantsOptions = {}) {
  const { enabled = true, params } = options
  return useApiQuery('/tenants', { enabled, params })
}

export function useTenant(id: string, enabled = true) {
  return useApiQuery('/tenants/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateTenant() {
  return useApiMutation('/tenants', 'post', {
    invalidateKeys: [['/tenants']],
  })
}

export function useUpdateTenant() {
  return useApiMutation('/tenants/{id}', 'patch', {
    invalidateKeys: [['/tenants']],
  })
}

export function useDeactivateTenant() {
  return useApiMutation('/tenants/{id}', 'delete', {
    invalidateKeys: [['/tenants']],
  })
}
```

### File 3: `apps/web/src/hooks/api/index.ts` (MODIFY)

Add two new export blocks at the end of the file:

```typescript
// System Settings
export {
  useSystemSettings,
  useUpdateSystemSettings,
  useCleanupDeleteBookings,
  useCleanupDeleteBookingData,
  useCleanupReReadBookings,
  useCleanupMarkDeleteOrders,
} from './use-system-settings'

// Tenants
export {
  useTenants,
  useTenant,
  useCreateTenant,
  useUpdateTenant,
  useDeactivateTenant,
} from './use-tenants'
```

### Verification
- TypeScript compilation passes (`npx tsc --noEmit` from apps/web)
- Hook types align with generated OpenAPI types in `apps/web/src/lib/api/types.ts`

---

## Phase 2: TagInput UI Component

The `tracked_error_codes` field needs a tag input. No tag input exists in the codebase.

### File 4: `apps/web/src/components/ui/tag-input.tsx` (CREATE)

**No direct template** -- new component. Follow existing UI component patterns (same file structure as `time-input.tsx`).

Props interface:
```typescript
interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}
```

Behavior:
- Renders current tags as Badge components with an X button to remove
- Text input below/beside tags
- Press Enter or comma to add a tag (trimmed, deduplicated)
- Press Backspace on empty input to remove last tag
- Uses `Badge` from `@/components/ui/badge` (variant "secondary") with `X` icon from lucide
- Uses `Input` from `@/components/ui/input`
- Wraps everything in a `div` styled like an input field: `rounded-md border border-input bg-background p-2 flex flex-wrap gap-1`

Implementation:
```typescript
'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

export function TagInput({ value, onChange, placeholder, disabled, className, id }: TagInputProps) {
  const [input, setInput] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 rounded-md border border-input bg-background p-2 focus-within:ring-1 focus-within:ring-ring',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          {!disabled && (
            <button type="button" onClick={() => removeTag(i)} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={disabled}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
```

### Verification
- Component renders with empty array
- Can add tags via Enter key
- Can remove tags via X button
- Backspace on empty input removes last tag
- Duplicates are prevented

---

## Phase 3: Translation Files

Both `en.json` and `de.json` need two new namespaces: `adminSettings` and `adminTenants`.

### File 5: `apps/web/messages/en.json` (MODIFY)

Add the `adminSettings` namespace. Insert it after the last existing admin namespace (check position -- probably after `adminAuditLogs` or similar). The namespace should contain:

```json
"adminSettings": {
  "title": "System Settings",
  "subtitle": "Configure system-wide settings for this tenant",
  "saving": "Saving...",
  "saveSettings": "Save Settings",
  "saveSuccess": "Settings saved successfully",
  "saveFailed": "Failed to save settings",
  "loadFailed": "Failed to load settings",
  "unsavedChanges": "You have unsaved changes. Are you sure you want to leave?",

  "sectionCalculation": "Calculation Settings",
  "sectionCalculationDesc": "Configure rounding and error tracking behavior",
  "sectionOrder": "Order Settings",
  "sectionOrderDesc": "Configure order-related automation",
  "sectionBirthday": "Birthday Settings",
  "sectionBirthdayDesc": "Configure birthday notification window",
  "sectionProxy": "Proxy Settings",
  "sectionProxyDesc": "Configure HTTP proxy for external connections",
  "sectionServerAlive": "Server Monitoring",
  "sectionServerAliveDesc": "Configure server health monitoring and alerts",

  "fieldRoundingRelativeToPlan": "Rounding relative to plan",
  "fieldRoundingRelativeToPlanDesc": "When enabled, rounding grid anchors at planned start time instead of midnight",
  "fieldErrorListEnabled": "Error list enabled",
  "fieldErrorListEnabledDesc": "Enable error tracking and display in the system",
  "fieldTrackedErrorCodes": "Tracked error codes",
  "fieldTrackedErrorCodesDesc": "Error codes to track (press Enter to add)",
  "fieldTrackedErrorCodesPlaceholder": "Type error code and press Enter...",

  "fieldAutoFillOrderEnd": "Auto-fill order end bookings",
  "fieldAutoFillOrderEndDesc": "Automatically fill in end bookings for orders",
  "fieldFollowUpEntries": "Follow-up entries enabled",
  "fieldFollowUpEntriesDesc": "Enable creation of follow-up entries",

  "fieldBirthdayDaysBefore": "Days before birthday",
  "fieldBirthdayDaysBeforeDesc": "Number of days before a birthday to start showing notifications (0-90)",
  "fieldBirthdayDaysAfter": "Days after birthday",
  "fieldBirthdayDaysAfterDesc": "Number of days after a birthday to continue showing notifications (0-90)",

  "fieldProxyEnabled": "Proxy enabled",
  "fieldProxyEnabledDesc": "Enable HTTP proxy for external connections",
  "fieldProxyHost": "Proxy host",
  "fieldProxyHostPlaceholder": "e.g. proxy.example.com",
  "fieldProxyPort": "Proxy port",
  "fieldProxyPortPlaceholder": "e.g. 8080",
  "fieldProxyUsername": "Proxy username",
  "fieldProxyUsernamePlaceholder": "Username",
  "fieldProxyPassword": "Proxy password",
  "fieldProxyPasswordPlaceholder": "Enter new password (leave empty to keep current)",

  "fieldServerAliveEnabled": "Server monitoring enabled",
  "fieldServerAliveEnabledDesc": "Enable server health monitoring",
  "fieldServerAliveTime": "Expected completion time",
  "fieldServerAliveTimeDesc": "Time by which the server should complete daily processing",
  "fieldServerAliveThreshold": "Threshold (minutes)",
  "fieldServerAliveThresholdDesc": "Alert if completion is delayed by this many minutes",
  "fieldServerAliveThresholdPlaceholder": "e.g. 30",
  "fieldServerAliveNotify": "Notify admins",
  "fieldServerAliveNotifyDesc": "Send notifications to admin users when server is late",

  "cleanupTitle": "Cleanup Tools",
  "cleanupWarning": "These operations are destructive and cannot be undone. Use with extreme caution.",

  "cleanupDeleteBookings": "Delete Bookings",
  "cleanupDeleteBookingsDesc": "Permanently delete bookings within a date range. Optionally filter by specific employees.",
  "cleanupDeleteBookingData": "Delete Booking Data",
  "cleanupDeleteBookingDataDesc": "Delete bookings, daily values, and employee day plans within a date range.",
  "cleanupReReadBookings": "Re-Read Bookings",
  "cleanupReReadBookingsDesc": "Re-trigger calculation for all bookings in the specified date range.",
  "cleanupMarkDeleteOrders": "Mark & Delete Orders",
  "cleanupMarkDeleteOrdersDesc": "Mark specified orders for deletion and remove them.",

  "cleanupDateFrom": "Date from",
  "cleanupDateTo": "Date to",
  "cleanupEmployeeFilter": "Filter by employees (optional)",
  "cleanupEmployeePlaceholder": "Enter employee IDs...",
  "cleanupOrderIds": "Order IDs",
  "cleanupOrderIdsPlaceholder": "Enter order IDs...",
  "cleanupPreview": "Preview",
  "cleanupExecute": "Execute",

  "cleanupDialogPreviewTitle": "Preview: {operation}",
  "cleanupDialogPreviewMessage": "This will affect {count} records.",
  "cleanupDialogConfirmTitle": "Confirm: {operation}",
  "cleanupDialogConfirmMessage": "Type \"{phrase}\" to confirm this destructive operation.",
  "cleanupDialogConfirmPlaceholder": "Type {phrase} here...",
  "cleanupDialogConfirmPhrase": "DELETE",
  "cleanupDialogSuccess": "Operation completed. {count} records affected.",
  "cleanupDialogCancel": "Cancel",
  "cleanupDialogConfirm": "Confirm Execution",
  "cleanupDialogPreviewing": "Previewing...",
  "cleanupDialogExecuting": "Executing..."
}
```

Add the `adminTenants` namespace:

```json
"adminTenants": {
  "title": "Tenants",
  "subtitle": "Manage organizations and their settings",
  "newTenant": "New Tenant",
  "searchPlaceholder": "Search tenants...",
  "clearFilters": "Clear filters",
  "showInactive": "Show inactive",

  "columnName": "Name",
  "columnSlug": "Slug",
  "columnCity": "City",
  "columnCountry": "Country",
  "columnVacationBasis": "Vacation Basis",
  "columnStatus": "Status",
  "columnActions": "Actions",

  "statusActive": "Active",
  "statusInactive": "Inactive",
  "vacationBasisCalendarYear": "Calendar Year",
  "vacationBasisEntryDate": "Entry Date",

  "viewDetails": "View Details",
  "edit": "Edit",
  "deactivate": "Deactivate",

  "editTenant": "Edit Tenant",
  "createTenant": "Create Tenant",
  "createDescription": "Add a new tenant organization.",
  "editDescription": "Modify tenant details.",
  "tenantDetails": "Tenant Details",
  "viewTenantInfo": "View tenant information.",

  "sectionIdentity": "Identity",
  "sectionAddress": "Address",
  "sectionContact": "Contact",
  "sectionSettings": "Settings",
  "sectionStatus": "Status",

  "fieldName": "Name",
  "fieldNamePlaceholder": "e.g. Acme Corp",
  "fieldSlug": "Slug",
  "fieldSlugPlaceholder": "e.g. acme-corp",
  "fieldSlugHint": "URL-friendly identifier (lowercase letters, numbers, hyphens). Auto-generated from name.",
  "fieldSlugLocked": "Slug cannot be changed after creation.",
  "fieldStreet": "Street",
  "fieldStreetPlaceholder": "e.g. Main Street 1",
  "fieldZip": "ZIP Code",
  "fieldZipPlaceholder": "e.g. 10115",
  "fieldCity": "City",
  "fieldCityPlaceholder": "e.g. Berlin",
  "fieldCountry": "Country",
  "fieldCountryPlaceholder": "e.g. DE",
  "fieldPhone": "Phone",
  "fieldPhonePlaceholder": "e.g. +49 30 123456",
  "fieldEmail": "Email",
  "fieldEmailPlaceholder": "e.g. info@example.com",
  "fieldPayrollExportPath": "Payroll Export Base Path",
  "fieldPayrollExportPathPlaceholder": "e.g. /var/lib/payroll/exports",
  "fieldNotes": "Notes",
  "fieldNotesPlaceholder": "Additional notes...",
  "fieldVacationBasis": "Vacation Basis",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive tenants cannot be accessed by users",

  "validationNameRequired": "Name is required",
  "validationSlugRequired": "Slug is required",
  "validationSlugPattern": "Slug must contain only lowercase letters, numbers, and hyphens",
  "validationSlugMinLength": "Slug must be at least 3 characters",
  "validationStreetRequired": "Street is required",
  "validationZipRequired": "ZIP code is required",
  "validationCityRequired": "City is required",
  "validationCountryRequired": "Country is required",

  "cancel": "Cancel",
  "close": "Close",
  "saveChanges": "Save Changes",
  "create": "Create",
  "saving": "Saving...",
  "failedCreate": "Failed to create tenant",
  "failedUpdate": "Failed to update tenant",

  "deactivateTenant": "Deactivate Tenant",
  "deactivateDescription": "Deactivate tenant \"{name}\"? Users will no longer be able to access this tenant's data.",
  "deactivateConfirm": "Deactivate",

  "detailsSection": "Identity",
  "addressSection": "Address",
  "contactSection": "Contact",
  "settingsSection": "Settings",
  "timestampsSection": "Timestamps",
  "labelCreated": "Created",
  "labelLastUpdated": "Last Updated",

  "emptyTitle": "No tenants found",
  "emptyFilterHint": "Try adjusting your search",
  "emptyGetStarted": "No tenants configured. Create your first tenant.",
  "addTenant": "Add Tenant",

  "countSingular": "{count} tenant",
  "countPlural": "{count} tenants"
}
```

### File 6: `apps/web/messages/de.json` (MODIFY)

Add the same two namespaces with German translations. Follow the exact same key structure as English. Use appropriate German translations for all strings. Key examples:
- "System Settings" -> "Systemeinstellungen"
- "Tenants" -> "Mandanten"
- "Calculation Settings" -> "Berechnungseinstellungen"
- "Cleanup Tools" -> "Bereinigungswerkzeuge"
- "Deactivate" -> "Deaktivieren"
- etc.

### Verification
- JSON is valid (no trailing commas, correct nesting)
- All keys in en.json have corresponding keys in de.json
- No duplicate keys within each namespace

---

## Phase 4: System Settings Components

### File 7: `apps/web/src/components/settings/index.ts` (CREATE)

```typescript
export { SystemSettingsForm } from './system-settings-form'
export { CleanupToolsSection } from './cleanup-tools-section'
```

### File 8: `apps/web/src/components/settings/system-settings-form.tsx` (CREATE)

**Template**: Combines patterns from `location-form-sheet.tsx` (form state, section headers, switch toggles) with full-page Card layout.

This is the largest component. It should:

1. **Fetch settings** via `useSystemSettings()` hook on mount
2. **Initialize form state** when data loads (React.useEffect syncing API data to form state)
3. **Track dirty state** by comparing current form to initial values loaded from API
4. **Render 5 collapsible Card sections** (each with CardHeader containing title, description, and expand/collapse ChevronDown/ChevronUp toggle)
5. **Save all settings** via `useUpdateSystemSettings()` mutation (PUT, sends all fields)

**Form state interface:**
```typescript
interface SettingsFormState {
  // Calculation
  roundingRelativeToPlan: boolean
  errorListEnabled: boolean
  trackedErrorCodes: string[]
  // Order
  autoFillOrderEndBookings: boolean
  followUpEntriesEnabled: boolean
  // Birthday
  birthdayWindowDaysBefore: number
  birthdayWindowDaysAfter: number
  // Proxy
  proxyEnabled: boolean
  proxyHost: string
  proxyPort: number | null
  proxyUsername: string
  proxyPassword: string  // write-only, never pre-filled
  // Server Alive
  serverAliveEnabled: boolean
  serverAliveExpectedCompletionTime: number | null  // minutes from midnight
  serverAliveThresholdMinutes: number | null
  serverAliveNotifyAdmins: boolean
}
```

**Section rendering pattern** (repeat for each of the 5 sections):
```tsx
const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
  calculation: true,
  order: true,
  birthday: true,
  proxy: false,
  serverAlive: false,
})

const toggleSection = (key: string) => {
  setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
}

// Each section:
<Card>
  <CardHeader className="cursor-pointer" onClick={() => toggleSection('calculation')}>
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-base">{t('sectionCalculation')}</CardTitle>
        <CardDescription>{t('sectionCalculationDesc')}</CardDescription>
      </div>
      {expandedSections.calculation ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
    </div>
  </CardHeader>
  {expandedSections.calculation && (
    <CardContent className="space-y-4">
      {/* Switch fields */}
      {/* TagInput for tracked_error_codes */}
    </CardContent>
  )}
</Card>
```

**Switch field pattern** (reuse from location-form-sheet.tsx):
```tsx
<div className="flex items-center justify-between rounded-lg border p-4">
  <div className="space-y-0.5">
    <Label htmlFor="roundingRelativeToPlan" className="text-sm">{t('fieldRoundingRelativeToPlan')}</Label>
    <p className="text-xs text-muted-foreground">{t('fieldRoundingRelativeToPlanDesc')}</p>
  </div>
  <Switch
    id="roundingRelativeToPlan"
    checked={form.roundingRelativeToPlan}
    onCheckedChange={(checked) => setForm(prev => ({ ...prev, roundingRelativeToPlan: checked }))}
    disabled={isSubmitting}
  />
</div>
```

**Number input fields** (birthday days, proxy port, threshold minutes):
```tsx
<div className="space-y-2">
  <Label htmlFor="birthdayDaysBefore">{t('fieldBirthdayDaysBefore')}</Label>
  <p className="text-xs text-muted-foreground">{t('fieldBirthdayDaysBeforeDesc')}</p>
  <Input
    id="birthdayDaysBefore"
    type="number"
    min={0}
    max={90}
    value={form.birthdayWindowDaysBefore}
    onChange={(e) => setForm(prev => ({ ...prev, birthdayWindowDaysBefore: parseInt(e.target.value) || 0 }))}
    disabled={isSubmitting}
  />
</div>
```

**TagInput field** (for tracked_error_codes):
```tsx
<div className="space-y-2">
  <Label>{t('fieldTrackedErrorCodes')}</Label>
  <p className="text-xs text-muted-foreground">{t('fieldTrackedErrorCodesDesc')}</p>
  <TagInput
    value={form.trackedErrorCodes}
    onChange={(tags) => setForm(prev => ({ ...prev, trackedErrorCodes: tags }))}
    placeholder={t('fieldTrackedErrorCodesPlaceholder')}
    disabled={isSubmitting}
  />
</div>
```

**TimeInput field** (for server_alive_expected_completion_time):
```tsx
<div className="space-y-2">
  <Label>{t('fieldServerAliveTime')}</Label>
  <p className="text-xs text-muted-foreground">{t('fieldServerAliveTimeDesc')}</p>
  <TimeInput
    value={form.serverAliveExpectedCompletionTime}
    onChange={(minutes) => setForm(prev => ({ ...prev, serverAliveExpectedCompletionTime: minutes }))}
    disabled={isSubmitting}
  />
</div>
```

**Password field** (for proxy_password, reference `user-form-sheet.tsx` lines 296-321):
```tsx
const [showPassword, setShowPassword] = React.useState(false)

<div className="space-y-2">
  <Label htmlFor="proxyPassword">{t('fieldProxyPassword')}</Label>
  <div className="relative">
    <Input
      id="proxyPassword"
      type={showPassword ? 'text' : 'password'}
      value={form.proxyPassword}
      onChange={(e) => setForm(prev => ({ ...prev, proxyPassword: e.target.value }))}
      disabled={isSubmitting}
      placeholder={t('fieldProxyPasswordPlaceholder')}
      className="pr-10"
    />
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
      onClick={() => setShowPassword(!showPassword)}
      tabIndex={-1}
    >
      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
    </Button>
  </div>
</div>
```

**Dirty state tracking:**
```typescript
const initialValuesRef = React.useRef<SettingsFormState | null>(null)

// Set initial values when data loads
React.useEffect(() => {
  if (data) {
    const initial = mapApiToForm(data)
    setForm(initial)
    initialValuesRef.current = initial
  }
}, [data])

// Compare current form to initial to determine dirty
const isDirty = React.useMemo(() => {
  if (!initialValuesRef.current) return false
  return JSON.stringify(form) !== JSON.stringify(initialValuesRef.current)
}, [form])
```

**Submit handler:**
```typescript
const handleSubmit = async () => {
  try {
    await updateMutation.mutateAsync({
      body: {
        rounding_relative_to_plan: form.roundingRelativeToPlan,
        error_list_enabled: form.errorListEnabled,
        tracked_error_codes: form.trackedErrorCodes,
        auto_fill_order_end_bookings: form.autoFillOrderEndBookings,
        follow_up_entries_enabled: form.followUpEntriesEnabled,
        birthday_window_days_before: form.birthdayWindowDaysBefore,
        birthday_window_days_after: form.birthdayWindowDaysAfter,
        proxy_enabled: form.proxyEnabled,
        proxy_host: form.proxyHost || null,
        proxy_port: form.proxyPort,
        proxy_username: form.proxyUsername || null,
        proxy_password: form.proxyPassword || null,  // only send if changed
        server_alive_enabled: form.serverAliveEnabled,
        server_alive_expected_completion_time: form.serverAliveExpectedCompletionTime,
        server_alive_threshold_minutes: form.serverAliveThresholdMinutes,
        server_alive_notify_admins: form.serverAliveNotifyAdmins,
      },
    })
    // Update initial values ref after successful save
    initialValuesRef.current = { ...form }
    // Show success toast or message
  } catch (err) {
    // Show error alert
  }
}
```

**Save button** at the bottom of the form (outside cards):
```tsx
<div className="flex justify-end gap-2 pt-4">
  <Button
    onClick={handleSubmit}
    disabled={isSubmitting || !isDirty}
  >
    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    {isSubmitting ? t('saving') : t('saveSettings')}
  </Button>
</div>
```

**Props interface** for the component:
```typescript
// No props needed -- it fetches its own data.
// Exported as: export function SystemSettingsForm()
```

**Imports needed:**
- React, lucide icons (ChevronDown, ChevronUp, Eye, EyeOff, Loader2)
- useTranslations from next-intl
- Card, CardHeader, CardTitle, CardDescription, CardContent from ui/card
- Switch from ui/switch
- Input from ui/input
- Label from ui/label
- Button from ui/button
- Alert, AlertDescription from ui/alert
- TimeInput from ui/time-input
- TagInput from ui/tag-input
- useSystemSettings, useUpdateSystemSettings from hooks/api
- components from lib/api/types

### File 9: `apps/web/src/components/settings/cleanup-tools-section.tsx` (CREATE)

**No direct template** -- new pattern. Uses Card components for each cleanup tool.

This component renders 4 destructive action cards, each opening a cleanup dialog.

**State:**
```typescript
interface CleanupDialogState {
  type: 'delete-bookings' | 'delete-booking-data' | 're-read-bookings' | 'mark-delete-orders' | null
}

const [dialogState, setDialogState] = React.useState<CleanupDialogState>({ type: null })
```

**Layout:**
```tsx
<div className="space-y-4">
  <div>
    <h2 className="text-xl font-semibold">{t('cleanupTitle')}</h2>
    <Alert variant="destructive" className="mt-2">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>{t('cleanupWarning')}</AlertDescription>
    </Alert>
  </div>

  <div className="grid gap-4 md:grid-cols-2">
    {/* Card for each cleanup tool */}
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base">{t('cleanupDeleteBookings')}</CardTitle>
        <CardDescription>{t('cleanupDeleteBookingsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          onClick={() => setDialogState({ type: 'delete-bookings' })}
        >
          {t('cleanupDeleteBookings')}
        </Button>
      </CardContent>
    </Card>
    {/* ... repeat for other 3 types ... */}
  </div>

  <CleanupDialog
    type={dialogState.type}
    onClose={() => setDialogState({ type: null })}
  />
</div>
```

### File 10: `apps/web/src/components/settings/cleanup-dialog.tsx` (CREATE)

**No direct template** -- this is the new two-step confirmation pattern.

**Props:**
```typescript
interface CleanupDialogProps {
  type: 'delete-bookings' | 'delete-booking-data' | 're-read-bookings' | 'mark-delete-orders' | null
  onClose: () => void
}
```

**State machine:**
```typescript
type DialogStep = 'input' | 'preview' | 'confirm' | 'success'

const [step, setStep] = React.useState<DialogStep>('input')
const [dateFrom, setDateFrom] = React.useState('')
const [dateTo, setDateTo] = React.useState('')
const [employeeIds, setEmployeeIds] = React.useState<string[]>([])
const [orderIds, setOrderIds] = React.useState<string[]>([])
const [previewResult, setPreviewResult] = React.useState<CleanupResult | null>(null)
const [confirmText, setConfirmText] = React.useState('')
const [executeResult, setExecuteResult] = React.useState<CleanupResult | null>(null)
```

**Steps:**

1. **Input step**: Show input fields depending on type:
   - For `delete-bookings`, `delete-booking-data`, `re-read-bookings`: date_from (date input), date_to (date input), employee_ids (TagInput, optional)
   - For `mark-delete-orders`: order_ids (TagInput, required)
   - "Preview" button to proceed

2. **Preview step**: Call API with `confirm: false`, show result:
   - Display: "This will affect {affected_count} records."
   - "Continue" button to proceed to confirm
   - "Cancel" button to close

3. **Confirm step**: Show typed confirmation:
   - Display: "Type DELETE to confirm this destructive operation."
   - Text input where user must type the confirmation phrase
   - "Confirm Execution" button (disabled until phrase matches)
   - On confirm: call API with `confirm: true`

4. **Success step**: Show result:
   - Display: "Operation completed. {affected_count} records affected."
   - "Close" button

**API call routing** (based on type):
```typescript
const deleteBookingsMutation = useCleanupDeleteBookings()
const deleteBookingDataMutation = useCleanupDeleteBookingData()
const reReadBookingsMutation = useCleanupReReadBookings()
const markDeleteOrdersMutation = useCleanupMarkDeleteOrders()

const handlePreview = async () => {
  const body = buildRequestBody(false)  // confirm: false
  const mutation = getMutationForType(type)
  const result = await mutation.mutateAsync({ body })
  setPreviewResult(result)
  setStep('preview')
}

const handleExecute = async () => {
  const body = buildRequestBody(true)  // confirm: true
  const mutation = getMutationForType(type)
  const result = await mutation.mutateAsync({ body })
  setExecuteResult(result)
  setStep('success')
}
```

**Dialog component**: Use the standard Dialog component (`@/components/ui/dialog`) since this is a multi-step flow, not a simple confirmation.

**Reset state** when dialog closes or type changes:
```typescript
React.useEffect(() => {
  if (type) {
    setStep('input')
    setDateFrom('')
    setDateTo('')
    setEmployeeIds([])
    setOrderIds([])
    setPreviewResult(null)
    setConfirmText('')
    setExecuteResult(null)
  }
}, [type])
```

### Verification
- TypeScript compilation passes
- System settings form loads and displays all 5 sections
- Each section can collapse/expand
- Save button is disabled when form is not dirty
- Cleanup dialog goes through all 4 steps correctly

---

## Phase 5: System Settings Page

### File 11: `apps/web/src/app/[locale]/(dashboard)/admin/settings/page.tsx` (CREATE)

**Template**: `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx` (for page structure, auth guard, skeleton)

This page is simpler than CRUD pages since there's no table or sheets. It just renders the settings form and cleanup tools.

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { SystemSettingsForm, CleanupToolsSection } from '@/components/settings'

export default function SettingsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminSettings')

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  if (authLoading) {
    return <SettingsPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Settings form with collapsible sections */}
      <SystemSettingsForm />

      {/* Separator */}
      <hr className="my-8" />

      {/* Cleanup tools */}
      <CleanupToolsSection />
    </div>
  )
}

function SettingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  )
}
```

### Verification
- Navigate to `/admin/settings` -- page loads without error
- Settings form shows all sections with correct data from API
- Can toggle section expansion
- Can edit fields and see "Save" button become enabled
- Can save settings successfully
- Cleanup tools section shows 4 cards
- Cleanup dialog opens and goes through all steps

---

## Phase 6: Tenant Management Components

### File 12: `apps/web/src/components/tenants/index.ts` (CREATE)

```typescript
export { TenantDataTable } from './tenant-data-table'
export { TenantFormSheet } from './tenant-form-sheet'
export { TenantDetailSheet } from './tenant-detail-sheet'
export { TenantDeactivateDialog } from './tenant-deactivate-dialog'
```

### File 13: `apps/web/src/components/tenants/tenant-data-table.tsx` (CREATE)

**Template**: `apps/web/src/components/locations/location-data-table.tsx`

Follow the exact same pattern but with tenant columns.

**Props:**
```typescript
type Tenant = components['schemas']['Tenant']

interface TenantDataTableProps {
  items: Tenant[]
  isLoading: boolean
  onView: (item: Tenant) => void
  onEdit: (item: Tenant) => void
  onDeactivate: (item: Tenant) => void
}
```

**Columns**: Name, Slug (font-mono), City, Country, Vacation Basis (Badge), Status (Badge), Actions

**Row icon**: Use `Shield` icon from lucide (matching sidebar nav config).

**Badge for vacation_basis**:
```tsx
<Badge variant="outline">
  {item.vacation_basis === 'calendar_year' ? t('vacationBasisCalendarYear') : t('vacationBasisEntryDate')}
</Badge>
```

**Actions dropdown**: View, Edit, Deactivate (with destructive variant, only show if is_active is true).

**Skeleton loader**: Same pattern as LocationDataTableSkeleton but with 7 columns.

### File 14: `apps/web/src/components/tenants/tenant-form-sheet.tsx` (CREATE)

**Template**: `apps/web/src/components/locations/location-form-sheet.tsx`

Follow the exact same pattern but with tenant fields.

**Props:**
```typescript
interface TenantFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant?: Tenant | null
  onSuccess?: () => void
}
```

**Form state:**
```typescript
interface TenantFormState {
  name: string
  slug: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  phone: string
  email: string
  payrollExportBasePath: string
  notes: string
  vacationBasis: 'calendar_year' | 'entry_date'
  isActive: boolean
}

const INITIAL_STATE: TenantFormState = {
  name: '',
  slug: '',
  addressStreet: '',
  addressZip: '',
  addressCity: '',
  addressCountry: '',
  phone: '',
  email: '',
  payrollExportBasePath: '',
  notes: '',
  vacationBasis: 'calendar_year',
  isActive: true,
}
```

**Sections:**
1. Identity: name, slug
2. Address: street, zip, city, country (all required)
3. Contact: phone, email
4. Settings: payroll export path, notes, vacation basis (Select component)
5. Status (edit only): is_active switch

**Slug auto-generation** (only on create, when user hasn't manually edited slug):
```typescript
const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false)

// Auto-generate slug from name
const handleNameChange = (value: string) => {
  setForm(prev => ({
    ...prev,
    name: value,
    ...((!isEdit && !slugManuallyEdited) ? {
      slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    } : {}),
  }))
}

const handleSlugChange = (value: string) => {
  setSlugManuallyEdited(true)
  setForm(prev => ({ ...prev, slug: value }))
}
```

**Slug field**: disabled on edit, with a hint message.

**Vacation basis field**: Use `Select` from `@/components/ui/select`:
```tsx
<div className="space-y-2">
  <Label htmlFor="vacationBasis">{t('fieldVacationBasis')}</Label>
  <Select
    value={form.vacationBasis}
    onValueChange={(value) => setForm(prev => ({ ...prev, vacationBasis: value as 'calendar_year' | 'entry_date' }))}
    disabled={isSubmitting}
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="calendar_year">{t('vacationBasisCalendarYear')}</SelectItem>
      <SelectItem value="entry_date">{t('vacationBasisEntryDate')}</SelectItem>
    </SelectContent>
  </Select>
</div>
```

**Validation:**
```typescript
function validateForm(formData: TenantFormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!formData.name.trim()) errors.push(t('validationNameRequired'))
  if (!isEdit) {
    if (!formData.slug.trim()) errors.push(t('validationSlugRequired'))
    if (formData.slug.length < 3) errors.push(t('validationSlugMinLength'))
    if (!/^[a-z0-9-]+$/.test(formData.slug)) errors.push(t('validationSlugPattern'))
  }
  if (!formData.addressStreet.trim()) errors.push(t('validationStreetRequired'))
  if (!formData.addressZip.trim()) errors.push(t('validationZipRequired'))
  if (!formData.addressCity.trim()) errors.push(t('validationCityRequired'))
  if (!formData.addressCountry.trim()) errors.push(t('validationCountryRequired'))
  return errors
}
```

**Submit handler:**
```typescript
const handleSubmit = async () => {
  const errors = validateForm(form, isEdit)
  if (errors.length > 0) {
    setError(errors.join('. '))
    return
  }

  try {
    if (isEdit && tenant) {
      await updateMutation.mutateAsync({
        path: { id: tenant.id },
        body: {
          name: form.name.trim(),
          address_street: form.addressStreet.trim(),
          address_zip: form.addressZip.trim(),
          address_city: form.addressCity.trim(),
          address_country: form.addressCountry.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          payroll_export_base_path: form.payrollExportBasePath.trim() || null,
          notes: form.notes.trim() || null,
          vacation_basis: form.vacationBasis,
          is_active: form.isActive,
        },
      })
    } else {
      await createMutation.mutateAsync({
        body: {
          name: form.name.trim(),
          slug: form.slug.trim(),
          address_street: form.addressStreet.trim(),
          address_zip: form.addressZip.trim(),
          address_city: form.addressCity.trim(),
          address_country: form.addressCountry.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          payroll_export_base_path: form.payrollExportBasePath.trim() || undefined,
          notes: form.notes.trim() || undefined,
          vacation_basis: form.vacationBasis,
        },
      })
    }
    onSuccess?.()
  } catch (err) {
    const apiError = err as { detail?: string; message?: string }
    setError(apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate'))
  }
}
```

### File 15: `apps/web/src/components/tenants/tenant-detail-sheet.tsx` (CREATE)

**Template**: `apps/web/src/components/locations/location-detail-sheet.tsx`

Follow the exact same pattern. Fetch single tenant via `useTenant(id)`.

**Props:**
```typescript
interface TenantDetailSheetProps {
  tenantId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (tenant: Tenant) => void
  onDeactivate: (tenant: Tenant) => void
}
```

**Sections:**
1. Header with Shield icon, name, slug (font-mono), active badge
2. Identity: name, slug
3. Address: street, zip, city, country
4. Contact: phone, email
5. Settings: payroll export path, vacation basis, notes
6. Timestamps: created_at, updated_at

**Footer buttons**: Close, Edit, Deactivate (destructive, only if active)

Use `DetailRow` helper component (same pattern as location detail sheet).

### File 16: `apps/web/src/components/tenants/tenant-deactivate-dialog.tsx` (CREATE)

**Template**: Uses `ConfirmDialog` from `@/components/ui/confirm-dialog`

This is the simplest component -- just wraps the existing ConfirmDialog:

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeactivateTenant } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

interface TenantDeactivateDialogProps {
  tenant: Tenant | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function TenantDeactivateDialog({
  tenant,
  open,
  onOpenChange,
  onSuccess,
}: TenantDeactivateDialogProps) {
  const t = useTranslations('adminTenants')
  const deactivateMutation = useDeactivateTenant()

  const handleConfirm = async () => {
    if (!tenant) return
    try {
      await deactivateMutation.mutateAsync({ path: { id: tenant.id } })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('deactivateTenant')}
      description={tenant ? t('deactivateDescription', { name: tenant.name }) : ''}
      confirmLabel={t('deactivateConfirm')}
      variant="destructive"
      isLoading={deactivateMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
```

### Verification
- All components compile without errors
- Data table renders tenant data with correct columns
- Form sheet can create and edit tenants
- Slug auto-generates from name on create
- Slug is locked on edit
- Detail sheet shows all tenant information grouped by section
- Deactivate dialog uses destructive styling and correct wording

---

## Phase 7: Tenant Management Page

### File 17: `apps/web/src/app/[locale]/(dashboard)/admin/tenants/page.tsx` (CREATE)

**Template**: `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx`

Follow the exact same structure but adapted for tenants.

**Key differences from locations page:**
1. Uses `useTenants` hook with `{ params: { include_inactive: showInactive } }` option
2. Has "Show inactive" toggle filter (checkbox or switch) in addition to search
3. Uses `TenantDataTable`, `TenantFormSheet`, `TenantDetailSheet`, `TenantDeactivateDialog` instead of location components
4. Empty state uses Shield icon instead of MapPin
5. "Deactivate" action instead of "Delete"

**State:**
```typescript
const [search, setSearch] = React.useState('')
const [showInactive, setShowInactive] = React.useState(false)
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<Tenant | null>(null)
const [viewItem, setViewItem] = React.useState<Tenant | null>(null)
const [deactivateItem, setDeactivateItem] = React.useState<Tenant | null>(null)
```

**Tenant data extraction** -- check the hook return type. If the API returns `Tenant[]` directly:
```typescript
const { data: tenantsResponse, isLoading } = useTenants({
  enabled: !authLoading && isAdmin,
  params: { include_inactive: showInactive },
})
// Adjust based on actual response shape:
const tenants = Array.isArray(tenantsResponse) ? tenantsResponse : (tenantsResponse?.data ?? [])
```

**Filter bar:**
```tsx
<div className="flex flex-wrap items-center gap-4">
  <SearchInput
    value={search}
    onChange={setSearch}
    placeholder={t('searchPlaceholder')}
    className="w-full sm:w-80"
  />
  <div className="flex items-center gap-2">
    <Switch
      id="showInactive"
      checked={showInactive}
      onCheckedChange={setShowInactive}
      size="sm"
    />
    <Label htmlFor="showInactive" className="text-sm">{t('showInactive')}</Label>
  </div>
  {hasFilters && (
    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setShowInactive(false) }}>
      <X className="mr-2 h-4 w-4" />
      {t('clearFilters')}
    </Button>
  )}
</div>
```

**Client-side filtering** (search on name, slug, city):
```typescript
const filteredItems = React.useMemo(() => {
  if (!search.trim()) return tenants
  const searchLower = search.toLowerCase()
  return tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchLower) ||
      t.slug.toLowerCase().includes(searchLower) ||
      (t.address_city && t.address_city.toLowerCase().includes(searchLower))
  )
}, [tenants, search])
```

### Verification
- Navigate to `/admin/tenants` -- page loads
- Table shows all active tenants by default
- Toggle "Show inactive" to see deactivated tenants
- Search filters by name, slug, city
- "New Tenant" button opens form sheet
- Can create a new tenant with auto-generated slug
- Can view tenant details
- Can edit tenant (slug is locked)
- Can deactivate tenant via dialog

---

## File Summary

| # | File | Action | Template |
|---|------|--------|----------|
| 1 | `apps/web/src/hooks/api/use-system-settings.ts` | CREATE | `use-locations.ts` |
| 2 | `apps/web/src/hooks/api/use-tenants.ts` | CREATE | `use-locations.ts` |
| 3 | `apps/web/src/hooks/api/index.ts` | MODIFY | -- |
| 4 | `apps/web/src/components/ui/tag-input.tsx` | CREATE | `time-input.tsx` |
| 5 | `apps/web/messages/en.json` | MODIFY | `adminLocations` namespace |
| 6 | `apps/web/messages/de.json` | MODIFY | `adminLocations` namespace |
| 7 | `apps/web/src/components/settings/index.ts` | CREATE | `locations/index.ts` |
| 8 | `apps/web/src/components/settings/system-settings-form.tsx` | CREATE | `location-form-sheet.tsx` + Card layout |
| 9 | `apps/web/src/components/settings/cleanup-tools-section.tsx` | CREATE | -- |
| 10 | `apps/web/src/components/settings/cleanup-dialog.tsx` | CREATE | -- |
| 11 | `apps/web/src/app/[locale]/(dashboard)/admin/settings/page.tsx` | CREATE | `locations/page.tsx` |
| 12 | `apps/web/src/components/tenants/index.ts` | CREATE | `locations/index.ts` |
| 13 | `apps/web/src/components/tenants/tenant-data-table.tsx` | CREATE | `location-data-table.tsx` |
| 14 | `apps/web/src/components/tenants/tenant-form-sheet.tsx` | CREATE | `location-form-sheet.tsx` |
| 15 | `apps/web/src/components/tenants/tenant-detail-sheet.tsx` | CREATE | `location-detail-sheet.tsx` |
| 16 | `apps/web/src/components/tenants/tenant-deactivate-dialog.tsx` | CREATE | `confirm-dialog.tsx` |
| 17 | `apps/web/src/app/[locale]/(dashboard)/admin/tenants/page.tsx` | CREATE | `locations/page.tsx` |

## Implementation Order

Execute phases in order (1 through 7). Within each phase, files can be created in any order. Each phase depends on the previous:
- Phase 1 (hooks) is prerequisite for all UI
- Phase 2 (TagInput) is prerequisite for Phase 4 (settings form uses it)
- Phase 3 (translations) is prerequisite for Phases 4-7 (all UI uses translations)
- Phase 4 (settings components) is prerequisite for Phase 5 (settings page)
- Phase 6 (tenant components) is prerequisite for Phase 7 (tenants page)

## Success Criteria

1. Admin can navigate to `/admin/settings` and see all settings in grouped collapsible cards
2. Admin can edit any setting and save (PUT to API, success feedback)
3. Save button is disabled when no changes have been made (dirty state tracking)
4. Proxy password field is never pre-filled, uses write-only placeholder
5. Tracked error codes use tag input (Enter to add, X to remove)
6. Server alive time uses HH:MM time input mapped to minutes from midnight
7. Cleanup tools section shows 4 destructive action cards
8. Cleanup dialog goes through input -> preview (confirm=false) -> typed confirmation -> execute (confirm=true) -> success
9. Admin can navigate to `/admin/tenants` and see active tenants in table
10. Admin can create a new tenant with auto-generated slug
11. Slug is locked (disabled) when editing
12. Admin can view tenant details in a side sheet
13. Admin can deactivate a tenant (DELETE endpoint, is_active=false) with confirmation
14. "Show inactive" toggle reveals deactivated tenants
15. Non-admin users are redirected away from both pages
16. All UI text uses translations (no hardcoded strings)
17. TypeScript compilation passes without errors
