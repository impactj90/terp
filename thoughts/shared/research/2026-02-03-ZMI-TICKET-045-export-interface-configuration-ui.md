# Research: ZMI-TICKET-045 - Export Interface Configuration UI

Date: 2026-02-03
Ticket: ZMI-TICKET-045
Status: Research complete

## 1. Existing Admin CRUD Page Patterns

The codebase has a consistent pattern for admin CRUD pages. The best reference examples are the **Accounts**, **Tariffs**, and **Booking Types** pages.

### 1.1 Page Component Structure

All admin pages follow the same layout:

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
- Uses `'use client'` directive
- Imports `useTranslations` from `next-intl` with a page-specific namespace (e.g., `'adminAccounts'`)
- State management via `React.useState` for: search term, filters, selected item, form/detail/delete dialog open states
- Fetches list data via a custom API hook (e.g., `useAccounts()`)
- Client-side filtering of the list based on search and filter state
- Page layout pattern:
  ```
  <div className="space-y-6">
    <div> <!-- Header with title/subtitle/create button -->
    <Card> <!-- Filter toolbar + data table -->
      <CardHeader>  <!-- Search input, filter dropdowns, active count -->
      <CardContent> <!-- DataTable or empty state -->
    </Card>
    <FormSheet />    <!-- Create/edit sheet -->
    <DetailSheet />  <!-- Read-only detail sheet -->
    <ConfirmDialog /> <!-- Delete confirmation -->
  </div>
  ```

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/tariffs/page.tsx`
- Same pattern as accounts but includes additional `CopyTariffDialog` component
- Filter toolbar includes search input and status filter (Select dropdown)

**File**: `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`
- Same pattern, simpler variant

### 1.2 Data Table Component

**File**: `apps/web/src/components/accounts/account-data-table.tsx`

Structure:
- Props: `{ items[], isLoading, onView, onEdit, onDelete, onToggleActive? }`
- Uses shadcn `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` components
- Each row is clickable (`onClick={() => onView(item)}`, `className="cursor-pointer"`)
- Actions column uses `DropdownMenu` with `DropdownMenuItem` entries for View, Edit, Delete
- Actions column has `onClick={(e) => e.stopPropagation()}` to prevent row click
- Status shown via `Badge` component with `variant` prop
- `isLoading` returns a skeleton table component (inline, not extracted)
- Empty check returns `null` (empty state handled at page level)
- Types derived from OpenAPI: `type Account = components['schemas']['Account']`

Skeleton pattern (inline at bottom of same file):
```tsx
function AccountDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          {/* ... */}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
            {/* ... */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### 1.3 Form Sheet Component

**File**: `apps/web/src/components/accounts/account-form-sheet.tsx`

Structure:
- Props: `{ open, onOpenChange, item?, onSuccess? }`
- `isEdit = !!item` determines create vs. edit mode
- Local `FormState` interface + `INITIAL_STATE` constant
- State managed via `React.useState<FormState>(INITIAL_STATE)`
- `React.useEffect` resets form state when `open` or `item` changes
- Validation: inline manual validation (no zod, no react-hook-form)
  - Collects error strings into `errors: string[]` array
  - Sets `error` state for display
- Uses `createMutation.mutateAsync()` / `updateMutation.mutateAsync()` in try/catch
- Error handling: catches API error with `(err as { detail?: string; message?: string })`
- Layout: `Sheet` with `side="right"`, `SheetContent` with `ScrollArea` for long forms
- Footer: Cancel + Submit buttons, with `Loader2` spinner during submit
- Sections organized with `<h3 className="text-sm font-medium text-muted-foreground">` headings

**No zod or react-hook-form usage exists anywhere in the frontend codebase.** All forms use manual `useState` with inline validation.

### 1.4 Detail Sheet Component

**File**: `apps/web/src/components/accounts/account-detail-sheet.tsx`

Structure:
- Props: `{ itemId, open, onOpenChange, onEdit, onDelete }`
- Fetches individual item data via `useAccount(id, open && !!id)`
- Loading state shows `Skeleton` placeholders
- Uses `DetailRow` helper component for key-value display
- Uses `BooleanBadge` helper for boolean values
- Sections: header (icon + name + status), description, details, configuration, timestamps, usage
- Footer: Close + Edit + Delete buttons
- Edit/Delete buttons disabled with `Tooltip` explanation for system items

### 1.5 Delete Dialog

**File**: `apps/web/src/components/ui/confirm-dialog.tsx`

- Reusable `ConfirmDialog` component (not domain-specific)
- Props: `{ open, onOpenChange, title, description, confirmLabel?, cancelLabel?, variant?, isLoading?, onConfirm }`
- Uses `Sheet` with `side="bottom"` (not a traditional dialog)
- Supports `variant="destructive"` with `AlertTriangle` icon
- Does NOT close automatically after confirm; parent controls open state

Usage pattern in page component:
```tsx
<ConfirmDialog
  open={deleteOpen}
  onOpenChange={setDeleteOpen}
  title={t('deleteTitle')}
  description={t('deleteDescription', { name: selectedItem?.name })}
  variant="destructive"
  confirmLabel={t('delete')}
  cancelLabel={t('cancel')}
  isLoading={deleteMutation.isPending}
  onConfirm={handleDelete}
/>
```

### 1.6 Component Barrel Exports

**File**: `apps/web/src/components/accounts/index.ts`
```ts
export { AccountDataTable } from './account-data-table'
export { AccountFormSheet } from './account-form-sheet'
export { AccountDetailSheet } from './account-detail-sheet'
```

**File**: `apps/web/src/components/tariffs/index.ts`
```ts
export { TariffDataTable } from './tariff-data-table'
export { TariffFormSheet } from './tariff-form-sheet'
export { TariffDetailSheet } from './tariff-detail-sheet'
export { CopyTariffDialog } from './copy-tariff-dialog'
export { RollingWeekPlanSelector } from './rolling-week-plan-selector'
export { XDaysRhythmConfig } from './x-days-rhythm-config'
```

---

## 2. API Hook Patterns

### 2.1 Core Hooks

**File**: `apps/web/src/hooks/use-api-query.ts`
- `useApiQuery<Path>(path, options?)` wraps `@tanstack/react-query` `useQuery`
- Type-safe via OpenAPI-generated `paths` type
- Query key: `[path, params, pathParams]`
- Options: `{ params?, path?, ...useQueryOptions }`
- Returns standard `useQuery` result

**File**: `apps/web/src/hooks/use-api-mutation.ts`
- `useApiMutation<Path, Method>(path, method, options?)` wraps `useMutation`
- Supports `'post' | 'put' | 'patch' | 'delete'`
- Options: `{ invalidateKeys?, onSuccess?, ...useMutationOptions }`
- `invalidateKeys` is `unknown[][]` -- automatically calls `queryClient.invalidateQueries` for each key on success
- Variables type: `{ body?, path? }`

### 2.2 Domain Hook Pattern (Accounts -- canonical example)

**File**: `apps/web/src/hooks/api/use-accounts.ts`

```ts
// List with filters
export function useAccounts(options: UseAccountsOptions = {}) {
  return useApiQuery('/accounts', {
    params: { account_type: accountType, active, ... },
    enabled,
  })
}

// Get single by ID
export function useAccount(id: string, enabled = true) {
  return useApiQuery('/accounts/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Create
export function useCreateAccount() {
  return useApiMutation('/accounts', 'post', {
    invalidateKeys: [['/accounts']],
  })
}

// Update
export function useUpdateAccount() {
  return useApiMutation('/accounts/{id}', 'patch', {
    invalidateKeys: [['/accounts'], ['/accounts/{id}'], ['/accounts/{id}/usage']],
  })
}

// Delete
export function useDeleteAccount() {
  return useApiMutation('/accounts/{id}', 'delete', {
    invalidateKeys: [['/accounts'], ['/accounts/{id}'], ['/accounts/{id}/usage']],
  })
}
```

### 2.3 Existing Export Interface Hooks (in Payroll Exports)

**File**: `apps/web/src/hooks/api/use-payroll-exports.ts`

Already contains a minimal `useExportInterfaces` hook used for the payroll export generate dialog:
```ts
export function useExportInterfaces(enabled = true) {
  return useApiQuery('/export-interfaces', {
    params: { active_only: true },
    enabled,
  })
}
```

This hook needs to be moved/extended for the new dedicated hooks file.

### 2.4 Hook Registration

**File**: `apps/web/src/hooks/index.ts` -- only exports core hooks (`useApiQuery`, `useApiMutation`, auth hooks). Domain-specific hooks are imported directly from their files via `@/hooks/api/use-accounts` etc.

**File**: `apps/web/src/hooks/api/index.ts` -- re-exports all domain hooks. New hooks file must be added here.

---

## 3. Dual-List / Transfer-List Patterns

**No dual-list or transfer-list component currently exists in the codebase.** A grep for "transfer" and "dual-list" returned zero results in frontend components.

The only match was in `apps/web/src/lib/api/types.ts` which is auto-generated and not a component.

This will be a **new UI pattern** for the codebase. The account-mapping-dialog will need to be built from scratch, using existing UI primitives:
- `Sheet` or full-screen dialog wrapper
- `ScrollArea` for the two list panels
- `Button` for transfer controls
- `Input` for search filtering
- `Checkbox` for multi-select (from shadcn)
- Potentially `@dnd-kit` or similar for drag-and-drop reordering (would need to check `package.json`)

---

## 4. Export Interface Backend API

### 4.1 OpenAPI Spec

**File**: `api/paths/export-interfaces.yaml`

Endpoints:
| Method | Path | Operation | Notes |
|--------|------|-----------|-------|
| GET | `/export-interfaces` | listExportInterfaces | Query param: `active_only` (boolean) |
| POST | `/export-interfaces` | createExportInterface | Body: `CreateExportInterfaceRequest`, 409 on duplicate number |
| GET | `/export-interfaces/{id}` | getExportInterface | Returns `ExportInterface` with accounts |
| PATCH | `/export-interfaces/{id}` | updateExportInterface | Body: `UpdateExportInterfaceRequest` |
| DELETE | `/export-interfaces/{id}` | deleteExportInterface | 409 if has generated exports |
| GET | `/export-interfaces/{id}/accounts` | listExportInterfaceAccounts | Returns `{ data: ExportInterfaceAccount[] }` |
| PUT | `/export-interfaces/{id}/accounts` | setExportInterfaceAccounts | Body: `{ account_ids: uuid[] }`, replaces all |

### 4.2 OpenAPI Schemas

**File**: `api/schemas/export-interfaces.yaml`

**ExportInterface**:
- `id` (uuid, required)
- `tenant_id` (uuid, required)
- `interface_number` (integer, required, example: 1)
- `name` (string, required, example: "Payroll Export DATEV")
- `mandant_number` (string, nullable)
- `export_script` (string, nullable)
- `export_path` (string, nullable)
- `output_filename` (string, nullable)
- `is_active` (boolean)
- `accounts` (array of ExportInterfaceAccount)
- `created_at`, `updated_at` (date-time)

**ExportInterfaceAccount**:
- `account_id` (uuid, required)
- `account_code` (string)
- `account_name` (string)
- `payroll_code` (string, nullable)
- `sort_order` (integer)

**CreateExportInterfaceRequest**:
- `interface_number` (integer, min: 1, required)
- `name` (string, minLength: 1, maxLength: 255, required)
- `mandant_number` (string, maxLength: 50)
- `export_script` (string, maxLength: 255)
- `export_path` (string, maxLength: 500)
- `output_filename` (string, maxLength: 255)

**UpdateExportInterfaceRequest**: all fields optional, plus `is_active` (boolean)

**SetExportInterfaceAccountsRequest**: `{ account_ids: uuid[] }`

### 4.3 TypeScript Types (Generated)

**File**: `apps/web/src/lib/api/types.ts`

The types are generated and available as:
- `components['schemas']['ExportInterface']`
- `components['schemas']['ExportInterfaceSummary']`
- `components['schemas']['ExportInterfaceAccount']`
- `components['schemas']['CreateExportInterfaceRequest']`
- `components['schemas']['UpdateExportInterfaceRequest']`
- `components['schemas']['ExportInterfaceList']`
- `components['schemas']['SetExportInterfaceAccountsRequest']`

Path types exist for all endpoints:
- `paths['/export-interfaces']` -- get, post
- `paths['/export-interfaces/{id}']` -- get, patch, delete
- `paths['/export-interfaces/{id}/accounts']` -- get, put

### 4.4 Go Handler

**File**: `apps/api/internal/handler/exportinterface.go`

Full CRUD + account management handler. Key patterns:
- Error handling via `handleExportInterfaceError` function maps service errors to HTTP status codes:
  - `ErrExportInterfaceNotFound` -> 404
  - `ErrExportInterfaceNameRequired` -> 400
  - `ErrExportInterfaceNumberRequired` -> 400
  - `ErrExportInterfaceNumberExists` -> 409 "An interface with this number already exists"
  - `ErrExportInterfaceInUse` -> 409 "Interface has generated exports and cannot be deleted"
  - `ErrExportInterfaceNoAccounts` -> 400
- Audit logging on Create, Update, Delete
- `SetAccounts` parses `account_ids` from `SetExportInterfaceAccountsRequest`
- `ListAccounts` returns `{ data: ExportInterfaceAccount[] }`

### 4.5 Route Registration

**File**: `apps/api/internal/handler/routes.go`

```go
func RegisterExportInterfaceRoutes(r chi.Router, h *ExportInterfaceHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("payroll.manage").String()
    r.Route("/export-interfaces", func(r chi.Router) {
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
        r.With(authz.RequirePermission(permManage)).Put("/{id}/accounts", h.SetAccounts)
        r.With(authz.RequirePermission(permManage)).Get("/{id}/accounts", h.ListAccounts)
    })
}
```

All endpoints require `payroll.manage` permission.

---

## 5. Existing Account-Related Code

### 5.1 Account Hooks

**File**: `apps/web/src/hooks/api/use-accounts.ts`

Provides: `useAccounts(options?)`, `useAccount(id)`, `useAccountUsage(id)`, `useCreateAccount()`, `useUpdateAccount()`, `useDeleteAccount()`

The `useAccounts` hook supports filtering: `{ accountType?, active?, includeSystem?, enabled? }`

For the dual-list, the implementation will need:
- `useAccounts({ active: true })` to get all active accounts
- `useExportInterfaceAccounts(interfaceId)` to get assigned accounts
- Client-side computation of "available" = all accounts minus assigned

### 5.2 Account Component Files

**Directory**: `apps/web/src/components/accounts/`
- `account-data-table.tsx`
- `account-form-sheet.tsx`
- `account-detail-sheet.tsx`
- `index.ts`

### 5.3 Account Schema (for reference)

The `Account` schema (from types.ts) includes:
- `id`, `code`, `name`, `description`, `account_type`, `is_payroll_relevant`, `payroll_code`, `sort_order`, `is_active`, `is_system`

---

## 6. Navigation Sidebar & Breadcrumbs

### 6.1 Sidebar Navigation Config

**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Structure:
```ts
export interface NavItem {
  titleKey: string  // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  roles?: UserRole[]
}

export interface NavSection {
  titleKey: string  // Translation key in 'nav' namespace
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [
  { titleKey: 'main', items: [...] },
  { titleKey: 'management', roles: ['admin'], items: [...] },
  { titleKey: 'administration', roles: ['admin'], items: [...] },
]
```

The "Payroll Exports" entry is currently in the **"administration"** section:
```ts
{
  titleKey: 'payrollExports',
  href: '/admin/payroll-exports',
  icon: FileOutput,
  roles: ['admin'],
}
```

Export Interfaces would logically go in the same section or nearby.

Icon imports come from `lucide-react`. Currently imported icons include: `FileOutput` (payroll exports), `Wallet` (accounts), `Settings` (settings), etc.

### 6.2 Breadcrumbs

**File**: `apps/web/src/components/layout/breadcrumbs.tsx`

Uses a `segmentToKey` mapping:
```ts
const segmentToKey: Record<string, string> = {
  'payroll-exports': 'payrollExports',
  accounts: 'accounts',
  // ... etc
}
```

New entry needed: `'export-interfaces': 'exportInterfaces'`

Breadcrumbs automatically generate from the pathname. UUID segments are displayed as "Details". The component uses the `'breadcrumbs'` translation namespace.

---

## 7. Translations / i18n Structure

### 7.1 Translation Files

**Files**:
- `apps/web/messages/en.json` -- English translations
- `apps/web/messages/de.json` -- German translations

### 7.2 Namespace Convention

Each admin page has its own namespace at the top level of the JSON:
- `"adminAccounts": { ... }` -- ~80 keys
- `"adminTariffs": { ... }` -- ~80 keys
- `"adminDayPlans": { ... }`

### 7.3 Key Patterns (from adminAccounts)

Organized by purpose:
```json
{
  "adminAccounts": {
    "title": "Accounts",
    "subtitle": "Manage time tracking accounts for your organization",
    "newAccount": "New Account",
    "searchPlaceholder": "Search by code or name...",
    "allTypes": "All Types",
    "active": "Active",
    "inactive": "Inactive",
    "clearFilters": "Clear filters",
    "deleteAccount": "Delete Account",
    "deleteDescription": "Are you sure you want to delete \"{name}\" ({code})? ...",
    "delete": "Delete",
    "emptyTitle": "No accounts found",
    "emptyFilterHint": "Try adjusting your filters",
    "emptyGetStarted": "Get started by creating your first account",
    "addAccount": "Add Account",
    "accountDetails": "Account Details",
    "actions": "Actions",
    "cancel": "Cancel",
    "close": "Close",
    "columnCode": "Code",
    "columnName": "Name",
    "columnStatus": "Status",
    "create": "Create",
    "createDescription": "Add a new account to the system.",
    "edit": "Edit",
    "editAccount": "Edit Account",
    "editDescription": "Modify the selected account.",
    "failedCreate": "Failed to create account",
    "failedUpdate": "Failed to update account",
    "fieldCode": "Code",
    "fieldName": "Name",
    "saveChanges": "Save Changes",
    "saving": "Saving...",
    "sectionBasicInfo": "Basic Information",
    "viewDetails": "View Details"
  }
}
```

### 7.4 Navigation & Breadcrumb Keys

**nav namespace** (`"nav": { ... }`):
```json
"payrollExports": "Payroll Exports"
```

**breadcrumbs namespace** (`"breadcrumbs": { ... }`):
```json
"payrollExports": "Payroll Exports"
```

Both namespaces need new entries for `exportInterfaces`.

### 7.5 Translation Usage Pattern

```tsx
const t = useTranslations('adminAccounts')
// Usage:
t('title')           // "Accounts"
t('deleteDescription', { name: item.name })  // With interpolation
t(typeInfo.labelKey as Parameters<typeof t>[0])  // Dynamic key
```

The `as Parameters<typeof t>[0]` cast is used when the key is dynamically determined.

---

## 8. Form Validation

### 8.1 No Zod / React-Hook-Form

**Confirmed**: No zod or react-hook-form usage exists in the frontend codebase. A grep for `zod|zodResolver|react-hook-form|useForm` returned zero results.

### 8.2 Validation Pattern

All forms use manual validation with `React.useState`:

```tsx
const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
const [error, setError] = React.useState<string | null>(null)

const handleSubmit = async () => {
  setError(null)
  const errors: string[] = []
  if (!form.code.trim()) errors.push(t('validationCodeRequired'))
  else if (form.code.length > 20) errors.push(t('validationCodeMaxLength'))
  if (!form.name.trim()) errors.push(t('validationNameRequired'))
  if (errors.length > 0) {
    setError(errors.join('. '))
    return
  }
  try {
    await mutation.mutateAsync({ body: { ... } })
    onSuccess?.()
  } catch (err) {
    const apiError = err as { detail?: string; message?: string }
    setError(apiError.detail ?? apiError.message ?? t('failedCreate'))
  }
}
```

### 8.3 Error Display

Inline `Alert variant="destructive"` with `AlertDescription`:
```tsx
{error && (
  <Alert variant="destructive">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

### 8.4 API Error Structure

**File**: `apps/web/src/lib/api/errors.ts`

- `ProblemDetails` interface (RFC 7807): `{ type, title, status, detail?, instance?, errors? }`
- `ApiError` interface: `{ status, title, message, fieldErrors?, raw }`
- `parseApiError(error)` converts raw API errors
- Helper functions: `isHttpStatus()`, `isValidationError()`, etc.
- For 409 detection: `isHttpStatus(error, 409)` or check `error.status === 409`

---

## 9. Skeleton Patterns

### 9.1 Base Skeleton Component

**File**: `apps/web/src/components/ui/skeleton.tsx`

Simple div with `animate-pulse`:
```tsx
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}
```

### 9.2 Table Skeleton Pattern (Inline)

From `account-data-table.tsx` -- skeleton defined as a private component in the same file:

```tsx
function AccountDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          {/* ... matching actual column widths */}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            {/* ... matching actual column content shapes */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### 9.3 Detail Sheet Skeleton Pattern

From `account-detail-sheet.tsx` -- inline skeleton in the loading branch:
```tsx
{isLoading ? (
  <div className="flex-1 space-y-4 py-4">
    <Skeleton className="h-12 w-12" />
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-1/2" />
  </div>
) : ( ... )}
```

### 9.4 Full Layout Skeleton

**File**: `apps/web/src/components/layout/loading-skeleton.tsx`

Used for initial page load with sidebar, header, breadcrumbs, and content area skeletons.

---

## 10. Existing Frontend Code for Export Interfaces

### 10.1 Already Existing

- `useExportInterfaces()` hook in `apps/web/src/hooks/api/use-payroll-exports.ts` (minimal, only lists active interfaces for dropdown)
- TypeScript types in `apps/web/src/lib/api/types.ts` (auto-generated, complete)

### 10.2 Not Yet Existing

- No dedicated hook file `use-export-interfaces.ts`
- No page at `admin/export-interfaces/page.tsx`
- No component directory `components/export-interfaces/`
- No nav entry for "Export Interfaces" in sidebar config
- No breadcrumb segment for `'export-interfaces'`
- No translation namespace for export interfaces in `en.json` or `de.json`

---

## 11. Key File Paths Reference

### Files to Create

| Purpose | Path |
|---------|------|
| Page | `apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx` |
| Data Table | `apps/web/src/components/export-interfaces/export-interface-data-table.tsx` |
| Form Sheet | `apps/web/src/components/export-interfaces/export-interface-form-sheet.tsx` |
| Detail Sheet | `apps/web/src/components/export-interfaces/export-interface-detail-sheet.tsx` |
| Account Mapping | `apps/web/src/components/export-interfaces/account-mapping-dialog.tsx` |
| Delete Dialog | `apps/web/src/components/export-interfaces/export-interface-delete-dialog.tsx` |
| Skeleton | `apps/web/src/components/export-interfaces/export-interface-skeleton.tsx` |
| Barrel Export | `apps/web/src/components/export-interfaces/index.ts` |
| API Hooks | `apps/web/src/hooks/api/use-export-interfaces.ts` |

### Files to Modify

| Purpose | Path |
|---------|------|
| Sidebar Nav Config | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` |
| Breadcrumbs | `apps/web/src/components/layout/breadcrumbs.tsx` |
| English Translations | `apps/web/messages/en.json` |
| German Translations | `apps/web/messages/de.json` |
| Hook Index | `apps/web/src/hooks/api/index.ts` (if exists -- note: hooks are imported directly, not via barrel) |

### Reference Files (patterns to follow)

| Purpose | Path |
|---------|------|
| Page pattern | `apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx` |
| Data table pattern | `apps/web/src/components/accounts/account-data-table.tsx` |
| Form sheet pattern | `apps/web/src/components/accounts/account-form-sheet.tsx` |
| Detail sheet pattern | `apps/web/src/components/accounts/account-detail-sheet.tsx` |
| API hooks pattern | `apps/web/src/hooks/api/use-accounts.ts` |
| Delete dialog | `apps/web/src/components/ui/confirm-dialog.tsx` |
| Error handling | `apps/web/src/lib/api/errors.ts` |
| Base skeleton | `apps/web/src/components/ui/skeleton.tsx` |

### Backend Reference Files

| Purpose | Path |
|---------|------|
| Handler | `apps/api/internal/handler/exportinterface.go` |
| Service | `apps/api/internal/service/exportinterface.go` |
| Repository | `apps/api/internal/repository/exportinterface.go` |
| Model | `apps/api/internal/model/exportinterface.go` |
| Route Registration | `apps/api/internal/handler/routes.go` |
| OpenAPI Paths | `api/paths/export-interfaces.yaml` |
| OpenAPI Schemas | `api/schemas/export-interfaces.yaml` |
| Generated Models | `apps/api/gen/models/export_interface.go` |
| Generated Models | `apps/api/gen/models/export_interface_account.go` |
| Generated Models | `apps/api/gen/models/create_export_interface_request.go` |
| Generated Models | `apps/api/gen/models/set_export_interface_accounts_request.go` |
