# Research: ZMI-TICKET-056 Contact Type & Kind Configuration UI

## 1. Existing Two-Panel / Master-Detail Patterns

**Finding: No existing two-panel master-detail pattern exists in the codebase.** All current admin pages use a single-panel layout with:
- A data table/grid for listing items
- Sheet/dialog overlays for create, edit, and detail views

The closest analog to a two-panel layout is the **user groups page**, which uses a card grid layout (`lg:grid-cols-2`) with expandable permission sections. However, this is still a single-panel page with no master-detail selection.

The contact-types page will be the **first** two-panel/master-detail page in the codebase. The pattern will need to be constructed from existing primitives (Card, DataTable, etc.) arranged in a grid layout.

**Relevant layout primitives available:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` from `/home/tolga/projects/terp/apps/web/src/components/ui/card.tsx`
- Grid layouts using Tailwind: `grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]` or similar
- `ScrollArea` from `/home/tolga/projects/terp/apps/web/src/components/ui/scroll-area.tsx`

---

## 2. Existing Admin Configuration Pages

All admin pages under `apps/web/src/app/[locale]/(dashboard)/admin/` follow a consistent pattern:

### Standard Page Structure (from booking-types, cost-centers, locations, employment-types, etc.)

```
File: apps/web/src/app/[locale]/(dashboard)/admin/[resource]/page.tsx
```

**Pattern (lines from `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx`):**

1. **'use client'** directive (line 1)
2. **Imports**: React, router, translations, icons, auth, hooks, UI components, domain components, API types (lines 3-17)
3. **Type alias** from generated types: `type CostCenter = components['schemas']['CostCenter']` (line 18)
4. **Auth/role guard** using `useAuth()` + `useHasRole(['admin'])` (lines 22-23)
5. **State management**: search, createOpen, editItem, viewItem, deleteItem (lines 26-30)
6. **Data fetching**: `useCostCenters({ enabled: !authLoading && isAdmin })` (line 32)
7. **Delete mutation**: `useDeleteCostCenter()` (line 33)
8. **Redirect effect** if not admin (lines 36-40)
9. **Client-side filtering** with `useMemo` (lines 42-50)
10. **Event handlers**: handleView, handleEdit, handleDelete, handleConfirmDelete, handleFormSuccess (lines 52-78)
11. **Auth loading skeleton** (lines 82-84)
12. **Layout JSX**:
    - Page header: `<div className="space-y-6">` > title + subtitle + create button
    - Filters bar: SearchInput + optional filters + clear button
    - Item count: `{count} items` / `{count} item`
    - Content Card with DataTable or EmptyState
    - FormSheet (create/edit)
    - DetailSheet (view)
    - ConfirmDialog (delete)

### Header Pattern (consistent across all pages):
```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
    <p className="text-muted-foreground">{t('subtitle')}</p>
  </div>
  <Button onClick={() => setCreateOpen(true)}>
    <Plus className="mr-2 h-4 w-4" />
    {t('newItem')}
  </Button>
</div>
```

### Component Organization Pattern:
Each admin domain has components under `apps/web/src/components/[domain]/`:
- `index.ts` - barrel exports
- `[domain]-data-table.tsx` - table component
- `[domain]-form-sheet.tsx` - create/edit sheet
- `[domain]-detail-sheet.tsx` - detail view sheet

Examples:
- `/home/tolga/projects/terp/apps/web/src/components/cost-centers/` (index.ts, cost-center-data-table.tsx, cost-center-form-sheet.tsx, cost-center-detail-sheet.tsx)
- `/home/tolga/projects/terp/apps/web/src/components/locations/` (index.ts, location-data-table.tsx, location-form-sheet.tsx, location-detail-sheet.tsx)
- `/home/tolga/projects/terp/apps/web/src/components/booking-types/` (index.ts, booking-type-data-table.tsx, booking-type-form-sheet.tsx)

---

## 3. API Hooks Patterns

### Base Hooks

**useApiQuery** - `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`
- Type-safe wrapper around `@tanstack/react-query`'s `useQuery`
- Takes a path string (e.g., `'/contact-types'`) and optional params/path options
- Query key auto-generated as `[path, params, pathParams]`
- Returns standard useQuery result

**useApiMutation** - `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`
- Type-safe wrapper around `useMutation`
- Takes path, method ('post'|'put'|'patch'|'delete'), and options
- Key option: `invalidateKeys` - array of query key arrays to invalidate on success
- Variables: `{ body?, path? }`

### Standard CRUD Hook File Pattern (from `/home/tolga/projects/terp/apps/web/src/hooks/api/use-locations.ts`):

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseLocationsOptions {
  enabled?: boolean
}

// List hook
export function useLocations(options: UseLocationsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/locations', { enabled })
}

// Get by ID hook
export function useLocation(id: string, enabled = true) {
  return useApiQuery('/locations/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Create mutation
export function useCreateLocation() {
  return useApiMutation('/locations', 'post', {
    invalidateKeys: [['/locations']],
  })
}

// Update mutation
export function useUpdateLocation() {
  return useApiMutation('/locations/{id}', 'patch', {
    invalidateKeys: [['/locations']],
  })
}

// Delete mutation
export function useDeleteLocation() {
  return useApiMutation('/locations/{id}', 'delete', {
    invalidateKeys: [['/locations']],
  })
}
```

### Hook Index Pattern (`/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`)
All domain hooks are re-exported from the barrel file with comments for each section. For example (line 136-152):
```ts
// Locations
export {
  useLocations,
  useLocation,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from './use-locations'
```

### With Query Parameters (from `/home/tolga/projects/terp/apps/web/src/hooks/api/use-booking-types.ts`):
```ts
export function useBookingTypes(options: UseBookingTypesOptions = {}) {
  const { active, direction, enabled = true } = options
  return useApiQuery('/booking-types', {
    params: { active, direction },
    enabled,
  })
}
```

### Contact Kinds Special Case - Filtering by parent:
The contact kinds API supports `contact_type_id` as a query parameter for filtering. The hook should support:
```ts
// GET /contact-kinds?contact_type_id={uuid}
```

**No frontend hooks for contact types or contact kinds exist yet.** They need to be created.

---

## 4. Form Dialog Patterns

### Sheet-based Form (Standard Pattern)

Forms use `Sheet` component (not `Dialog`). The standard pattern is from `/home/tolga/projects/terp/apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`:

```tsx
interface CostCenterFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  costCenter?: CostCenter | null   // null = create, object = edit
  onSuccess?: () => void
}
```

**Key patterns (lines 50-243):**
1. `isEdit = !!costCenter` to determine mode
2. `useState<FormState>` for form data
3. `useState<string | null>` for error messages
4. `useEffect` to reset form when dialog opens (lines 64-78)
5. `validateForm()` returns `string[]` errors (lines 80-94)
6. `handleSubmit()` calls create or update mutation (lines 96-132)
7. Error handling catches API errors: `const apiError = err as { detail?: string; message?: string }` (lines 126-131)
8. Sheet layout: SheetContent > SheetHeader > ScrollArea > form fields > SheetFooter (buttons)
9. Code field disabled on edit (`disabled={isSubmitting || isEdit}`) (line 164)
10. Footer with Cancel + Submit buttons, submit shows Loader2 spinner

### 409 Conflict Handling (from `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`, lines 114-131):

```tsx
const handleConfirmDelete = async () => {
  if (!deleteItem) return
  setDeleteError(null)
  try {
    await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
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

### Contact Form Dialog (existing, for employee contacts)

`/home/tolga/projects/terp/apps/web/src/components/profile/contact-form-dialog.tsx` - Uses Sheet (not Dialog), manual state management with `useState<FormData>`, inline validation, create-only (no edit).

---

## 5. Backend API Endpoints

### Contact Types - Full CRUD

**Routes** (`/home/tolga/projects/terp/apps/api/internal/handler/routes.go`, lines 1256-1274):
```
GET    /contact-types          - List (query: ?active=true)
POST   /contact-types          - Create
GET    /contact-types/{id}     - Get by ID
PATCH  /contact-types/{id}     - Update
DELETE /contact-types/{id}     - Delete
```
Permission: `contact_management.manage`

**OpenAPI spec** (`/home/tolga/projects/terp/api/paths/contact-types.yaml`):
- List supports `?active=true` filter
- Create requires: `code` (1-50 chars), `name` (1-255 chars), `data_type` (enum: text|email|phone|url)
- Update allows: `name`, `description`, `is_active`, `sort_order` (code and data_type cannot be changed)
- Delete returns 409 if contact kinds reference it

**Error responses** (`/home/tolga/projects/terp/apps/api/internal/handler/contacttype.go`, lines 185-204):
- 404: Contact type not found
- 400: Code required, name required, invalid data type, data_type required
- 409: Code already exists, in use by contact kinds
- 500: Internal server error

### Contact Kinds - Full CRUD

**Routes** (`/home/tolga/projects/terp/apps/api/internal/handler/routes.go`, lines 1363-1381):
```
GET    /contact-kinds          - List (query: ?contact_type_id=uuid, ?active=true)
POST   /contact-kinds          - Create
GET    /contact-kinds/{id}     - Get by ID
PATCH  /contact-kinds/{id}     - Update
DELETE /contact-kinds/{id}     - Delete
```
Permission: `contact_management.manage`

**OpenAPI spec** (`/home/tolga/projects/terp/api/paths/contact-types.yaml`, lines 127-248):
- List supports `?contact_type_id=uuid` and `?active=true` filters
- Create requires: `contact_type_id` (uuid), `code` (1-50 chars), `label` (1-255 chars)
- Update allows: `label`, `is_active`, `sort_order` (code and contact_type_id cannot be changed)

**Error responses** (`/home/tolga/projects/terp/apps/api/internal/handler/contactkind.go`, lines 203-220):
- 404: Contact kind not found
- 400: Code required, label required, type ID required, type not found
- 409: Code already exists
- 500: Internal server error

### Domain Models (`/home/tolga/projects/terp/apps/api/internal/model/contacttype.go`):

**ContactType** (lines 10-21):
- ID, TenantID, Code, Name, DataType, Description, IsActive, SortOrder, CreatedAt, UpdatedAt

**ContactKind** (lines 28-45):
- ID, TenantID, ContactTypeID, Code, Label, IsActive, SortOrder, CreatedAt, UpdatedAt
- Has relation: `ContactType *ContactType` via `foreignKey:ContactTypeID`

### TypeScript Types (generated, in `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`):

**ContactType schema** (line 9787):
```ts
ContactType: {
  id: string;           // uuid
  tenant_id: string;    // uuid
  code: string;         // e.g. "EMAIL"
  name: string;         // e.g. "Email Address"
  data_type: "text" | "email" | "phone" | "url";
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;  // date-time
  updated_at?: string;  // date-time
}
```

**ContactKind schema** (line 9829):
```ts
ContactKind: {
  id: string;              // uuid
  tenant_id: string;       // uuid
  contact_type_id: string; // uuid
  code: string;            // e.g. "WORK_EMAIL"
  label: string;           // e.g. "Work Email"
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;     // date-time
  updated_at?: string;     // date-time
}
```

**Request schemas:**
- `CreateContactTypeRequest`: { code, name, data_type, description?, sort_order? }
- `UpdateContactTypeRequest`: { name?, description?, is_active?, sort_order? }
- `CreateContactKindRequest`: { contact_type_id, code, label, sort_order? }
- `UpdateContactKindRequest`: { label?, is_active?, sort_order? }

**API operations exist in types.ts** at:
- `listContactTypes` (line 20055) - supports `query.active?: boolean`
- `createContactType` (line 20079)
- `getContactType` (line 20114)
- `deleteContactType` (line 20138)
- `updateContactType` (line 20169)
- `listContactKinds` (line 20193) - supports `query.contact_type_id?: string` and `query.active?: boolean`
- `createContactKind` (line 20224)
- `getContactKind` (line 20259)
- `deleteContactKind` (line 20278)
- `updateContactKind` (line 20303)

---

## 6. Badge Patterns

### Base Badge Component (`/home/tolga/projects/terp/apps/web/src/components/ui/badge.tsx`)
Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`

### Active/Inactive Status Badges

**Team status badge** (`/home/tolga/projects/terp/apps/web/src/components/teams/team-status-badge.tsx`):
```tsx
// Active
<Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
  {t('statusActive')}
</Badge>
// Inactive
<Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
  {t('statusInactive')}
</Badge>
```

**Employee status badge** (`/home/tolga/projects/terp/apps/web/src/components/employees/status-badge.tsx`):
```tsx
// Active
<Badge variant="default" className={cn('bg-green-600 hover:bg-green-600/90', className)}>
// Inactive
<Badge variant="secondary">
// Exited
<Badge variant="destructive">
```

### Category/Role Badges (color-coded)

**Member role badge** (`/home/tolga/projects/terp/apps/web/src/components/teams/member-role-badge.tsx`):
Uses a config map with role-specific colors:
```tsx
const roleConfig: Record<TeamMemberRole, { labelKey: string; className: string }> = {
  lead: { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  deputy: { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  member: { className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}
<Badge variant="secondary" className={config.className}>{t(config.labelKey)}</Badge>
```

### System/Admin Badges (from user-groups page, lines 397-411):
```tsx
{group.is_system && (
  <Badge variant="outline">
    <Lock className="mr-1 h-3 w-3" />
    {t('systemBadge')}
  </Badge>
)}
{group.is_admin && (
  <Badge>
    <ShieldCheck className="mr-1 h-3 w-3" />
    {t('adminBadge')}
  </Badge>
)}
<Badge variant={group.is_active ? 'secondary' : 'outline'}>
  {group.is_active ? t('active') : t('inactive')}
</Badge>
```

**For data type badges** (text/email/phone/url), the member-role-badge pattern with a config map is the best model.

---

## 7. Sidebar Navigation

**Config file**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

### Structure:
```ts
export interface NavItem {
  titleKey: string    // Translation key in 'nav' namespace
  href: string        // Route path
  icon: LucideIcon    // Icon component
  roles?: UserRole[]  // Required roles
}

export interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [...]
```

### Sections (lines 68-293):
1. **`main`** - Dashboard, Team Overview, Time Clock, Timesheet, Absences, Vacation, etc.
2. **`management`** (admin only) - Approvals, Employees, Teams, Departments, Cost Centers, Locations, Employment Types, Day Plans, Week Plans, Tariffs, Holidays, Absence Types, Booking Types, Accounts, Correction Assistant, Evaluations, Monthly Values, Vacation Balances
3. **`administration`** (admin only) - Users, User Groups, Reports, Audit Logs, Settings, Tenants, Payroll Exports, Export Interfaces, Monthly Evaluations

**Contact types would logically fit in the `management` section** alongside other configuration entities like Booking Types, Employment Types, etc.

### Adding a new entry:
```ts
{
  titleKey: 'contactTypes',
  href: '/admin/contact-types',
  icon: SomeIcon,         // e.g. Contact or BookUser from lucide-react
  roles: ['admin'],
},
```

### Translation key needed in `nav` namespace:
The nav section uses `useTranslations('nav')` and maps `section.titleKey` and `item.titleKey` to translated labels.

---

## 8. Translation / i18n Patterns

### Setup
- **Library**: `next-intl`
- **Locales**: `de` (default), `en`
- **Message files**: `/home/tolga/projects/terp/apps/web/messages/en.json` and `de.json`
- **Config**: `/home/tolga/projects/terp/apps/web/src/i18n/routing.ts` (localePrefix: 'as-needed')
- **Loading**: `/home/tolga/projects/terp/apps/web/src/i18n/request.ts` imports from `../../messages/${locale}.json`

### Namespace Convention
Each admin page uses a unique namespace key:
- `adminBookingTypes` (booking types page)
- `adminTariffs` (tariffs page)
- `adminCostCenters` (cost centers page)
- `adminLocations` (locations page)
- `adminEmploymentTypes` (employment types page)
- `adminUserGroups` (user groups page)
- `adminHolidays` (holidays page)
- `adminExportInterfaces` (export interfaces page)
- `adminSettings` (settings page)
- `adminTenants` (tenants page)
- etc.

**Pattern for new page: `adminContactTypes`**

### Usage in Components:
```tsx
const t = useTranslations('adminCostCenters')
const tCommon = useTranslations('common')
// Use:
t('title')           // page title
t('subtitle')        // page subtitle
tCommon('delete')     // common action labels
```

### Standard Translation Key Structure (from `adminCostCenters` at line 2858):
```json
{
  "adminCostCenters": {
    "title": "Cost Centers",
    "subtitle": "Manage cost centers...",
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
    "sectionBasicInfo": "Basic Information",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "codePlaceholder": "e.g. DEV-001",
    "codeHint": "Unique code...",
    "namePlaceholder": "e.g. Development",
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",
    "validationCodeMaxLength": "Code must be at most 50 characters",
    "sectionStatus": "Status",
    "fieldActive": "Active",
    "fieldActiveDescription": "Inactive items are hidden from dropdowns",
    "cancel": "Cancel",
    "close": "Close",
    "saveChanges": "Save Changes",
    "create": "Create",
    "saving": "Saving...",
    "failedCreate": "Failed to create cost center",
    "failedUpdate": "Failed to update cost center",
    "deleteCostCenter": "Delete Cost Center",
    "deleteDescription": "Are you sure you want to delete \"{name}\"?...",
    "emptyTitle": "No cost centers found",
    "emptyFilterHint": "Try adjusting your search",
    "emptyGetStarted": "Get started by creating your first cost center",
    "addCostCenter": "Add Cost Center",
    "countSingular": "{count} cost center",
    "countPlural": "{count} cost centers"
  }
}
```

### Nav Translation Keys (line 54 in en.json):
```json
"nav": {
  "management": "Management",
  "employees": "Employees",
  "bookingTypes": "Booking Types",
  ...
}
```

---

## 9. Delete Confirmation Patterns

### ConfirmDialog Component (`/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`)

**Props interface (lines 15-34):**
```tsx
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string      // default: 'Confirm'
  cancelLabel?: string       // default: 'Cancel'
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

**Implementation**: Uses `Sheet` with `side="bottom"` and `sm:max-w-md sm:mx-auto sm:rounded-t-lg`. When destructive, shows an AlertTriangle icon in a red circle.

### Standard Usage (inline in page, from cost-centers page lines 184-201):
```tsx
<ConfirmDialog
  open={!!deleteItem}
  onOpenChange={(open) => {
    if (!open) setDeleteItem(null)
  }}
  title={t('deleteCostCenter')}
  description={deleteItem ? t('deleteDescription', { name: deleteItem.name }) : ''}
  confirmLabel={t('delete')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

### Extracted Delete Dialog Component (from `/home/tolga/projects/terp/apps/web/src/components/users/user-delete-dialog.tsx`):
```tsx
interface UserDeleteDialogProps {
  user: User | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}
export function UserDeleteDialog({ user, onOpenChange, onSuccess }: UserDeleteDialogProps) {
  // Uses ConfirmDialog internally
}
```

### Delete with 409 Conflict Error (from export-interfaces page lines 114-131):
```tsx
try {
  await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
} catch (err) {
  const apiError = err as { status?: number; detail?: string; message?: string }
  if (apiError.status === 409) {
    setDeleteError(t('deleteInUse'))
  } else {
    setDeleteError(apiError.detail ?? apiError.message ?? t('failedDelete'))
  }
}
```

**This 409 pattern is critical for contact types**, which return 409 when contact kinds reference them.

### Delete Description with Impact Warning
The standard pattern includes contextual warnings in the description:
```json
"deleteDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone. If employees are assigned to this cost center, consider deactivating instead."
```

---

## 10. Skeleton Loading Patterns

### Base Skeleton Component (`/home/tolga/projects/terp/apps/web/src/components/ui/skeleton.tsx`):
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

### Page-Level Skeleton Pattern (from cost-centers page lines 233-254):
```tsx
function CostCentersPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />    {/* Title */}
          <Skeleton className="h-4 w-56" />    {/* Subtitle */}
        </div>
        <Skeleton className="h-10 w-40" />     {/* Create button */}
      </div>
      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />      {/* Search input */}
      </div>
      {/* Content */}
      <Skeleton className="h-96" />            {/* Table area */}
    </div>
  )
}
```

### Grid Skeleton Pattern (from user-groups page lines 621-648):
```tsx
function UserGroupsGridSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="flex h-full flex-col">
          <CardHeader className="border-b">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

### Inline Loading (when data is fetching but page is rendered):
```tsx
{isLoading ? (
  <div className="p-6">
    <Skeleton className="h-96" />
  </div>
) : /* content */}
```

### Full Layout Loading Skeleton (`/home/tolga/projects/terp/apps/web/src/components/layout/loading-skeleton.tsx`):
Used for full-page loading including sidebar simulation. Not typically used in admin pages.

**For two-panel skeleton**: Combine the card skeleton pattern to create left/right panel placeholders matching the two-panel grid layout.

---

## 11. Gaps and Missing Dependencies

### Frontend - Not Yet Created:
1. **API hooks**: No `use-contact-types.ts` or `use-contact-kinds.ts` in `/home/tolga/projects/terp/apps/web/src/hooks/api/`
2. **Page**: No `apps/web/src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`
3. **Components**: No `apps/web/src/components/contact-types/` directory
4. **Sidebar entry**: No "contactTypes" entry in `sidebar-nav-config.ts`
5. **Nav translation**: No `contactTypes` key in the `nav` namespace in messages
6. **Page translations**: No `adminContactTypes` namespace in messages files
7. **Hooks index export**: No contact type/kind exports in `apps/web/src/hooks/api/index.ts`

### Backend - Already Complete:
1. Models: `/home/tolga/projects/terp/apps/api/internal/model/contacttype.go` (ContactType, ContactKind)
2. Repositories: `/home/tolga/projects/terp/apps/api/internal/repository/contacttype.go`, `contactkind.go`
3. Services: `/home/tolga/projects/terp/apps/api/internal/service/contacttype.go`, `contactkind.go`
4. Handlers: `/home/tolga/projects/terp/apps/api/internal/handler/contacttype.go`, `contactkind.go`
5. Routes: Registered in `routes.go` (lines 1256-1274, 1363-1381)
6. Tests: `contacttype_test.go`, `contactkind_test.go`
7. OpenAPI spec: `/home/tolga/projects/terp/api/paths/contact-types.yaml`, `/home/tolga/projects/terp/api/schemas/contact-types.yaml`
8. Generated models: `/home/tolga/projects/terp/apps/api/gen/models/contact_type.go`, `contact_kind.go`, etc.
9. Generated TypeScript types: Present in `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` (paths and operations confirmed)

### Key Implementation Notes:
- **data_type enum**: `"text" | "email" | "phone" | "url"` - badge color config needed per type
- **Contact kind filtering**: API supports `?contact_type_id=uuid` for right-panel data
- **409 handling needed**: Both on create (code exists) and delete (type in use by kinds)
- **Immutable fields**: code and data_type on ContactType; code and contact_type_id on ContactKind
- **sort_order**: Both entities support sort_order for custom ordering
