# Implementation Plan: NOK-232 - Build Absence Type Configuration

**Date:** 2026-01-26
**Ticket:** NOK-232
**Status:** Ready for Implementation

## Overview

Build an admin page for managing absence types. The backend model and repository already exist. The backend handler needs CRUD operations (currently only ListTypes exists). The frontend needs a new admin page with data table, form sheet, and detail sheet following existing patterns.

## Prerequisites

- [x] AbsenceType model exists (`apps/api/internal/model/absencetype.go`)
- [x] AbsenceType repository exists (`apps/api/internal/repository/absencetype.go`)
- [x] OpenAPI spec defines endpoints (`api/paths/absence-types.yaml`)
- [x] Generated models exist (`apps/api/gen/models/absence_type*.go`)
- [x] Basic hook `useAbsenceTypes` exists (`apps/web/src/hooks/api/use-absences.ts`)

## Phase 1: Backend - Add Absence Type CRUD Handler Methods

**Goal:** Implement Create, GetByID, Update, Delete handlers for absence types.

### 1.1 Add Service Methods

**File:** `/home/tolga/projects/terp/apps/api/internal/service/absence.go`

Add to AbsenceService:
```go
// GetTypeByID retrieves an absence type by ID.
func (s *AbsenceService) GetTypeByID(ctx context.Context, tenantID, id uuid.UUID) (*model.AbsenceType, error)

// CreateType creates a new tenant-specific absence type.
func (s *AbsenceService) CreateType(ctx context.Context, at *model.AbsenceType) (*model.AbsenceType, error)

// UpdateType updates an existing absence type (cannot update system types).
func (s *AbsenceService) UpdateType(ctx context.Context, at *model.AbsenceType) (*model.AbsenceType, error)

// DeleteType deletes an absence type (cannot delete system types).
func (s *AbsenceService) DeleteType(ctx context.Context, tenantID, id uuid.UUID) error
```

Define errors:
```go
var (
    ErrAbsenceTypeNotFound   = errors.New("absence type not found")
    ErrCannotModifySystem    = errors.New("cannot modify system absence type")
    ErrAbsenceCodeExists     = errors.New("absence type code already exists")
)
```

Update interface `absenceTypeRepositoryForService`:
```go
type absenceTypeRepositoryForService interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error)
    List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
    Create(ctx context.Context, at *model.AbsenceType) error
    Update(ctx context.Context, at *model.AbsenceType) error
    Delete(ctx context.Context, id uuid.UUID) error
    Upsert(ctx context.Context, at *model.AbsenceType) error
}
```

### 1.2 Add Handler Methods

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/absence.go`

Add methods:
- `CreateType(w http.ResponseWriter, r *http.Request)` - POST /absence-types
- `GetType(w http.ResponseWriter, r *http.Request)` - GET /absence-types/{id}
- `UpdateType(w http.ResponseWriter, r *http.Request)` - PATCH /absence-types/{id}
- `DeleteType(w http.ResponseWriter, r *http.Request)` - DELETE /absence-types/{id}

Add conversion functions:
- `requestToAbsenceType(req *models.CreateAbsenceTypeRequest, tenantID uuid.UUID) *model.AbsenceType`
- `mapAPICategory(apiCategory string) model.AbsenceCategory` - reverse of mapAbsenceCategory

Handle category mapping (API to internal):
- `"vacation"` -> `model.AbsenceCategoryVacation`
- `"sick"` -> `model.AbsenceCategoryIllness`
- `"personal"` -> `model.AbsenceCategorySpecial`
- `"unpaid"` -> `model.AbsenceCategoryUnpaid`

### 1.3 Register Routes

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

Update `RegisterAbsenceRoutes`:
```go
func RegisterAbsenceRoutes(r chi.Router, h *AbsenceHandler) {
    // Absence types CRUD
    r.Route("/absence-types", func(r chi.Router) {
        r.Get("/", h.ListTypes)
        r.Post("/", h.CreateType)
        r.Get("/{id}", h.GetType)
        r.Patch("/{id}", h.UpdateType)
        r.Delete("/{id}", h.DeleteType)
    })

    // Employee absences (nested under employees)
    r.Get("/employees/{id}/absences", h.ListByEmployee)
    r.Post("/employees/{id}/absences", h.CreateRange)

    // Absence CRUD
    r.Delete("/absences/{id}", h.Delete)
}
```

### Verification Phase 1

```bash
cd /home/tolga/projects/terp && make test
```

Test via curl:
```bash
# List absence types
curl -X GET http://localhost:8080/absence-types -H "X-Tenant-ID: <tenant-id>"

# Create absence type
curl -X POST http://localhost:8080/absence-types \
  -H "X-Tenant-ID: <tenant-id>" \
  -H "Content-Type: application/json" \
  -d '{"code":"X1","name":"Custom Leave","category":"vacation","color":"#FF6600"}'

# Get absence type
curl -X GET http://localhost:8080/absence-types/<id> -H "X-Tenant-ID: <tenant-id>"

# Update absence type
curl -X PATCH http://localhost:8080/absence-types/<id> \
  -H "X-Tenant-ID: <tenant-id>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'

# Delete absence type (only tenant-specific, not system)
curl -X DELETE http://localhost:8080/absence-types/<id> -H "X-Tenant-ID: <tenant-id>"
```

---

## Phase 2: Frontend - Add Mutation Hooks

**Goal:** Add React Query mutation hooks for create, update, delete operations.

### 2.1 Add Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absences.ts`

Add after existing query hooks:
```tsx
/**
 * Hook to create a new absence type.
 */
export function useCreateAbsenceType() {
  return useApiMutation('/absence-types', 'post', {
    invalidateKeys: [['/absence-types']],
  })
}

/**
 * Hook to update an absence type.
 */
export function useUpdateAbsenceType() {
  return useApiMutation('/absence-types/{id}', 'patch', {
    invalidateKeys: [['/absence-types']],
  })
}

/**
 * Hook to delete an absence type.
 */
export function useDeleteAbsenceType() {
  return useApiMutation('/absence-types/{id}', 'delete', {
    invalidateKeys: [['/absence-types']],
  })
}
```

### 2.2 Update Exports

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

Verify exports include the new hooks (if not re-exported automatically).

### Verification Phase 2

- Build frontend: `cd /home/tolga/projects/terp/apps/web && pnpm build`
- Check TypeScript types are correct

---

## Phase 3: Frontend - Create Absence Type Components

**Goal:** Create data table, form sheet, and detail sheet components.

### 3.1 Create Component Directory

**Directory:** `/home/tolga/projects/terp/apps/web/src/components/absence-types/`

Create files:
- `index.ts` - Exports
- `absence-type-data-table.tsx` - Data table
- `absence-type-form-sheet.tsx` - Create/Edit form
- `absence-type-detail-sheet.tsx` - Detail view

### 3.2 Data Table Component

**File:** `absence-type-data-table.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-data-table.tsx`

Structure:
```tsx
interface AbsenceTypeDataTableProps {
  absenceTypes: AbsenceType[]
  isLoading: boolean
  onView: (type: AbsenceType) => void
  onEdit: (type: AbsenceType) => void
  onDelete: (type: AbsenceType) => void
}
```

Columns:
- Color indicator (small colored circle)
- Code
- Name
- Category (with badge)
- Portion (Full/Half/None indicator)
- Toggles: Deducts Vacation, Requires Approval, Requires Document
- Status: Active/Inactive badge, System badge
- Actions dropdown (View/Edit/Delete)

Note: System types should have Edit/Delete disabled with tooltip "System type cannot be modified".

### 3.3 Form Sheet Component

**File:** `absence-type-form-sheet.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-form-sheet.tsx`

Structure:
```tsx
interface AbsenceTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  absenceType?: AbsenceType | null
  onSuccess?: () => void
}
```

Form Sections:

**Basic Information:**
- Code (text input, required) - Pattern hint: U=vacation, K=illness, S=special
- Name (text input, required)
- Description (textarea, optional)
- Color (hex input with color preview swatch)

**Category & Portion:**
- Category (select: vacation, sick, personal, unpaid)
- Portion (select: Full Day=1, Half Day=2, None=0)

**Holiday Settings:**
- Holiday Code (text input, optional) - Alternate code used on holidays
- Priority (number input, default 0) - For holiday overlap resolution

**Behavior:**
- Deducts Vacation (switch)
- Requires Approval (switch)
- Requires Document (switch)

**Status:**
- Is Active (switch)

**Note:** For edit mode, if `is_system` is true, show info banner "This is a system absence type. Some fields cannot be modified." and disable Code field.

Validation:
- Code: required, max 10 chars
- Name: required, max 100 chars
- Color: valid hex format (#RRGGBB)

### 3.4 Detail Sheet Component

**File:** `absence-type-detail-sheet.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-detail-sheet.tsx`

Structure:
```tsx
interface AbsenceTypeDetailSheetProps {
  absenceTypeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (type: AbsenceType) => void
  onDelete: (type: AbsenceType) => void
}
```

Sections:
- Header with color indicator, name, code, and status badges
- Details: Code, Name, Description, Category, Portion
- Holiday Settings: Holiday Code, Priority
- Behavior: Deducts Vacation, Requires Approval, Requires Document (as badges/indicators)
- Timestamps: Created, Updated

Footer actions: Close, Edit (disabled if system), Delete (disabled if system)

### 3.5 Index Exports

**File:** `index.ts`

```tsx
export { AbsenceTypeDataTable } from './absence-type-data-table'
export { AbsenceTypeFormSheet } from './absence-type-form-sheet'
export { AbsenceTypeDetailSheet } from './absence-type-detail-sheet'
```

### Verification Phase 3

- Build frontend: `cd /home/tolga/projects/terp/apps/web && pnpm build`
- Check for TypeScript errors

---

## Phase 4: Frontend - Create Admin Page

**Goal:** Create the absence types admin page.

### 4.1 Create Page

**File:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/absence-types/page.tsx`

**Reference:** `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/holidays/page.tsx`

Features:
- Page header: "Absence Types" title, "Manage absence type configurations" description
- "New Absence Type" button (top right)
- Filter bar:
  - Search input (filter by code/name)
  - Category filter (dropdown: All, Vacation, Sick, Personal, Unpaid)
  - Status filter (dropdown: All, Active, Inactive)
  - System filter (toggle: Include System Types, default on)
  - Clear filters button
- Count display: "{n} absence types"
- Card with data table
- Empty state with icon and create button
- Sheets for create/edit/view
- Confirm dialog for delete

State management:
```tsx
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<AbsenceType | null>(null)
const [viewItem, setViewItem] = React.useState<AbsenceType | null>(null)
const [deleteItem, setDeleteItem] = React.useState<AbsenceType | null>(null)
const [search, setSearch] = React.useState('')
const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
const [statusFilter, setStatusFilter] = React.useState<string>('all')
const [showSystem, setShowSystem] = React.useState(true)
```

Filtering (client-side):
```tsx
const filteredTypes = React.useMemo(() => {
  return absenceTypes.filter((t) => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      if (!t.code?.toLowerCase().includes(searchLower) &&
          !t.name?.toLowerCase().includes(searchLower)) {
        return false
      }
    }
    // Category filter
    if (categoryFilter !== 'all' && t.category !== categoryFilter) {
      return false
    }
    // Status filter
    if (statusFilter === 'active' && !t.is_active) return false
    if (statusFilter === 'inactive' && t.is_active) return false
    // System filter
    if (!showSystem && t.is_system) return false
    return true
  })
}, [absenceTypes, search, categoryFilter, statusFilter, showSystem])
```

### 4.2 Add Skeleton Loading

Include a loading skeleton component following the holiday page pattern.

### Verification Phase 4

1. Start dev server: `cd /home/tolga/projects/terp && make dev`
2. Navigate to `http://localhost:3000/admin/absence-types`
3. Verify page loads with existing absence types
4. Test filtering by search, category, status, system toggle
5. Test create flow (open form, fill fields, submit)
6. Test view flow (click row to view details)
7. Test edit flow (click edit, modify fields, save)
8. Test delete flow (click delete, confirm, verify removed)
9. Verify system types cannot be edited/deleted

---

## Phase 5: Add Navigation Link

**Goal:** Add link to absence types in admin navigation.

### 5.1 Update Admin Navigation

**File:** `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar-nav.tsx` (or equivalent nav component)

Add link:
```tsx
{
  title: 'Absence Types',
  href: '/admin/absence-types',
  icon: CalendarOff, // or appropriate icon from lucide-react
}
```

### Verification Phase 5

1. Navigate sidebar and verify "Absence Types" link appears
2. Click link and verify navigation to correct page

---

## Success Criteria

- [ ] Backend CRUD endpoints work correctly (create, read, update, delete)
- [ ] System absence types cannot be modified or deleted (returns 403)
- [ ] Tenant-specific absence types can be fully managed
- [ ] Frontend displays all absence types with proper filtering
- [ ] Create form validates inputs and shows errors
- [ ] Edit form pre-populates values, handles system type restrictions
- [ ] Detail view shows all fields with proper formatting
- [ ] Delete requires confirmation and removes item
- [ ] Color picker/input allows selecting hex colors
- [ ] Category badges display with appropriate styling
- [ ] All tests pass: `make test`
- [ ] Frontend builds without errors: `pnpm build`

## Files to Create

1. `/home/tolga/projects/terp/apps/web/src/components/absence-types/index.ts`
2. `/home/tolga/projects/terp/apps/web/src/components/absence-types/absence-type-data-table.tsx`
3. `/home/tolga/projects/terp/apps/web/src/components/absence-types/absence-type-form-sheet.tsx`
4. `/home/tolga/projects/terp/apps/web/src/components/absence-types/absence-type-detail-sheet.tsx`
5. `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/absence-types/page.tsx`

## Files to Modify

1. `/home/tolga/projects/terp/apps/api/internal/service/absence.go` - Add type CRUD methods
2. `/home/tolga/projects/terp/apps/api/internal/handler/absence.go` - Add type handlers
3. `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` - Register routes
4. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absences.ts` - Add mutation hooks
5. `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar-nav.tsx` - Add nav link

## Notes

- The internal model uses `illness` category but API exposes as `sick` - handler must map
- The internal model uses `special` category but API exposes as `personal` - handler must map
- Portion values: 0=none, 1=full, 2=half (stored as int, displayed as label)
- System types have `is_system=true` and `tenant_id=null`
- Tenant-specific types have `is_system=false` and `tenant_id` set
