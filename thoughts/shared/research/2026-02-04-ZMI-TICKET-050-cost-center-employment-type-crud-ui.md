# Research: ZMI-TICKET-050 - Cost Center & Employment Type CRUD UI

## 1. Backend API Endpoints

### 1.1 Cost Center Endpoints

**Handler:** `/home/tolga/projects/terp/apps/api/internal/handler/costcenter.go`
**Routes:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 107-115)

```go
// RegisterCostCenterRoutes registers cost center routes.
func RegisterCostCenterRoutes(r chi.Router, h *CostCenterHandler) {
    r.Route("/cost-centers", func(r chi.Router) {
        r.Get("/", h.List)        // GET /cost-centers?active_only=true
        r.Post("/", h.Create)     // POST /cost-centers
        r.Get("/{id}", h.Get)     // GET /cost-centers/{id}
        r.Patch("/{id}", h.Update) // PATCH /cost-centers/{id}
        r.Delete("/{id}", h.Delete) // DELETE /cost-centers/{id}
    })
}
```

**NOTE:** No authorization middleware on cost center or employment type routes (unlike holidays, users, etc. which use `authz.RequirePermission`).

**Handler methods:**
- `List` - Returns all cost centers for tenant. Supports `?active_only=true` query param.
- `Get` - Returns single cost center by UUID.
- `Create` - Takes `models.CreateCostCenterRequest`, returns 201 with created cost center.
- `Update` - Takes `models.UpdateCostCenterRequest`, returns 200 with updated cost center.
- `Delete` - Returns 204 on success.

**Service:** `/home/tolga/projects/terp/apps/api/internal/service/costcenter.go`
- Error sentinels: `ErrCostCenterNotFound`, `ErrCostCenterCodeRequired`, `ErrCostCenterNameRequired`, `ErrCostCenterCodeExists`
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List`, `ListActive`

### 1.2 Employment Type Endpoints

**Handler:** `/home/tolga/projects/terp/apps/api/internal/handler/employmenttype.go`
**Routes:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 118-126)

```go
// RegisterEmploymentTypeRoutes registers employment type routes.
func RegisterEmploymentTypeRoutes(r chi.Router, h *EmploymentTypeHandler) {
    r.Route("/employment-types", func(r chi.Router) {
        r.Get("/", h.List)        // GET /employment-types?active_only=true
        r.Post("/", h.Create)     // POST /employment-types
        r.Get("/{id}", h.Get)     // GET /employment-types/{id}
        r.Patch("/{id}", h.Update) // PATCH /employment-types/{id}
        r.Delete("/{id}", h.Delete) // DELETE /employment-types/{id}
    })
}
```

**Handler methods:**
- `List` - Returns all employment types for tenant. Supports `?active_only=true`.
- `Get` - Returns single employment type by UUID.
- `Create` - Takes `models.CreateEmploymentTypeRequest`. Default `weekly_hours` = 40.0 if not provided.
- `Update` - Takes `models.UpdateEmploymentTypeRequest`.
- `Delete` - Returns 204 on success.

**Service:** `/home/tolga/projects/terp/apps/api/internal/service/employmenttype.go`
- Error sentinels: `ErrEmploymentTypeNotFound`, `ErrEmploymentTypeCodeRequired`, `ErrEmploymentTypeNameRequired`, `ErrEmploymentTypeCodeExists`

---

## 2. Domain Models

### 2.1 Cost Center Model

**File:** `/home/tolga/projects/terp/apps/api/internal/model/costcenter.go`

```go
type CostCenter struct {
    ID          uuid.UUID `json:"id"`
    TenantID    uuid.UUID `json:"tenant_id"`
    Code        string    `json:"code"`          // varchar(50), required
    Name        string    `json:"name"`          // varchar(255), required
    Description string    `json:"description"`   // text, optional
    IsActive    bool      `json:"is_active"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}
```

### 2.2 Employment Type Model

**File:** `/home/tolga/projects/terp/apps/api/internal/model/employmenttype.go`

```go
type EmploymentType struct {
    ID                  uuid.UUID       `json:"id"`
    TenantID            uuid.UUID       `json:"tenant_id"`
    Code                string          `json:"code"`                  // varchar(50), required
    Name                string          `json:"name"`                  // varchar(255), required
    DefaultWeeklyHours  decimal.Decimal `json:"default_weekly_hours"`  // decimal(5,2), default 40.00
    IsActive            bool            `json:"is_active"`
    VacationCalcGroupID *uuid.UUID      `json:"vacation_calc_group_id,omitempty"`
    CreatedAt           time.Time       `json:"created_at"`
    UpdatedAt           time.Time       `json:"updated_at"`
}
```

---

## 3. OpenAPI Spec & Generated Models

### 3.1 OpenAPI Paths

**Cost Centers:** `/home/tolga/projects/terp/api/paths/cost-centers.yaml`
- `GET /cost-centers` - listCostCenters (query: `active` boolean)
- `POST /cost-centers` - createCostCenter
- `GET /cost-centers/{id}` - getCostCenter
- `PATCH /cost-centers/{id}` - updateCostCenter
- `DELETE /cost-centers/{id}` - deleteCostCenter

**Employment Types:** `/home/tolga/projects/terp/api/paths/employment-types.yaml`
- `GET /employment-types` - listEmploymentTypes (query: `active` boolean)
- `POST /employment-types` - createEmploymentType
- `GET /employment-types/{id}` - getEmploymentType
- `PATCH /employment-types/{id}` - updateEmploymentType
- `DELETE /employment-types/{id}` - deleteEmploymentType

### 3.2 OpenAPI Schemas

**Cost Center schemas:** `/home/tolga/projects/terp/api/schemas/cost-centers.yaml`
- `CostCenter` - id, tenant_id, name, code, description (nullable), is_active, created_at, updated_at
- `CostCenterSummary` - id, name, code
- `CreateCostCenterRequest` - name (required, 1-255), code (required, 1-50), description (optional)
- `UpdateCostCenterRequest` - name (1-255), code (1-50), description, is_active
- `CostCenterList` - { data: CostCenter[] }

**Employment Type schemas:** `/home/tolga/projects/terp/api/schemas/employment-types.yaml`
- `EmploymentType` - id, tenant_id, name, code, description (nullable), default_weekly_hours (decimal), is_active, created_at, updated_at
- `EmploymentTypeSummary` - id, name, code
- `CreateEmploymentTypeRequest` - name (required, 1-255), code (required, 1-20), description, default_weekly_hours (decimal)
- `UpdateEmploymentTypeRequest` - name (1-255), code (1-20), description, default_weekly_hours (decimal), is_active
- `EmploymentTypeList` - { data: EmploymentType[] }

### 3.3 Generated Go Models

Located in `/home/tolga/projects/terp/apps/api/gen/models/`:
- `cost_center.go` - CostCenter struct
- `cost_center_list.go` - CostCenterList struct
- `cost_center_summary.go` - CostCenterSummary struct
- `create_cost_center_request.go` - CreateCostCenterRequest struct (Code*, Name* required, Description optional)
- `update_cost_center_request.go` - UpdateCostCenterRequest struct (all optional)
- `employment_type.go` - EmploymentType struct
- `employment_type_list.go` - EmploymentTypeList struct
- `employment_type_summary.go` - EmploymentTypeSummary struct
- `create_employment_type_request.go` - CreateEmploymentTypeRequest struct (Code*, Name* required)
- `update_employment_type_request.go` - UpdateEmploymentTypeRequest struct (all optional)

### 3.4 TypeScript API Types

**File:** `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` (auto-generated by openapi-typescript)

Available schemas (accessed via `components['schemas']`):
- `CostCenter` - { id, tenant_id, code, name, description, is_active, created_at, updated_at }
- `CostCenterSummary` - { id, name, code }
- `CostCenterList` - { data: CostCenter[] }
- `CreateCostCenterRequest` - { code, name, description? }
- `UpdateCostCenterRequest` - { code?, name?, description?, is_active? }
- `EmploymentType` - { id, tenant_id, code, name, description, default_weekly_hours, is_active, created_at, updated_at }
- `EmploymentTypeSummary` - { id, name, code }
- `EmploymentTypeList` - { data: EmploymentType[] }
- `CreateEmploymentTypeRequest` - { code, name, description?, default_weekly_hours? }
- `UpdateEmploymentTypeRequest` - { code?, name?, description?, default_weekly_hours?, is_active? }

Typed API operations available:
- `listCostCenters`, `createCostCenter`, `getCostCenter`, `updateCostCenter`, `deleteCostCenter`
- `listEmploymentTypes`, `createEmploymentType`, `getEmploymentType`, `updateEmploymentType`, `deleteEmploymentType`

---

## 4. Existing Frontend API Hooks

### 4.1 Cost Center Hooks (QUERY ONLY - need mutation hooks)

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-cost-centers.ts`

```ts
// Only query hooks exist - NO mutation hooks yet
export function useCostCenters(options) {
  return useApiQuery('/cost-centers', { enabled })
}

export function useCostCenter(id: string, enabled = true) {
  return useApiQuery('/cost-centers/{id}', { path: { id }, enabled: enabled && !!id })
}
```

**Missing hooks needed:**
- `useCreateCostCenter` - POST `/cost-centers`
- `useUpdateCostCenter` - PATCH `/cost-centers/{id}`
- `useDeleteCostCenter` - DELETE `/cost-centers/{id}`

### 4.2 Employment Type Hooks (QUERY ONLY - need mutation hooks)

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employment-types.ts`

```ts
// Only query hooks exist - NO mutation hooks yet
export function useEmploymentTypes(options) {
  return useApiQuery('/employment-types', { enabled })
}

export function useEmploymentType(id: string, enabled = true) {
  return useApiQuery('/employment-types/{id}', { path: { id }, enabled: enabled && !!id })
}
```

**Missing hooks needed:**
- `useCreateEmploymentType` - POST `/employment-types`
- `useUpdateEmploymentType` - PATCH `/employment-types/{id}`
- `useDeleteEmploymentType` - DELETE `/employment-types/{id}`

### 4.3 Hooks Index Export

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Current exports (lines 137-140):
```ts
// Cost Centers
export { useCostCenters, useCostCenter } from './use-cost-centers'

// Employment Types
export { useEmploymentTypes, useEmploymentType } from './use-employment-types'
```

Must be updated to also export the new mutation hooks.

---

## 5. Existing Frontend Pages & Components

### 5.1 Employment Types Page - DOES NOT EXIST

The sidebar config references `/admin/employment-types` but NO page file exists at:
`apps/web/src/app/[locale]/(dashboard)/admin/employment-types/page.tsx`

There is also NO components directory at `apps/web/src/components/employment-types/`.

The only reference to employment types in the frontend is in the employee detail page:
```tsx
// apps/web/src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx line 150
<DetailRow label={t('labelEmploymentType')} value={employee.employment_type?.name} />
```

### 5.2 Cost Centers Page - DOES NOT EXIST

No page exists at `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/`.
No components directory at `apps/web/src/components/cost-centers/`.

**Both entities need full page + component implementations from scratch.**

---

## 6. Established Frontend CRUD Patterns

### 6.1 Admin Page Pattern (Reference: holidays, departments, accounts)

**Representative files:**
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/holidays/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/departments/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/admin/accounts/page.tsx`

**Standard page structure:**
```tsx
'use client'

import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { components } from '@/lib/api/types'

type Entity = components['schemas']['Entity']

export default function EntityPage() {
  // Auth guard
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // State: search, filters, dialog open states
  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Entity | null>(null)
  const [viewItem, setViewItem] = React.useState<Entity | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Entity | null>(null)

  // Fetch data
  const { data, isLoading } = useEntities({ enabled: !authLoading && isAdmin })
  const deleteMutation = useDeleteEntity()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/dashboard')
  }, [authLoading, isAdmin, router])

  // Handlers: handleView, handleEdit, handleDelete, handleConfirmDelete, handleFormSuccess

  // Render: Page header + action button, filters bar, content card, form sheet, detail sheet, confirm dialog
  return (
    <div className="space-y-6">
      {/* Page header with title, subtitle, "New" button */}
      {/* Filters bar with SearchInput */}
      {/* Content Card with data table or empty state */}
      {/* FormSheet for create/edit */}
      {/* DetailSheet for viewing */}
      {/* ConfirmDialog for delete */}
    </div>
  )
}
```

### 6.2 Component Directory Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/accounts/`

Standard structure:
```
components/entity-name/
  index.ts              - barrel exports
  entity-data-table.tsx - table with skeleton loader
  entity-form-sheet.tsx - create/edit sheet form
  entity-detail-sheet.tsx - read-only detail view sheet
```

**index.ts pattern:**
```ts
export { EntityDataTable } from './entity-data-table'
export { EntityFormSheet } from './entity-form-sheet'
export { EntityDetailSheet } from './entity-detail-sheet'
```

### 6.3 Data Table Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/departments/department-data-table.tsx`

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Entity = components['schemas']['Entity']

interface EntityDataTableProps {
  items: Entity[]
  isLoading: boolean
  onView: (item: Entity) => void
  onEdit: (item: Entity) => void
  onDelete: (item: Entity) => void
}

// Main table with columns: code, name, status badge, actions dropdown
// Loading state: EntityDataTableSkeleton component
// Actions dropdown: View, Edit, (separator), Delete (destructive variant)
// Rows are clickable (cursor-pointer, onClick -> onView)
// Action cell has onClick stopPropagation
```

### 6.4 Form Sheet Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/accounts/account-form-sheet.tsx`

```tsx
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

interface EntityFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity?: Entity | null     // null = create mode, entity = edit mode
  onSuccess?: () => void
}

// Form state managed with React.useState<FormState>
// useEffect to reset form when open/entity changes
// Validation: collect error messages, display in Alert
// Submit: call createMutation or updateMutation
// Error handling: catch API errors, display in alert
// Layout: SheetContent side="right" with ScrollArea, SheetFooter with Cancel + Submit buttons
// isEdit = !!entity determines title, description, button text
```

### 6.5 Detail Sheet Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/accounts/account-detail-sheet.tsx`

```tsx
interface EntityDetailSheetProps {
  entityId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (entity: Entity) => void
  onDelete: (entity: Entity) => void
}

// Fetches entity by ID when sheet opens
// Loading state: Skeleton placeholders
// Content: Header with icon + name, detail sections with DetailRow component
// Footer: Close button, Edit button, Delete button (destructive)
// DetailRow helper: label (muted) + value (font-medium), flex justify-between
```

### 6.6 Delete Confirmation Pattern

**File:** `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`

Uses the shared `ConfirmDialog` component (bottom sheet):
```tsx
<ConfirmDialog
  open={!!deleteItem}
  onOpenChange={(open) => { if (!open) setDeleteItem(null) }}
  title={t('deleteEntity')}
  description={deleteItem ? t('deleteDescription', { name: deleteItem.name }) : ''}
  confirmLabel={t('delete')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

### 6.7 API Hook Pattern (Mutation)

**Reference:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-holidays.ts`

```ts
import { useApiQuery, useApiMutation } from '@/hooks'

// Create
export function useCreateEntity() {
  return useApiMutation('/entities', 'post', {
    invalidateKeys: [['/entities']],
  })
}

// Update
export function useUpdateEntity() {
  return useApiMutation('/entities/{id}', 'patch', {
    invalidateKeys: [['/entities']],
  })
}

// Delete
export function useDeleteEntity() {
  return useApiMutation('/entities/{id}', 'delete', {
    invalidateKeys: [['/entities']],
  })
}
```

**Core hooks:**
- `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts` - Type-safe GET wrapper around React Query
- `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts` - Type-safe POST/PATCH/DELETE wrapper with `invalidateKeys` for cache invalidation

---

## 7. Navigation & Sidebar Configuration

### 7.1 Sidebar Nav Config

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Employment types is ALREADY in the sidebar (line 139-143):
```ts
{
  titleKey: 'employmentTypes',
  href: '/admin/employment-types',
  icon: Briefcase,
  roles: ['admin'],
},
```

Cost centers is NOT in the sidebar yet. Needs to be added to the `management` section. Suggested position: near employment types or departments. Use an appropriate icon (e.g., `Landmark`, `Banknote`, `Building`, or `DollarSign` from lucide-react).

### 7.2 Breadcrumbs Config

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/breadcrumbs.tsx`

Employment types is ALREADY mapped (line 29):
```ts
'employment-types': 'employmentTypes',
```

Cost centers is NOT mapped yet. Need to add:
```ts
'cost-centers': 'costCenters',
```

### 7.3 Nav Translation Keys

**File:** `/home/tolga/projects/terp/apps/web/messages/en.json` (nav section, line 54-91)

Employment types nav key ALREADY exists (line 69):
```json
"employmentTypes": "Employment Types"
```

Need to add `costCenters` nav key:
```json
"costCenters": "Cost Centers"
```

### 7.4 Breadcrumb Translation Keys

**File:** `/home/tolga/projects/terp/apps/web/messages/en.json` (breadcrumbs section, line 149-188)

Employment types breadcrumb ALREADY exists (line 160):
```json
"employmentTypes": "Employment Types"
```

Need to add `costCenters` breadcrumb key:
```json
"costCenters": "Cost Centers"
```

---

## 8. Translation/i18n Pattern

### 8.1 Namespace Pattern

Each admin page uses its own translation namespace. Convention is `admin` + PascalCase entity name.

Examples:
- `adminHolidays` - holidays page translations
- `adminDepartments` - departments page translations
- `adminAccounts` - accounts page translations

**For this ticket:**
- `adminCostCenters` - cost centers page translations
- `adminEmploymentTypes` - employment types page translations

### 8.2 Translation Key Pattern

**File:** `/home/tolga/projects/terp/apps/web/messages/en.json`

Standard keys per admin page namespace (based on holidays/accounts pattern):

```json
{
  "adminCostCenters": {
    "title": "Cost Centers",
    "subtitle": "Manage cost centers for time and cost allocation",
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
    "costCenterDetails": "Cost Center Details",
    "viewCostCenterInfo": "View cost center information.",

    "fieldCode": "Code",
    "fieldName": "Name",
    "fieldDescription": "Description",

    "codePlaceholder": "e.g. DEV-001",
    "namePlaceholder": "e.g. Development",
    "descriptionPlaceholder": "Optional description...",

    "validationCodeRequired": "Code is required",
    "validationNameRequired": "Name is required",

    "cancel": "Cancel",
    "close": "Close",
    "saveChanges": "Save Changes",
    "create": "Create",
    "saving": "Saving...",

    "failedCreate": "Failed to create cost center",
    "failedUpdate": "Failed to update cost center",

    "deleteCostCenter": "Delete Cost Center",
    "deleteDescription": "Are you sure you want to delete \"{name}\"? This action cannot be undone.",

    "emptyTitle": "No cost centers found",
    "emptyFilterHint": "Try adjusting your search",
    "emptyGetStarted": "Get started by creating your first cost center",
    "addCostCenter": "Add Cost Center",

    "sectionBasicInfo": "Basic Information",
    "sectionStatus": "Status",
    "detailsSection": "Details",
    "timestampsSection": "Timestamps",
    "labelCreated": "Created",
    "labelLastUpdated": "Last Updated",

    "fieldActive": "Active",
    "fieldActiveDescription": "Inactive cost centers are hidden from dropdowns",

    "countSingular": "{count} cost center",
    "countPlural": "{count} cost centers"
  }
}
```

### 8.3 Translation Files

Two translation files to update:
- `/home/tolga/projects/terp/apps/web/messages/en.json` (English)
- `/home/tolga/projects/terp/apps/web/messages/de.json` (German)

---

## 9. Files to Create

### 9.1 Cost Centers (new page + components)

| File | Purpose |
|------|---------|
| `apps/web/src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` | Admin page |
| `apps/web/src/components/cost-centers/index.ts` | Barrel exports |
| `apps/web/src/components/cost-centers/cost-center-data-table.tsx` | Data table + skeleton |
| `apps/web/src/components/cost-centers/cost-center-form-sheet.tsx` | Create/edit form |
| `apps/web/src/components/cost-centers/cost-center-detail-sheet.tsx` | Detail view |

### 9.2 Employment Types (new page + components)

| File | Purpose |
|------|---------|
| `apps/web/src/app/[locale]/(dashboard)/admin/employment-types/page.tsx` | Admin page |
| `apps/web/src/components/employment-types/index.ts` | Barrel exports |
| `apps/web/src/components/employment-types/employment-type-data-table.tsx` | Data table + skeleton |
| `apps/web/src/components/employment-types/employment-type-form-sheet.tsx` | Create/edit form |
| `apps/web/src/components/employment-types/employment-type-detail-sheet.tsx` | Detail view |

## 10. Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/hooks/api/use-cost-centers.ts` | Add `useCreateCostCenter`, `useUpdateCostCenter`, `useDeleteCostCenter` |
| `apps/web/src/hooks/api/use-employment-types.ts` | Add `useCreateEmploymentType`, `useUpdateEmploymentType`, `useDeleteEmploymentType` |
| `apps/web/src/hooks/api/index.ts` | Export new mutation hooks |
| `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` | Add cost centers nav item |
| `apps/web/src/components/layout/breadcrumbs.tsx` | Add `'cost-centers': 'costCenters'` mapping |
| `apps/web/messages/en.json` | Add `adminCostCenters`, `adminEmploymentTypes` namespaces + nav/breadcrumb keys |
| `apps/web/messages/de.json` | Add German translations for same namespaces |

---

## 11. Key Differences Between Cost Centers and Employment Types

| Aspect | Cost Center | Employment Type |
|--------|-------------|-----------------|
| Fields | code, name, description, is_active | code, name, default_weekly_hours, is_active |
| Code max length | 50 chars | 20 chars |
| Extra field | description (text) | default_weekly_hours (decimal, default 40.0) |
| Icon suggestion | `Landmark` or `Building` | `Briefcase` (already used in sidebar) |
| Sidebar | NOT in sidebar yet | ALREADY in sidebar |
| Breadcrumb | NOT mapped yet | ALREADY mapped |
| Nav translation | NOT added yet | ALREADY exists |
| API hooks (query) | Exist (query only) | Exist (query only) |
| API hooks (mutation) | Need to create | Need to create |
| Page | Does not exist | Does not exist |
| Components | Do not exist | Do not exist |

---

## 12. Implementation Order

1. **Add mutation hooks** for both entities (use-cost-centers.ts, use-employment-types.ts)
2. **Update hooks index** to export new hooks
3. **Create cost center components** (data-table, form-sheet, detail-sheet, index)
4. **Create cost center page** at `admin/cost-centers/page.tsx`
5. **Create employment type components** (data-table, form-sheet, detail-sheet, index)
6. **Create employment type page** at `admin/employment-types/page.tsx`
7. **Add cost center to sidebar nav config** (employment types already present)
8. **Add cost-centers to breadcrumbs config** (employment-types already present)
9. **Add translations** for both entities in en.json and de.json
