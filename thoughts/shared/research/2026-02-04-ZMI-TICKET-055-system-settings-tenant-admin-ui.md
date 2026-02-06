# Research: ZMI-TICKET-055 System Settings & Tenant Admin UI

## 1. Existing Settings Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/settings/page.tsx`

The settings page currently exists as a **stub/placeholder** with minimal content. It renders a basic page layout with a title but no settings form, no API calls, and no components.

**What needs to happen**: Extend this page to include the `SystemSettingsForm` and `CleanupToolsSection` components.

The sidebar navigation already has entries for both pages:
- Settings: `href: '/admin/settings'` (icon: `Settings`)
- Tenants: `href: '/admin/tenants'` (icon: `Shield`)

These are defined in `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (lines 263-273), both under the "administration" section with `roles: ['admin']`.

---

## 2. Existing Tenants Page

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/tenants/page.tsx`

The tenants page also exists as a **stub/placeholder** with minimal content. Same story as settings - basic page layout, no table, no CRUD operations.

**What needs to happen**: Extend this page to include the tenant data table and CRUD components.

---

## 3. System Settings Backend

### API Spec

**File**: `api/paths/system-settings.yaml`

Two endpoints for system settings:
- `GET /system-settings` -> returns `SystemSettings` (200)
- `PUT /system-settings` -> accepts `UpdateSystemSettingsRequest`, returns `SystemSettings` (200)

Four cleanup endpoints:
- `POST /system-settings/cleanup/delete-bookings` -> `CleanupDeleteBookingsRequest` -> `CleanupResult`
- `POST /system-settings/cleanup/delete-booking-data` -> `CleanupDeleteBookingDataRequest` -> `CleanupResult`
- `POST /system-settings/cleanup/re-read-bookings` -> `CleanupReReadBookingsRequest` -> `CleanupResult`
- `POST /system-settings/cleanup/mark-delete-orders` -> `CleanupMarkDeleteOrdersRequest` -> `CleanupResult`

### Schema (`api/schemas/system-settings.yaml`)

**SystemSettings** fields:
- `id` (uuid, required)
- `tenant_id` (uuid, required)
- `rounding_relative_to_plan` (boolean)
- `error_list_enabled` (boolean)
- `tracked_error_codes` (string array)
- `auto_fill_order_end_bookings` (boolean)
- `birthday_window_days_before` (integer, 0-90)
- `birthday_window_days_after` (integer, 0-90)
- `follow_up_entries_enabled` (boolean)
- `proxy_host` (string, nullable)
- `proxy_port` (integer, nullable)
- `proxy_username` (string, nullable)
- `proxy_enabled` (boolean)
- `server_alive_enabled` (boolean)
- `server_alive_expected_completion_time` (integer, nullable, minutes from midnight)
- `server_alive_threshold_minutes` (integer, nullable)
- `server_alive_notify_admins` (boolean)
- `created_at`, `updated_at` (datetime)

**UpdateSystemSettingsRequest**: Same fields as SystemSettings but all optional. Also includes:
- `proxy_password` (string, nullable, write-only - never returned in responses)

**Cleanup request schemas**:
- `CleanupDeleteBookingsRequest`: `date_from`, `date_to` (date, required), `employee_ids` (uuid array, optional), `confirm` (boolean)
- `CleanupDeleteBookingDataRequest`: same shape as above
- `CleanupReReadBookingsRequest`: same shape as above
- `CleanupMarkDeleteOrdersRequest`: `order_ids` (uuid array, required), `confirm` (boolean)

**CleanupResult**:
- `operation` (enum: delete_bookings | delete_booking_data | re_read_bookings | mark_delete_orders)
- `affected_count` (integer)
- `preview` (boolean)
- `details` (object, additionalProperties)
- `performed_at` (datetime)

### Handler

**File**: `apps/api/internal/handler/systemsettings.go`

Fully implemented:
- `GetSettings` - GET /system-settings
- `UpdateSettings` - PUT /system-settings (maps all fields from request to service input)
- `CleanupDeleteBookings` - POST cleanup endpoint (supports preview via confirm=false)
- `CleanupDeleteBookingData` - POST cleanup endpoint
- `CleanupReReadBookings` - POST cleanup endpoint
- `CleanupMarkDeleteOrders` - POST cleanup endpoint

Important backend validation errors:
- `ErrInvalidBirthdayWindow`
- `ErrInvalidServerAliveTime`
- `ErrInvalidServerAliveThreshold`
- `ErrInvalidDateRange`
- `ErrDateRangeTooLarge`
- `ErrCleanupNoOrderIDs`

Note: The handler maps boolean fields slightly differently - it checks `if req.RoundingRelativeToPlan` etc. which means `false` values won't be detected as "present". This is a known backend limitation; the UI should always send all fields.

---

## 4. Tenant Backend

### API Spec

**File**: `api/paths/tenants.yaml`

Full CRUD:
- `GET /tenants` -> returns `Tenant[]` (200). Query params: `active`, `include_inactive`, `name`
- `POST /tenants` -> accepts `CreateTenantRequest`, returns `Tenant` (201)
- `GET /tenants/{id}` -> returns `Tenant` (200)
- `PATCH /tenants/{id}` -> accepts `UpdateTenantRequest`, returns `Tenant` (200)
- `DELETE /tenants/{id}` -> 204 (deactivates, does NOT hard-delete)

### Schema (`api/schemas/tenants.yaml`)

**Tenant** fields:
- `id` (uuid, required)
- `name` (string, required)
- `slug` (string, required)
- `address_street`, `address_zip`, `address_city`, `address_country` (strings)
- `phone` (string)
- `email` (email)
- `payroll_export_base_path` (string)
- `notes` (string)
- `vacation_basis` (enum: "calendar_year" | "entry_date", required)
- `settings` (object, additional properties)
- `is_active` (boolean, required)
- `created_at` (datetime, required)
- `updated_at` (datetime)

**CreateTenantRequest** (all address fields required):
- `name` (1-255, required)
- `slug` (3-100, pattern `^[a-z0-9-]+$`, required)
- `address_street`, `address_zip`, `address_city`, `address_country` (all required)
- `phone`, `email`, `payroll_export_base_path`, `notes` (nullable/optional)
- `vacation_basis` (optional, defaults to calendar_year)

**UpdateTenantRequest** (all nullable/optional for partial updates):
- `name`, `address_street`, `address_zip`, `address_city`, `address_country`
- `phone`, `email`, `payroll_export_base_path`, `notes`
- `vacation_basis` (nullable)
- `is_active` (nullable boolean)

### Handler

**File**: `apps/api/internal/handler/tenant.go`

Fully implemented. The `Delete` handler actually calls `h.tenantService.Deactivate()` (soft-delete/deactivation).

Backend validation errors for Create:
- `ErrTenantSlugExists`
- `ErrInvalidTenantSlug`
- `ErrInvalidTenantName`
- `ErrInvalidAddress`
- `ErrInvalidTenantVacationBasis`

---

## 5. Generated TypeScript Types

**File**: `apps/web/src/lib/api/types.ts` (auto-generated via openapi-typescript)

All types are available under `components['schemas']`:

```typescript
// System Settings
type SystemSettings = components['schemas']['SystemSettings']
type UpdateSystemSettingsRequest = components['schemas']['UpdateSystemSettingsRequest']
type CleanupDeleteBookingsRequest = components['schemas']['CleanupDeleteBookingsRequest']
type CleanupDeleteBookingDataRequest = components['schemas']['CleanupDeleteBookingDataRequest']
type CleanupReReadBookingsRequest = components['schemas']['CleanupReReadBookingsRequest']
type CleanupMarkDeleteOrdersRequest = components['schemas']['CleanupMarkDeleteOrdersRequest']
type CleanupResult = components['schemas']['CleanupResult']

// Tenants
type Tenant = components['schemas']['Tenant']
type CreateTenantRequest = components['schemas']['CreateTenantRequest']
type UpdateTenantRequest = components['schemas']['UpdateTenantRequest']
```

API paths available in types:
- `/system-settings` -> GET (getSystemSettings), PUT (updateSystemSettings)
- `/system-settings/cleanup/delete-bookings` -> POST
- `/system-settings/cleanup/delete-booking-data` -> POST
- `/system-settings/cleanup/re-read-bookings` -> POST
- `/system-settings/cleanup/mark-delete-orders` -> POST
- `/tenants` -> GET (listTenants), POST (createTenant)
- `/tenants/{id}` -> GET (getTenant), PATCH (updateTenant), DELETE (deleteTenant)

---

## 6. Existing CRUD Page Pattern (Reference: Locations)

### Page Structure

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx`

The locations page is a good reference for the tenant CRUD page. It follows this pattern:
- `'use client'` page component
- Uses `useTranslations('adminLocations')` for all text
- Manages state for: items list, selected item, form sheet open, detail sheet open, delete confirm
- Renders: header with title + "New" button, search/filter bar, data table, form sheet, detail sheet, confirm dialog

### Component Structure

**File**: `apps/web/src/components/locations/index.ts`

Three components exported:
1. `LocationDataTable` - table with columns, skeleton, row actions
2. `LocationFormSheet` - side sheet with create/edit form
3. `LocationDetailSheet` - side sheet with read-only detail view

### Data Table Pattern

**File**: `apps/web/src/components/locations/location-data-table.tsx`

Key patterns:
- Props: `items`, `isLoading`, `onView`, `onEdit`, `onDelete`
- Uses `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` from `@/components/ui/table`
- Row actions via `DropdownMenu` with View, Edit, Delete options
- `Badge` for status display
- Skeleton loader when `isLoading` is true
- Click on row triggers `onView`

### Form Sheet Pattern

**File**: `apps/web/src/components/locations/location-form-sheet.tsx`

Key patterns:
- Props: `open`, `onOpenChange`, `location` (null for create), `onSuccess`
- Uses `Sheet`/`SheetContent` side="right" with `ScrollArea` for long forms
- Local form state with `React.useState<FormState>`
- `React.useEffect` to sync form state when opening (edit vs create)
- Section headers using `<h3 className="text-sm font-medium text-muted-foreground">`
- Switch toggle pattern (Label + description + Switch in a flex row)
- Error display via `Alert variant="destructive"`
- Footer with Cancel + Submit buttons
- Mutation hooks for create/update

### Detail Sheet Pattern

**File**: `apps/web/src/components/locations/location-detail-sheet.tsx`

Key patterns:
- Fetches single item via `useLocation(id)` hook
- `DetailRow` helper component for label/value pairs
- Sections with `<h4>` headers + bordered rounded containers
- Footer with Close, Edit, Delete buttons

---

## 7. Form Component Patterns

### Switch Component

**File**: `apps/web/src/components/ui/switch.tsx`

Standard Radix Switch with two sizes: `"sm"` and `"default"`. Used throughout the codebase (locations, users).

Usage pattern in forms:
```tsx
<div className="flex items-center justify-between rounded-lg border p-4">
  <div className="space-y-0.5">
    <Label htmlFor="fieldId" className="text-sm">{t('fieldLabel')}</Label>
    <p className="text-xs text-muted-foreground">{t('fieldDescription')}</p>
  </div>
  <Switch
    id="fieldId"
    checked={form.fieldName}
    onCheckedChange={(checked) => setForm(prev => ({ ...prev, fieldName: checked }))}
    disabled={isSubmitting}
  />
</div>
```

### TimeInput Component

**File**: `apps/web/src/components/ui/time-input.tsx`

Already exists and accepts `value` as **minutes from midnight** (0-1440). Perfect for `server_alive_expected_completion_time`. Returns `number | null` via `onChange`.

### Tag Input Component

**No tag input component exists** in the codebase. A search for "tag.?input|TagInput" returned no results. **This needs to be created** for the `tracked_error_codes` field.

The simplest approach: create a `TagInput` component that:
- Displays tags as badges with remove buttons
- Has an input field for adding new tags (Enter to add)
- Returns `string[]` via onChange

### Password Field Pattern

**File**: `apps/web/src/components/users/user-form-sheet.tsx` (lines 293-322)

Uses a standard `Input type={showPassword ? 'text' : 'password'}` with an Eye/EyeOff toggle button positioned absolutely inside the input.

### Collapsible/Section Toggle Pattern

**No `@radix-ui/react-collapsible` or `@radix-ui/react-accordion` installed**. The codebase uses a manual pattern with state toggle:

```tsx
const [showSection, setShowSection] = React.useState(false)

<div className="flex items-center justify-between">
  <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
  <Button variant="ghost" size="sm" onClick={() => setShowSection(!showSection)}>
    {showSection ? <ChevronUp /> : <ChevronDown />}
    {showSection ? 'Hide' : 'Show'}
  </Button>
</div>
{showSection && <div>...content...</div>}
```

For the settings page's collapsible cards, a similar pattern can be used, but wrapped in `Card` components.

### Card Component

**File**: `apps/web/src/components/ui/card.tsx`

Available: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.

---

## 8. Dialog Patterns

### ConfirmDialog (Existing)

**File**: `apps/web/src/components/ui/confirm-dialog.tsx`

Uses `Sheet` with `side="bottom"` (NOT `Dialog`). Props:
- `open`, `onOpenChange`, `title`, `description`
- `confirmLabel`, `cancelLabel`, `variant` ('default' | 'destructive')
- `isLoading`, `onConfirm`

Renders AlertTriangle icon for destructive variant. This is used for simple delete confirmations throughout the codebase.

### Standard Dialog

**File**: `apps/web/src/components/ui/dialog.tsx`

Standard Radix Dialog with `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.

### Typed Confirmation Dialog

**Does not exist**. The cleanup-dialog needs a **two-step confirmation** (preview count -> type phrase to confirm). This is a new pattern not yet in the codebase. Should be built as a new component.

Recommended approach for `cleanup-dialog.tsx`:
1. Step 1: Show preview (call API with `confirm: false`, display `affected_count`)
2. Step 2: Show typed confirmation input (user types "DELETE" or similar phrase)
3. On confirmed: call API with `confirm: true`

---

## 9. API Hook Patterns

### Base Hooks

**File**: `apps/web/src/hooks/use-api-query.ts`

Type-safe wrapper around `useQuery` from TanStack React Query. Takes typed path + options with `params` and `path`.

**File**: `apps/web/src/hooks/use-api-mutation.ts`

Type-safe wrapper around `useMutation`. Supports `post`, `put`, `patch`, `delete` methods. Takes `invalidateKeys` for cache invalidation.

### Domain Hook Pattern (Reference: use-locations.ts)

**File**: `apps/web/src/hooks/api/use-locations.ts`

```typescript
export function useLocations(options = {}) {
  return useApiQuery('/locations', { enabled })
}
export function useLocation(id: string, enabled = true) {
  return useApiQuery('/locations/{id}', { path: { id }, enabled: enabled && !!id })
}
export function useCreateLocation() {
  return useApiMutation('/locations', 'post', { invalidateKeys: [['/locations']] })
}
export function useUpdateLocation() {
  return useApiMutation('/locations/{id}', 'patch', { invalidateKeys: [['/locations']] })
}
export function useDeleteLocation() {
  return useApiMutation('/locations/{id}', 'delete', { invalidateKeys: [['/locations']] })
}
```

### Hooks Index

**File**: `apps/web/src/hooks/api/index.ts`

All domain hooks are re-exported from this index. New hooks for system settings and tenants need to be added here.

### Special Patterns Needed

**For system settings (GET + PUT, not CRUD)**:
```typescript
// use-system-settings.ts
export function useSystemSettings() {
  return useApiQuery('/system-settings')
}
export function useUpdateSystemSettings() {
  return useApiMutation('/system-settings', 'put', {
    invalidateKeys: [['/system-settings']]
  })
}
export function useCleanupDeleteBookings() {
  return useApiMutation('/system-settings/cleanup/delete-bookings', 'post')
}
// ... similar for other 3 cleanup endpoints
```

**For tenants (standard CRUD)**:
```typescript
// use-tenants.ts
export function useTenants(options = {}) {
  return useApiQuery('/tenants', { params: { include_inactive: true, ...params } })
}
export function useTenant(id: string, enabled = true) {
  return useApiQuery('/tenants/{id}', { path: { id }, enabled: enabled && !!id })
}
export function useCreateTenant() {
  return useApiMutation('/tenants', 'post', { invalidateKeys: [['/tenants']] })
}
export function useUpdateTenant() {
  return useApiMutation('/tenants/{id}', 'patch', { invalidateKeys: [['/tenants']] })
}
export function useDeactivateTenant() {
  return useApiMutation('/tenants/{id}', 'delete', { invalidateKeys: [['/tenants']] })
}
```

---

## 10. Translation Files

**Files**: `apps/web/messages/en.json`, `apps/web/messages/de.json`

### Existing nav entries (already present)

```json
"settings": "Settings",
"tenants": "Tenants"
```

### No existing translation namespaces

There are **no** existing `adminSettings` or `adminTenants` namespaces. These need to be created.

### Pattern to follow

Reference: `adminLocations` namespace structure:
```json
"adminLocations": {
  "title": "Locations",
  "subtitle": "...",
  "newLocation": "New Location",
  "searchPlaceholder": "...",
  "clearFilters": "...",
  "columnCode": "Code",
  "columnName": "Name",
  ... column keys ...
  "statusActive": "Active",
  "statusInactive": "Inactive",
  "viewDetails": "View Details",
  "edit": "Edit",
  "delete": "Delete",
  ... form field keys ...
  ... validation keys ...
  ... section keys ...
}
```

### New namespaces needed

1. `adminSettings` - for the system settings form, cleanup tools, section headers, field labels, etc.
2. `adminTenants` - for the tenant CRUD page, table columns, form fields, deactivation dialog, etc.

---

## 11. Gaps and Items to Create

### New Files Needed

**Components** (in `apps/web/src/components/`):

1. `system-settings/system-settings-form.tsx` - grouped settings form with collapsible card sections
2. `system-settings/cleanup-tools-section.tsx` - destructive action cards
3. `system-settings/cleanup-dialog.tsx` - two-step preview + confirm dialog
4. `system-settings/index.ts` - barrel export
5. `tenants/tenant-data-table.tsx` - tenant list table
6. `tenants/tenant-form-sheet.tsx` - create/edit tenant sheet
7. `tenants/tenant-detail-sheet.tsx` - view tenant details sheet
8. `tenants/tenant-deactivate-dialog.tsx` - deactivation confirmation
9. `tenants/index.ts` - barrel export

**Hooks** (in `apps/web/src/hooks/api/`):

10. `use-system-settings.ts` - GET/PUT system settings + 4 cleanup POST hooks
11. `use-tenants.ts` - CRUD + deactivate hooks

**UI Components** (in `apps/web/src/components/ui/`):

12. `tag-input.tsx` - tag input component for `tracked_error_codes`

**Extend existing files**:

13. `apps/web/src/app/[locale]/(dashboard)/admin/settings/page.tsx` - add SystemSettingsForm + CleanupToolsSection
14. `apps/web/src/app/[locale]/(dashboard)/admin/tenants/page.tsx` - add tenant data table + CRUD
15. `apps/web/src/hooks/api/index.ts` - add exports for new hooks
16. `apps/web/messages/en.json` - add `adminSettings` and `adminTenants` namespaces
17. `apps/web/messages/de.json` - add `adminSettings` and `adminTenants` namespaces

### Dependencies

No new npm packages needed. All required UI primitives exist:
- `Switch` - exists (`@radix-ui/react-switch`)
- `Card` - exists
- `Dialog` - exists (`@radix-ui/react-dialog`)
- `Input`, `Label`, `Button`, `Badge` - all exist
- `TimeInput` - exists (minutes-from-midnight)
- `Sheet` - exists (for form sheets)
- `ConfirmDialog` - exists (for simple confirmations)
- `Table` components - exist
- `DropdownMenu` - exists

Missing: `@radix-ui/react-collapsible` is NOT installed. Use the manual ChevronDown/ChevronUp toggle pattern already established in the codebase.

### Key Architecture Decisions

1. **Settings form is NOT a sheet** - it's a full-page form with save button, unlike CRUD entities that use sheets. Use `Card` components for each section.

2. **Dirty state tracking** - No existing pattern for unsaved changes warnings. Consider using `React.useRef` to track initial values and comparing with current form state.

3. **Cleanup dialog is two-step** - First call with `confirm: false` to get preview count, then show typed confirmation, then call with `confirm: true`. This is a new UI pattern.

4. **Tenant "delete" is actually deactivation** - The DELETE endpoint calls `Deactivate()`, not hard delete. The dialog should reflect this (e.g., "Deactivate Tenant" not "Delete Tenant").

5. **Tenant list returns array directly** - `GET /tenants` returns `Tenant[]`, not `{ data: Tenant[] }`. Note this for the hook's data extraction.

6. **System settings are singleton per tenant** - No list endpoint, just GET (auto-creates defaults) and PUT.

7. **Password field is write-only** - `proxy_password` is in `UpdateSystemSettingsRequest` but NOT in `SystemSettings` response. The form should show a placeholder/hint that a password is set (or empty field for new input).
