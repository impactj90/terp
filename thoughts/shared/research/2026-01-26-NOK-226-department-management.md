# Research: NOK-226 - Build Department Management with Hierarchy Tree View

**Date**: 2026-01-26
**Ticket**: NOK-226
**Status**: Research Complete

## Executive Summary

This research documents existing patterns, components, and API infrastructure relevant to implementing the department management page with hierarchy tree visualization. The codebase already has substantial foundation including:
- Complete backend API with hierarchy/tree endpoint
- Basic frontend department hooks
- Similar admin page patterns (employee management)
- UI components for tables, forms, sheets, and dialogs

Key gap: No existing tree visualization component - will need to be created.

---

## 1. Existing Department API

### 1.1 OpenAPI Specification

**Location**: `/home/tolga/projects/terp/api/paths/departments.yaml`

Defined endpoints:
- `GET /departments` - List departments with filters (active, parent_id)
- `POST /departments` - Create department
- `GET /departments/{id}` - Get department by ID
- `PATCH /departments/{id}` - Update department
- `DELETE /departments/{id}` - Delete department

**Note**: The `/departments/tree` endpoint exists in the backend but is **NOT in the OpenAPI spec** - needs to be added.

### 1.2 Schema Definitions

**Location**: `/home/tolga/projects/terp/api/schemas/departments.yaml`

```yaml
Department:
  type: object
  required: [id, tenant_id, name, code]
  properties:
    id: string (uuid)
    tenant_id: string (uuid)
    name: string
    code: string
    description: string (nullable)
    parent_id: string (uuid, nullable)
    manager_id: string (uuid, nullable)
    is_active: boolean
    created_at: string (date-time)
    updated_at: string (date-time)
    parent: DepartmentSummary (nullable)
    children: DepartmentSummary[]

DepartmentSummary:
  type: object
  required: [id, name, code]
  properties:
    id: string (uuid)
    name: string
    code: string

CreateDepartmentRequest:
  required: [name, code]
  properties:
    name: string (1-255)
    code: string (1-20)
    description: string
    parent_id: string (uuid)
    manager_id: string (uuid)

UpdateDepartmentRequest:
  properties:
    name: string (1-255)
    code: string (1-20)
    description: string
    parent_id: string (uuid)
    manager_id: string (uuid)
    is_active: boolean
```

### 1.3 Generated TypeScript Types

**Location**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

Types are auto-generated via `pnpm run generate:api`. Relevant types:
- `components['schemas']['Department']`
- `components['schemas']['DepartmentSummary']`
- `components['schemas']['CreateDepartmentRequest']`
- `components['schemas']['UpdateDepartmentRequest']`
- `components['schemas']['DepartmentList']`

---

## 2. Backend Implementation

### 2.1 Handler

**Location**: `/home/tolga/projects/terp/apps/api/internal/handler/department.go`

Implemented endpoints:
- `List()` - Lists departments with active/parent_id filters
- `Get()` - Gets single department
- `Create()` - Creates department with validation
- `Update()` - Updates department with circular reference check
- `Delete()` - Deletes department (checks for children)
- `GetTree()` - **Returns hierarchical tree structure** (not in OpenAPI spec)

### 2.2 Routes

**Location**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

```go
r.Route("/departments", func(r chi.Router) {
    r.Get("/", h.List)
    r.Post("/", h.Create)
    r.Get("/tree", h.GetTree)   // Tree endpoint exists!
    r.Get("/{id}", h.Get)
    r.Patch("/{id}", h.Update)
    r.Delete("/{id}", h.Delete)
})
```

### 2.3 Service Layer

**Location**: `/home/tolga/projects/terp/apps/api/internal/service/department.go`

Key functionality:
- Circular reference detection for parent changes
- Child validation before delete
- Tree building via `GetHierarchy()` method

**DepartmentNode structure** (for tree response):
```go
type DepartmentNode struct {
    Department model.Department `json:"department"`
    Children   []DepartmentNode `json:"children,omitempty"`
}
```

### 2.4 Repository

**Location**: `/home/tolga/projects/terp/apps/api/internal/repository/department.go`

Available methods:
- `List(ctx, tenantID)` - All departments
- `ListActive(ctx, tenantID)` - Active only
- `GetByID(ctx, id)`
- `GetByCode(ctx, tenantID, code)`
- `GetChildren(ctx, departmentID)` - Direct children
- `GetRoots(ctx, tenantID)` - Root departments
- `GetHierarchy(ctx, tenantID)` - Ordered for tree building
- `Create()`, `Update()`, `Delete()`

### 2.5 Database Schema

**Location**: `/home/tolga/projects/terp/db/migrations/000009_create_departments.up.sql`

```sql
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_employee_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

---

## 3. Existing Frontend Infrastructure

### 3.1 API Client

**Location**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

Uses `openapi-fetch` library with typed paths:
```typescript
import createClient from 'openapi-fetch'
import type { paths } from './types'

export const api = createClient<paths>({
  baseUrl: clientEnv.apiUrl,
})
```

Middleware handles:
- Auth token (Authorization header)
- Tenant ID (X-Tenant-ID header)

### 3.2 Query Hooks

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

Type-safe query hook pattern:
```typescript
const { data, isLoading } = useApiQuery('/departments', {
  params: { active: true },
  enabled: true,
})
```

### 3.3 Mutation Hooks

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

Pattern for mutations:
```typescript
const createMutation = useApiMutation('/departments', 'post', {
  invalidateKeys: [['/departments']],
})

createMutation.mutate({
  body: { name: 'Engineering', code: 'ENG' }
})
```

### 3.4 Existing Department Hooks

**Location**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`

Currently implemented:
```typescript
// List all departments
export function useDepartments(options: { enabled?: boolean } = {})

// Get single department
export function useDepartment(id: string, enabled = true)
```

**Missing hooks** that need to be added:
- `useDepartmentTree()` - for tree endpoint
- `useCreateDepartment()`
- `useUpdateDepartment()`
- `useDeleteDepartment()`

---

## 4. Similar Frontend Patterns

### 4.1 Employee Management Page

**Location**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/employees/page.tsx`

This is the primary reference for department management. Key patterns:

**Page Structure:**
```typescript
export default function EmployeesPage() {
  // Auth/role check
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Pagination and filters
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(20)
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>()
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Dialogs state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editEmployee, setEditEmployee] = React.useState<Employee | null>(null)
  const [viewEmployee, setViewEmployee] = React.useState<Employee | null>(null)
  const [deleteEmployee, setDeleteEmployee] = React.useState<Employee | null>(null)

  // ... rest of implementation
}
```

**Key UI Sections:**
1. Page header with title and "New" button
2. Filters bar (search, status dropdown, clear filters)
3. Data table in Card
4. Pagination
5. Form Sheet (create/edit)
6. Detail Sheet (view)
7. Confirm Dialog (delete)

### 4.2 Employee Data Table

**Location**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`

Pattern for data tables:
- Checkbox selection (all/individual)
- Row actions via dropdown menu
- Skeleton loading state
- Status badges

### 4.3 Employee Form Sheet

**Location**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`

Form pattern:
- Sheet component (side="right")
- Form state management with useState
- Validation function
- Create/Update mutation handling
- Reference data fetching (departments, cost centers, etc.)
- ScrollArea for long forms
- Error display with Alert

### 4.4 Employee Detail Sheet

**Location**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-detail-sheet.tsx`

Detail view pattern:
- Fetch single entity on open
- Section headers with DetailRow component
- Action buttons in footer (Edit, Delete, etc.)

---

## 5. UI Component Library

### 5.1 Available Components

**Location**: `/home/tolga/projects/terp/apps/web/src/components/ui/`

| Component | File | Use Case |
|-----------|------|----------|
| Button | button.tsx | All buttons |
| Card | card.tsx | Content containers |
| Table | table.tsx | Data tables |
| Sheet | sheet.tsx | Side panels for forms/details |
| ConfirmDialog | confirm-dialog.tsx | Destructive actions |
| SearchInput | search-input.tsx | Debounced search |
| Pagination | pagination.tsx | Table pagination |
| Select | select.tsx | Dropdowns |
| Input | input.tsx | Text inputs |
| Label | label.tsx | Form labels |
| Checkbox | checkbox.tsx | Selection |
| Tabs | tabs.tsx | View switching |
| Badge | badge.tsx | Status indicators |
| Skeleton | skeleton.tsx | Loading states |
| ScrollArea | scroll-area.tsx | Scrollable containers |
| DropdownMenu | dropdown-menu.tsx | Action menus |
| Tooltip | tooltip.tsx | Hints |
| Alert | alert.tsx | Messages |
| Calendar | calendar.tsx | Date picking |
| Popover | popover.tsx | Floating content |

### 5.2 Missing Components

**Tree/Hierarchy Components** - Need to be created:
- TreeView component with expand/collapse
- TreeNode component for individual items
- Potentially drag-and-drop support (react-dnd or similar)

---

## 6. Navigation Configuration

**Location**: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Department page already configured:
```typescript
{
  title: 'Departments',
  href: '/admin/departments',
  icon: Building2,
  roles: ['admin'],
  description: 'Manage departments',
}
```

---

## 7. Dependencies Available

**Location**: `/home/tolga/projects/terp/apps/web/package.json`

Relevant dependencies:
- `@radix-ui/*` - UI primitives (no tree component)
- `@tanstack/react-query` - Data fetching
- `lucide-react` - Icons (ChevronRight, ChevronDown, Building2, etc.)
- `tailwind-merge` + `clsx` - Styling
- `date-fns` - Date formatting

**No tree-specific libraries** installed. Options:
1. Build custom tree component using Radix primitives
2. Add a tree library (react-arborist, @radix-ui/react-collapsible)

---

## 8. Gaps and Missing Pieces

### 8.1 OpenAPI Specification
- [ ] Add `/departments/tree` endpoint to OpenAPI spec

### 8.2 Frontend Hooks
- [ ] Add `useDepartmentTree()` hook
- [ ] Add `useCreateDepartment()` hook
- [ ] Add `useUpdateDepartment()` hook
- [ ] Add `useDeleteDepartment()` hook

### 8.3 UI Components
- [ ] Create TreeView component
- [ ] Create TreeNode component
- [ ] Optionally add drag-and-drop library

### 8.4 Page Components
- [ ] Create department page
- [ ] Create DepartmentDataTable
- [ ] Create DepartmentFormSheet
- [ ] Create DepartmentDetailSheet
- [ ] Create DepartmentTreeView

### 8.5 Backend
- Employee count per department is not currently returned
- May need to add employee_count field to department response

---

## 9. Implementation Recommendations

### 9.1 Tree View Implementation

Since no tree library is installed, recommend building a custom tree component:

```typescript
// Conceptual structure
interface TreeNodeData {
  id: string
  name: string
  code: string
  children?: TreeNodeData[]
  employeeCount?: number
  isActive: boolean
}

interface TreeViewProps {
  data: TreeNodeData[]
  onNodeClick: (node: TreeNodeData) => void
  onNodeExpand: (node: TreeNodeData) => void
  expandedIds: Set<string>
}
```

Use:
- `ChevronRight` / `ChevronDown` icons for expand/collapse
- Recursive rendering for nested children
- Indentation via padding-left based on depth

### 9.2 View Toggle Pattern

Use Tabs component for tree/list view toggle:
```typescript
<Tabs defaultValue="tree">
  <TabsList>
    <TabsTrigger value="tree">Tree View</TabsTrigger>
    <TabsTrigger value="list">List View</TabsTrigger>
  </TabsList>
  <TabsContent value="tree">
    <DepartmentTreeView />
  </TabsContent>
  <TabsContent value="list">
    <DepartmentDataTable />
  </TabsContent>
</Tabs>
```

### 9.3 Form Pattern

Follow employee form pattern:
- Sheet for create/edit
- Parent selection via Select component with hierarchical options
- Manager selection via employee search/select

---

## 10. File Structure Recommendation

```
apps/web/src/
├── app/(dashboard)/admin/departments/
│   └── page.tsx
├── components/departments/
│   ├── department-tree-view.tsx
│   ├── department-tree-node.tsx
│   ├── department-data-table.tsx
│   ├── department-form-sheet.tsx
│   ├── department-detail-sheet.tsx
│   └── index.ts
└── hooks/api/
    └── use-departments.ts (extend existing)
```

---

## 11. Referenced Files

### Frontend
- `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/employees/page.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`
- `/home/tolga/projects/terp/apps/web/src/components/employees/employee-detail-sheet.tsx`
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`
- `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`
- `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`
- `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`
- `/home/tolga/projects/terp/apps/web/src/components/ui/*.tsx`

### Backend
- `/home/tolga/projects/terp/apps/api/internal/handler/department.go`
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`
- `/home/tolga/projects/terp/apps/api/internal/service/department.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/department.go`
- `/home/tolga/projects/terp/apps/api/internal/model/department.go`

### API Spec
- `/home/tolga/projects/terp/api/paths/departments.yaml`
- `/home/tolga/projects/terp/api/schemas/departments.yaml`

### Database
- `/home/tolga/projects/terp/db/migrations/000009_create_departments.up.sql`
