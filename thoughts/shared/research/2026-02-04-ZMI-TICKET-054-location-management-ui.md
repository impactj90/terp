# Research: ZMI-TICKET-054 - Location Management UI

## Summary

This document captures all codebase patterns and existing infrastructure needed to implement a standard CRUD admin page for managing work locations. The backend API is fully implemented. No frontend code for locations exists yet.

---

## 1. Existing CRUD Page Pattern (Reference: Cost Centers)

The cost-centers page is the closest pattern match for locations -- both are simple entity CRUD with code, name, description, active status. The holidays page is more complex with calendar views and year selectors.

### Files Involved (Cost Centers)

| Purpose | File Path |
|---------|-----------|
| Page | `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` |
| Data Table | `apps/web/src/components/cost-centers/cost-center-data-table.tsx` |
| Form Sheet | `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx` |
| Detail Sheet | `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx` |
| Barrel Export | `apps/web/src/components/cost-centers/index.ts` |
| API Hooks | `apps/web/src/hooks/api/use-cost-centers.ts` |
| Hook Exports | `apps/web/src/hooks/api/index.ts` |
| EN Translations | `apps/web/messages/en.json` (namespace `adminCostCenters`) |
| DE Translations | `apps/web/messages/de.json` (namespace `adminCostCenters`) |

### Page Structure Pattern

```tsx
// apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx
'use client'

export default function CostCentersPage() {
  // 1. Auth and role check
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminCostCenters')

  // 2. State: search, create/edit/view/delete dialogs
  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<CostCenter | null>(null)
  const [viewItem, setViewItem] = React.useState<CostCenter | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<CostCenter | null>(null)

  // 3. Data fetching with conditional enabled
  const { data, isLoading } = useCostCenters({ enabled: !authLoading && isAdmin })
  const deleteMutation = useDeleteCostCenter()
  const items = data?.data ?? []

  // 4. Auth redirect
  React.useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/dashboard')
  }, [authLoading, isAdmin, router])

  // 5. Client-side search filter
  const filteredItems = React.useMemo(() => { ... }, [items, search])

  // 6. Handlers: handleView, handleEdit, handleDelete, handleConfirmDelete, handleFormSuccess

  // 7. Render: skeleton while auth loading, null if not admin, then main layout:
  //    - Page header (title, subtitle, "New" button)
  //    - Search bar with clear filters
  //    - Item count text
  //    - Card containing DataTable or EmptyState
  //    - FormSheet (create/edit)
  //    - DetailSheet (view)
  //    - ConfirmDialog (delete)
}
```

---

## 2. Navigation / Sidebar Configuration

**File**: `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

### Structure

```ts
export interface NavItem {
  titleKey: string    // Translation key in 'nav' namespace
  href: string        // Route path
  icon: LucideIcon    // Lucide icon component
  roles?: UserRole[]  // Required roles
}

export interface NavSection {
  titleKey: string
  roles?: UserRole[]
  items: NavItem[]
}

export const navConfig: NavSection[] = [
  { titleKey: 'main', items: [...] },
  { titleKey: 'management', roles: ['admin'], items: [...] },
  { titleKey: 'administration', roles: ['admin'], items: [...] },
]
```

### Where to Add Locations

Locations should go in the `management` section (index 1). The ticket specifies using `MapPin` icon from lucide-react. Add after a logical position (e.g., after `costCenters` or `employmentTypes`):

```ts
{
  titleKey: 'locations',
  href: '/admin/locations',
  icon: MapPin,
  roles: ['admin'],
},
```

### Translation Key Needed

Add `"locations": "Locations"` to the `nav` namespace in both `en.json` and `de.json`.

---

## 3. Breadcrumb Configuration

**File**: `apps/web/src/components/layout/breadcrumbs.tsx`

### segmentToKey Mapping

```ts
const segmentToKey: Record<string, string> = {
  dashboard: 'dashboard',
  'cost-centers': 'costCenters',
  holidays: 'holidays',
  // ... etc
}
```

### What to Add

```ts
locations: 'locations',
```

### Translation Key Needed

Add `"locations": "Locations"` to the `breadcrumbs` namespace in both `en.json` and `de.json`.

---

## 4. Translation Setup

**Files**:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`

### How It Works

- Translations loaded via `next-intl` in `apps/web/src/i18n/request.ts`
- Single JSON file per locale containing all namespaces as top-level keys
- Components use `const t = useTranslations('namespaceName')`
- Convention for admin CRUD pages: namespace pattern is `admin<EntityPluralPascal>`

### Translation Namespace Pattern (from cost-centers)

The `adminCostCenters` namespace has these key groups:

```json
{
  "adminCostCenters": {
    // Page level
    "title": "Cost Centers",
    "subtitle": "Manage cost centers for time and cost allocation",
    "newCostCenter": "New Cost Center",
    "searchPlaceholder": "Search cost centers...",
    "clearFilters": "Clear filters",

    // Table columns
    "columnCode": "Code",
    "columnName": "Name",
    "columnDescription": "Description",
    "columnStatus": "Status",
    "columnActions": "Actions",

    // Status badges
    "statusActive": "Active",
    "statusInactive": "Inactive",

    // Actions
    "viewDetails": "View Details",
    "edit": "Edit",
    "delete": "Delete",

    // Form sheet
    "editCostCenter": "Edit Cost Center",
    "createDescription": "Add a new cost center.",
    "editDescription": "Modify cost center details.",
    "sectionBasicInfo": "Basic Information",
    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",
    "codePlaceholder": "e.g. DEV-001",
    "codeHint": "Unique code (uppercase, max 50 chars)",
    "namePlaceholder": "e.g. Development",
    "descriptionPlaceholder": "Optional description...",

    // Validation
    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",
    "validationCodeMaxLength": "Code must be at most 50 characters",

    // Status section (edit only)
    "sectionStatus": "Status",
    "fieldActive": "Active",
    "fieldActiveDescription": "Inactive cost centers are hidden from dropdowns",

    // Form buttons
    "cancel": "Cancel",
    "close": "Close",
    "saveChanges": "Save Changes",
    "create": "Create",
    "saving": "Saving...",
    "failedCreate": "Failed to create cost center",
    "failedUpdate": "Failed to update cost center",

    // Delete dialog
    "deleteCostCenter": "Delete Cost Center",
    "deleteDescription": "Are you sure you want to delete \"{name}\"? ...",

    // Detail sheet
    "costCenterDetails": "Cost Center Details",
    "viewCostCenterInfo": "View cost center information.",
    "detailsSection": "Details",
    "timestampsSection": "Timestamps",
    "labelCreated": "Created",
    "labelLastUpdated": "Last Updated",

    // Empty state
    "emptyTitle": "No cost centers found",
    "emptyFilterHint": "Try adjusting your search",
    "emptyGetStarted": "Get started by creating your first cost center",
    "addCostCenter": "Add Cost Center",

    // Count
    "countSingular": "{count} cost center",
    "countPlural": "{count} cost centers"
  }
}
```

### For Locations

The namespace should be `adminLocations`. It will need additional keys beyond the cost-center pattern for location-specific fields: `fieldAddress`, `fieldCity`, `fieldCountry`, `fieldTimezone`, etc.

---

## 5. API Hook Patterns

**Base hooks**: `apps/web/src/hooks/use-api-query.ts` and `apps/web/src/hooks/use-api-mutation.ts`

### useApiQuery

```ts
function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: { params?: QueryParams; path?: PathParams; enabled?: boolean; ... }
)
// Query key is automatically [path, params, pathParams]
```

### useApiMutation

```ts
function useApiMutation<Path, Method>(
  path: Path,
  method: 'post' | 'put' | 'patch' | 'delete',
  options?: { invalidateKeys?: unknown[][]; onSuccess?: (...) => void; ... }
)
```

### CRUD Hook Pattern (from use-cost-centers.ts)

```ts
// apps/web/src/hooks/api/use-cost-centers.ts
import { useApiQuery, useApiMutation } from '@/hooks'

// List (with optional filter params)
export function useCostCenters(options: { enabled?: boolean } = {}) {
  return useApiQuery('/cost-centers', { enabled: options.enabled })
}

// Get single by ID
export function useCostCenter(id: string, enabled = true) {
  return useApiQuery('/cost-centers/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

// Create (POST)
export function useCreateCostCenter() {
  return useApiMutation('/cost-centers', 'post', {
    invalidateKeys: [['/cost-centers']],
  })
}

// Update (PATCH)
export function useUpdateCostCenter() {
  return useApiMutation('/cost-centers/{id}', 'patch', {
    invalidateKeys: [['/cost-centers']],
  })
}

// Delete
export function useDeleteCostCenter() {
  return useApiMutation('/cost-centers/{id}', 'delete', {
    invalidateKeys: [['/cost-centers']],
  })
}
```

### For Locations

The API paths exist in the generated types:
- `GET /locations` - listLocations (query param: `active?: boolean`)
- `GET /locations/{id}` - getLocation
- `POST /locations` - createLocation
- `PATCH /locations/{id}` - updateLocation
- `DELETE /locations/{id}` - deleteLocation

Hook file: `apps/web/src/hooks/api/use-locations.ts`

Exports to add to `apps/web/src/hooks/api/index.ts`:
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

---

## 6. Data Table Pattern

**Reference**: `apps/web/src/components/cost-centers/cost-center-data-table.tsx`

### Structure

```tsx
interface Props {
  items: Entity[]
  isLoading: boolean
  onView: (item: Entity) => void
  onEdit: (item: Entity) => void
  onDelete: (item: Entity) => void
}

export function EntityDataTable({ items, isLoading, onView, onEdit, onDelete }: Props) {
  const t = useTranslations('adminEntity')

  if (isLoading) return <EntityDataTableSkeleton />
  if (items.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          {/* ... more columns ... */}
          <TableHead className="w-16"><span className="sr-only">{t('columnActions')}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="cursor-pointer" onClick={() => onView(item)}>
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="font-medium">{item.name}</span>
              </div>
            </TableCell>
            {/* ... more cells ... */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                {/* View, Edit, Delete actions */}
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Key Components Used

- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `@/components/ui/table`
- `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- `Badge` from `@/components/ui/badge`
- `Button` with `variant="ghost" size="icon-sm"` for action trigger
- Row click opens detail sheet; action column has `onClick={(e) => e.stopPropagation()}`

### For Locations

Columns needed:
- Code (mono font, w-24)
- Name (with MapPin icon)
- City (or Address)
- Timezone
- Status badge (Active/Inactive)
- Actions dropdown

---

## 7. Form Sheet Pattern

**Reference**: `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx`

### Structure

```tsx
interface FormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: Entity | null    // null = create mode, entity = edit mode
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  // ... entity-specific fields
  isActive: boolean
}

const INITIAL_STATE: FormState = { code: '', name: '', isActive: true }

export function EntityFormSheet({ open, onOpenChange, entity, onSuccess }: FormSheetProps) {
  const isEdit = !!entity
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateEntity()
  const updateMutation = useUpdateEntity()

  // Reset form on open/close
  React.useEffect(() => {
    if (open) {
      if (entity) {
        setForm({ /* populate from entity */ })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, entity])

  const handleSubmit = async () => {
    // 1. Client-side validation
    // 2. Call create or update mutation
    // 3. On success: onSuccess?.()
    // 4. On error: setError(apiError.detail ?? apiError.message ?? t('failedCreate/Update'))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>...</SheetHeader>
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Sections with h3 headers */}
            {/* Input fields with Label */}
            {/* Status toggle (edit only) */}
            {/* Error alert */}
          </div>
        </ScrollArea>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" ... className="flex-1">Cancel</Button>
          <Button ... className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Key Patterns

- Code field is disabled during edit mode (`disabled={isSubmitting || isEdit}`)
- Code field converts to uppercase on input
- Active status toggle only shown in edit mode
- Error handling catches API errors with `detail` or `message` fields
- 409 conflict for duplicate code returns error message from API

### For Locations

Form fields needed:
- Code (text input, uppercase, max 20 chars, disabled in edit)
- Name (text input, max 255 chars)
- Description (textarea, optional)
- Address (text input, optional)
- City (text input, optional)
- Country (text input, optional)
- Timezone (select or text input, optional, e.g. "Europe/Berlin")
- Active status (switch, edit only)

---

## 8. Detail Sheet Pattern

**Reference**: `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx`

### Structure

```tsx
interface DetailSheetProps {
  entityId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (entity: Entity) => void
  onDelete: (entity: Entity) => void
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function EntityDetailSheet({ entityId, open, onOpenChange, onEdit, onDelete }: DetailSheetProps) {
  const { data: entity, isLoading } = useEntity(entityId || '', open && !!entityId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>...</SheetHeader>
        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton ... /> {/* Multiple skeleton lines */}
          </div>
        ) : entity ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            {/* Header with icon and status badge */}
            {/* Details section with DetailRow components */}
            {/* Timestamps section */}
          </ScrollArea>
        ) : null}
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" ... className="flex-1">Close</Button>
          {entity && (
            <>
              <Button variant="outline" onClick={() => onEdit(entity)}>Edit</Button>
              <Button variant="destructive" onClick={() => onDelete(entity)}>Delete</Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### For Locations

Detail sections:
- Header: icon (MapPin), name, code, active badge
- Location Information: code, name, description
- Address section: address, city, country
- Configuration: timezone
- Timestamps: created_at, updated_at

---

## 9. Delete Dialog Pattern

**File**: `apps/web/src/components/ui/confirm-dialog.tsx`

### Usage in Pages

```tsx
<ConfirmDialog
  open={!!deleteItem}
  onOpenChange={(open) => {
    if (!open) setDeleteItem(null)
  }}
  title={t('deleteLocation')}
  description={deleteItem ? t('deleteDescription', { name: deleteItem.name }) : ''}
  confirmLabel={t('delete')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

The `ConfirmDialog` is a reusable component using Sheet with `side="bottom"`. It accepts:
- `open`, `onOpenChange` - dialog state
- `title`, `description` - content
- `confirmLabel`, `cancelLabel` - button text
- `variant` - 'default' | 'destructive'
- `isLoading` - shows spinner on confirm button
- `onConfirm` - async handler

No need to create a custom delete dialog -- use the shared `ConfirmDialog` component.

---

## 10. Backend API (Fully Implemented)

### API Spec

**File**: `api/paths/locations.yaml`

Endpoints:
- `GET /locations` - List locations (query: `active` boolean filter)
- `POST /locations` - Create location (returns 201, 409 on code conflict)
- `GET /locations/{id}` - Get location by ID
- `PATCH /locations/{id}` - Update location
- `DELETE /locations/{id}` - Delete location (returns 204)

### Schema

**File**: `api/schemas/locations.yaml`

```yaml
Location:
  properties:
    id: uuid
    tenant_id: uuid
    name: string (required)
    code: string (required)
    description: string (nullable)
    address: string (nullable)
    city: string (nullable)
    country: string (nullable)
    timezone: string (e.g. "Europe/Berlin")
    is_active: boolean
    created_at: date-time
    updated_at: date-time

CreateLocationRequest:
  required: [name, code]
  properties:
    name: string (1-255 chars)
    code: string (1-20 chars)
    description, address, city, country, timezone: optional strings

UpdateLocationRequest:
  all optional: name, code, description, address, city, country, timezone, is_active
```

### Generated TypeScript Types

**File**: `apps/web/src/lib/api/types.ts`

```ts
Location: {
  id: string;           // uuid
  tenant_id: string;    // uuid
  name: string;
  code: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string;
  is_active?: boolean;
  created_at?: string;  // date-time
  updated_at?: string;  // date-time
}

CreateLocationRequest: {
  name: string;
  code: string;
  description?: string;
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
}

UpdateLocationRequest: {
  name?: string;
  code?: string;
  description?: string;
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  is_active?: boolean;
}

LocationList: {
  data: Location[];
}
```

### Backend Handler

**File**: `apps/api/internal/handler/location.go`

- Routes registered via `RegisterLocationRoutes` in `apps/api/internal/handler/routes.go` (line 1648)
- Handler wired in `apps/api/cmd/server/main.go` (line 218-220, 568)
- 409 conflict on duplicate code in both Create and Update
- Permission: `locations.manage`

### Domain Model

**File**: `apps/api/internal/model/location.go`

```go
type Location struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string    // varchar(20)
    Name        string    // varchar(255)
    Description string    // text
    Address     string    // text
    City        string    // varchar(255)
    Country     string    // varchar(100)
    Timezone    string    // varchar(100)
    IsActive    bool
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

---

## 11. Skeleton / Loading Pattern

### Page-Level Skeleton

Defined as a local function within the page file:

```tsx
function LocationsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
      </div>
      {/* Content */}
      <Skeleton className="h-96" />
    </div>
  )
}
```

### Table-Level Skeleton

Defined as a local function within the data-table component:

```tsx
function DataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {/* Skeleton header cells matching column widths */}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {/* Skeleton cells matching column content patterns */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Detail Sheet Skeleton

Inline within the detail sheet:

```tsx
{isLoading ? (
  <div className="flex-1 space-y-4 py-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-1/2" />
  </div>
) : /* ... */ }
```

---

## 12. Files to Create

| # | File Path | Description |
|---|-----------|-------------|
| 1 | `apps/web/src/hooks/api/use-locations.ts` | API hooks: useLocations, useLocation, useCreateLocation, useUpdateLocation, useDeleteLocation |
| 2 | `apps/web/src/components/locations/location-data-table.tsx` | Data table component with skeleton |
| 3 | `apps/web/src/components/locations/location-form-sheet.tsx` | Create/edit form sheet |
| 4 | `apps/web/src/components/locations/location-detail-sheet.tsx` | Detail view sheet |
| 5 | `apps/web/src/components/locations/index.ts` | Barrel export |
| 6 | `apps/web/src/app/[locale]/(dashboard)/admin/locations/page.tsx` | Page component with skeleton and empty state |

## 13. Files to Modify

| # | File Path | Change |
|---|-----------|--------|
| 1 | `apps/web/src/hooks/api/index.ts` | Add location hook exports |
| 2 | `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add locations nav item to management section with MapPin icon |
| 3 | `apps/web/src/components/layout/breadcrumbs.tsx` | Add `locations: 'locations'` to segmentToKey |
| 4 | `apps/web/messages/en.json` | Add `nav.locations`, `breadcrumbs.locations`, and `adminLocations` namespace |
| 5 | `apps/web/messages/de.json` | Add `nav.locations`, `breadcrumbs.locations`, and `adminLocations` namespace |

---

## 14. Key Implementation Notes

1. **Type import pattern**: `type Location = components['schemas']['Location']` from `@/lib/api/types`
2. **Code field**: Uppercase conversion on input, disabled in edit mode, max 20 chars
3. **409 handling**: Backend returns 409 when code already exists. The form sheet catches this via `apiError.detail` and displays the error message.
4. **Active filter**: The `GET /locations` endpoint supports `active` query param. The `useLocations` hook should accept this as an option.
5. **Timezone field**: Consider using a Select with common timezones or a text input. The backend accepts any string.
6. **Translation namespace**: Use `adminLocations` (not `locations`) to be consistent with the pattern `admin<Entity>`.
7. **Empty state icon**: Use `MapPin` from lucide-react, matching the sidebar icon.
8. **Data extraction**: List endpoint returns `{ data: Location[] }`, so access via `data?.data ?? []`.
