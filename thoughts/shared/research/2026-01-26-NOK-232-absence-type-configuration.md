# Research: NOK-232 Absence Type Configuration

**Date:** 2026-01-26
**Ticket:** NOK-232 - Build absence type configuration

## Overview

This document captures what exists in the codebase for implementing absence type management in the frontend. The backend API and model structure are already in place. The frontend needs a new admin management page following existing patterns.

## API Layer

### OpenAPI Spec

**Path Definition:** `/home/tolga/projects/terp/api/paths/absence-types.yaml`

Endpoints defined:
- `GET /absence-types` - List absence types (with `active` and `category` query filters)
- `POST /absence-types` - Create absence type
- `GET /absence-types/{id}` - Get absence type by ID
- `PATCH /absence-types/{id}` - Update absence type
- `DELETE /absence-types/{id}` - Delete absence type

**Schema Definition:** `/home/tolga/projects/terp/api/schemas/absence-types.yaml`

Schemas defined:
- `AbsenceType` - Full absence type response
- `AbsenceTypeSummary` - Compact version for lists
- `CreateAbsenceTypeRequest` - Create request body
- `UpdateAbsenceTypeRequest` - Update request body
- `AbsenceTypeList` - List response wrapper

### Generated Models

Located in `/home/tolga/projects/terp/apps/api/gen/models/`:
- `absence_type.go` - Full model with categories: vacation, sick, personal, unpaid, holiday, other
- `absence_type_summary.go` - Summary model
- `create_absence_type_request.go` - Create request
- `update_absence_type_request.go` - Update request

**Category Enum Values:**
- `vacation` - Vacation leave
- `sick` - Sick leave
- `personal` - Personal leave
- `unpaid` - Unpaid leave
- `holiday` - Holiday-related
- `other` - Other types

### Backend Implementation

**Model:** `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

Internal categories differ from API (mapped in handler):
- `AbsenceCategoryVacation` = "vacation"
- `AbsenceCategoryIllness` = "illness" (maps to API "sick")
- `AbsenceCategorySpecial` = "special" (maps to API "personal")
- `AbsenceCategoryUnpaid` = "unpaid"

Fields in internal model:
```go
type AbsenceType struct {
    ID               uuid.UUID
    TenantID         *uuid.UUID      // Null for system types
    Code             string          // Must follow U/K/S prefix rules
    Name             string
    Description      *string
    Category         AbsenceCategory // vacation, illness, special, unpaid
    Portion          AbsencePortion  // 0=none, 1=full, 2=half
    HolidayCode      *string         // Alternative code on holidays
    Priority         int             // For holiday overlap resolution
    DeductsVacation  bool
    RequiresApproval bool
    RequiresDocument bool
    Color            string          // Hex color
    SortOrder        int
    IsSystem         bool            // Cannot be deleted
    IsActive         bool
}
```

**Repository:** `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go`

Methods available:
- `Create(ctx, at)` - Create new
- `GetByID(ctx, id)` - Get by ID
- `GetByCode(ctx, tenantID, code)` - Get by code (prefers tenant-specific over system)
- `Update(ctx, at)` - Update existing
- `Delete(ctx, id)` - Delete by ID
- `List(ctx, tenantID, includeSystem)` - List with optional system type inclusion
- `ListByCategory(ctx, tenantID, category)` - List by category
- `Upsert(ctx, at)` - Create or update (for seeding)

**Handler:** `/home/tolga/projects/terp/apps/api/internal/handler/absence.go`

Currently implemented handlers:
- `ListTypes` - GET /absence-types (only list implemented)

**Note:** The handler does NOT implement Create, Update, Delete for absence types. Only ListTypes is registered in routes.go:
```go
r.Get("/absence-types", h.ListTypes)
```

**Routes:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

Absence routes registered:
```go
r.Get("/absence-types", h.ListTypes)
r.Get("/employees/{id}/absences", h.ListByEmployee)
r.Post("/employees/{id}/absences", h.CreateRange)
r.Delete("/absences/{id}", h.Delete)
```

### Database Schema

**Migration:** `/home/tolga/projects/terp/db/migrations/000025_create_absence_types.up.sql`

Table columns:
- `id` UUID PRIMARY KEY
- `tenant_id` UUID (NULL for system types)
- `code` VARCHAR(10) NOT NULL
- `name` VARCHAR(100) NOT NULL
- `description` TEXT
- `category` VARCHAR(20) NOT NULL
- `portion` INT NOT NULL DEFAULT 1
- `holiday_code` VARCHAR(10)
- `priority` INT NOT NULL DEFAULT 0
- `deducts_vacation` BOOLEAN DEFAULT false
- `requires_approval` BOOLEAN DEFAULT true
- `requires_document` BOOLEAN DEFAULT false
- `color` VARCHAR(7) DEFAULT '#808080'
- `sort_order` INT DEFAULT 0
- `is_system` BOOLEAN DEFAULT false
- `is_active` BOOLEAN DEFAULT true
- `created_at`, `updated_at` timestamps

Seeded system types (is_system=true):
- U, UH (vacation)
- K, KH, KK (illness)
- S, SH, SB, SD (special)
- UU (unpaid)

### Dev Mode Seeding

**File:** `/home/tolga/projects/terp/apps/api/internal/auth/devabsencetypes.go`

Dev types with deterministic UUIDs for development.

## Frontend Layer

### Current Absence-Related Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absences.ts`

Existing hooks:
- `useAbsenceTypes(enabled)` - List absence types (uses `/absence-types`)
- `useAbsenceType(id, enabled)` - Get single type (uses `/absence-types/{id}`)
- `useAbsences(options)` - List absences
- `useEmployeeAbsences(employeeId, options)` - Employee absences
- `useCreateAbsenceRange()` - Create absence range
- `useDeleteAbsence()` - Delete absence

**Missing hooks for NOK-232:**
- `useCreateAbsenceType()` - POST /absence-types
- `useUpdateAbsenceType()` - PATCH /absence-types/{id}
- `useDeleteAbsenceType()` - DELETE /absence-types/{id}

### Admin Management Page Patterns

**Reference Pages:**
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/holidays/page.tsx` - Holiday management
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/tariffs/page.tsx` - Tariff management
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/departments/page.tsx` - Department management

**Common Structure:**
1. Page header with title, description, and "New" button
2. Filter bar with search input and optional category/status filters
3. View mode toggle (list/tree/calendar) where applicable
4. Card containing data table or empty state
5. Sheet components for create/edit forms and detail views
6. ConfirmDialog for delete confirmation

**State Management Pattern:**
```tsx
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<Item | null>(null)
const [viewItem, setViewItem] = React.useState<Item | null>(null)
const [deleteItem, setDeleteItem] = React.useState<Item | null>(null)
```

**Handler Pattern:**
```tsx
const handleView = (item: Item) => setViewItem(item)
const handleEdit = (item: Item) => { setEditItem(item); setViewItem(null) }
const handleDelete = (item: Item) => setDeleteItem(item)
const handleFormSuccess = () => { setCreateOpen(false); setEditItem(null) }
```

### Component Patterns

#### Data Table

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-data-table.tsx`

Structure:
```tsx
interface DataTableProps {
  items: Item[]
  isLoading: boolean
  onView: (item: Item) => void
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}
```

Features:
- Table with header and body
- Row click to view details
- Dropdown menu with View/Edit/Delete actions
- Skeleton loading state
- Empty return when no items

#### Form Sheet

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-form-sheet.tsx`

Structure:
```tsx
interface FormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Item | null  // Null for create, populated for edit
  onSuccess?: () => void
}
```

Features:
- Sheet with SheetContent, SheetHeader, SheetFooter
- ScrollArea for form content
- Form sections with headings
- Input, Select, Switch components
- Local form state with validation
- Create and Update mutations
- Error display with Alert

#### Detail Sheet

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-detail-sheet.tsx`

Structure:
```tsx
interface DetailSheetProps {
  itemId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}
```

Features:
- Fetch full item details when open
- DetailRow component for label/value pairs
- Grouped sections in bordered containers
- Edit and Delete buttons in footer

### UI Components

**Available components in `/home/tolga/projects/terp/apps/web/src/components/ui/`:**
- `button.tsx` - Button variants
- `input.tsx` - Text input
- `label.tsx` - Form labels
- `select.tsx` - Dropdown select
- `switch.tsx` - Toggle switch
- `sheet.tsx` - Side panel
- `table.tsx` - Data table
- `badge.tsx` - Status badges
- `card.tsx` - Content cards
- `skeleton.tsx` - Loading skeletons
- `confirm-dialog.tsx` - Delete confirmation
- `search-input.tsx` - Search input with icon
- `scroll-area.tsx` - Scrollable container
- `alert.tsx` - Error/info messages
- `tabs.tsx` - Tab navigation
- `textarea.tsx` - Multi-line text input
- `popover.tsx` - Popover containers

**Color Picker:** No dedicated color picker component exists. Implementation will need to be created or use a library. The tariff form uses hex color inputs directly.

### API Client

**Generated Types:** `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

Type access pattern:
```tsx
import type { components } from '@/lib/api/types'
type AbsenceType = components['schemas']['AbsenceType']
```

**API Query Pattern:**
```tsx
import { useApiQuery, useApiMutation } from '@/hooks'

// Query
export function useAbsenceTypes(enabled = true) {
  return useApiQuery('/absence-types', {
    params: { active: true },
    enabled,
  })
}

// Mutation
export function useCreateAbsenceType() {
  return useApiMutation('/absence-types', 'post', {
    invalidateKeys: [['/absence-types']],
  })
}
```

### Component Directory Pattern

**Reference:** `/home/tolga/projects/terp/apps/web/src/components/holidays/`

Structure:
```
holidays/
  index.ts              # Exports all components
  holiday-data-table.tsx
  holiday-form-sheet.tsx
  holiday-detail-sheet.tsx
  holiday-year-calendar.tsx  # Optional specialized view
```

Export pattern in index.ts:
```ts
export { ComponentName } from './component-file'
```

## Key Files for Implementation Reference

### Backend (API endpoints need implementation)
- `/home/tolga/projects/terp/api/paths/absence-types.yaml` - OpenAPI endpoints
- `/home/tolga/projects/terp/api/schemas/absence-types.yaml` - OpenAPI schemas
- `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go` - Go model
- `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go` - Repository
- `/home/tolga/projects/terp/apps/api/internal/handler/absence.go` - Handler (needs CRUD)
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` - Route registration

### Frontend
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absences.ts` - Existing hooks (needs mutation hooks)
- `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts` - Hook exports
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/holidays/page.tsx` - Page pattern
- `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-form-sheet.tsx` - Form pattern
- `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-data-table.tsx` - Table pattern
- `/home/tolga/projects/terp/apps/web/src/components/holidays/holiday-detail-sheet.tsx` - Detail pattern

## Implementation Gaps

### Backend Gaps
1. Handler methods for Create, Update, Delete absence types not implemented
2. Routes not registered for POST, PATCH, DELETE endpoints
3. Service layer for absence type CRUD not exists (currently only ListTypes through absence service)

### Frontend Gaps
1. No admin page at `/admin/absence-types`
2. No mutation hooks for create/update/delete absence types
3. No AbsenceType components (data table, form sheet, detail sheet)
4. No color picker component (will need to implement or use simple hex input)

## Relevant Ticket Fields

From the ticket, the absence type config should include:
- Code (with U/K/S prefix validation)
- Name
- Category (vacation, illness, special, unpaid)
- Portion (0=none, 1=full, 2=half time credit)
- Deducts Vacation (boolean)
- Requires Approval (boolean)
- Requires Document (boolean)
- Color (hex code)
- Priority (for holiday overlap)
- Holiday Code (alternate code on holidays)
- Is Active (activation toggle)
- Is System (read-only indicator)

The internal model and database already support all these fields.
