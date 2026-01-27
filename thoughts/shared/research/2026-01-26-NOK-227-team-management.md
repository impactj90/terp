# Research: NOK-227 - Create Team Management with Member Assignment

**Date**: 2026-01-26
**Ticket**: NOK-227
**Status**: Research Complete

## Overview

This document researches the existing codebase patterns for implementing team management with member assignment in the Next.js frontend (`apps/web/`).

---

## 1. Frontend Project Structure

### Directory Layout

```
apps/web/src/
├── app/                          # Next.js App Router pages
│   ├── (auth)/                   # Auth layout group
│   │   └── login/page.tsx
│   └── (dashboard)/              # Dashboard layout group
│       ├── admin/
│       │   └── employees/page.tsx
│       ├── dashboard/page.tsx
│       ├── timesheet/page.tsx
│       └── layout.tsx
├── components/
│   ├── ui/                       # Shared UI components (shadcn/ui style)
│   ├── employees/                # Employee-specific components
│   ├── dashboard/
│   ├── timesheet/
│   ├── absences/
│   └── layout/
├── hooks/
│   ├── api/                      # Domain-specific API hooks
│   ├── use-api-query.ts          # Generic query hook
│   └── use-api-mutation.ts       # Generic mutation hook
├── lib/
│   └── api/
│       ├── client.ts             # API client with middleware
│       └── types.ts              # Generated OpenAPI types
└── providers/
    ├── auth-provider.tsx
    ├── query-provider.tsx
    └── tenant-provider.tsx
```

### Key Files for Reference

- **Admin Page Example**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/employees/page.tsx`
- **Data Table**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`
- **Form Sheet**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`
- **Detail Sheet**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-detail-sheet.tsx`

---

## 2. Employee Management Page Pattern

The employee management page (`/admin/employees`) serves as the primary reference for building team management.

### Page Structure

```tsx
// /app/(dashboard)/admin/employees/page.tsx
'use client'

export default function EmployeesPage() {
  // 1. Auth and role checks
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // 2. Pagination and filter state
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(20)
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // 3. Dialog state for CRUD operations
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editEmployee, setEditEmployee] = React.useState<Employee | null>(null)
  const [viewEmployee, setViewEmployee] = React.useState<Employee | null>(null)
  const [deleteEmployee, setDeleteEmployee] = React.useState<Employee | null>(null)

  // 4. Data fetching
  const { data, isLoading, isFetching } = useEmployees({ ... })

  // 5. Mutations
  const deleteMutation = useDeleteEmployee()

  // 6. Effects for filter/page resets

  // 7. Event handlers

  // 8. Render
  return (
    <div className="space-y-6">
      {/* Page header with title + create button */}
      {/* Filters bar with SearchInput, Select, Clear button */}
      {/* Data table in Card */}
      {/* Pagination */}
      {/* Form Sheet (create/edit) */}
      {/* Detail Sheet (view) */}
      {/* Confirm Dialog (delete) */}
    </div>
  )
}
```

### Component Patterns

#### Data Table Component

Location: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`

Features:
- Selection with checkbox (supports select all/none/indeterminate)
- Column headers with icons
- Row actions via `DropdownMenu`
- Click-to-view row behavior
- Skeleton loading state

```tsx
interface EmployeeDataTableProps {
  employees: Employee[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onView: (employee: Employee) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
  onViewTimesheet: (employee: Employee) => void
}
```

#### Form Sheet Component

Location: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`

Features:
- Side panel using `Sheet` component (side="right")
- Form state management with `useState`
- Client-side validation
- Loads reference data (departments, cost centers, employment types) with `enabled` prop
- Create/edit mode based on whether `employee` prop is passed
- Cancel/Submit footer buttons

```tsx
interface EmployeeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null  // null = create, defined = edit
  onSuccess?: () => void
}
```

#### Detail Sheet Component

Location: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-detail-sheet.tsx`

Features:
- Side panel using `Sheet` component
- Fetches full entity details when opened
- Sections with headers
- `DetailRow` helper component for label/value pairs
- Footer with action buttons (View, Edit, Delete)

```tsx
interface EmployeeDetailSheetProps {
  employeeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
}
```

---

## 3. API Client and Hooks Pattern

### Base Hooks

Location: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

```tsx
// Generic query hook - type-safe GET requests
export function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: UseApiQueryOptions<Path>
)

// Usage:
const { data, isLoading } = useApiQuery('/employees', {
  params: { limit: 20, page: 1, q: search },
  enabled: isAdmin,
})
```

Location: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

```tsx
// Generic mutation hook - type-safe POST/PUT/PATCH/DELETE
export function useApiMutation<Path, Method>(
  path: Path,
  method: Method,
  options?: UseApiMutationOptions
)

// Usage:
const createMutation = useApiMutation('/employees', 'post', {
  invalidateKeys: [['/employees']],
})

await createMutation.mutateAsync({
  body: { first_name: 'John', ... }
})
```

### Domain Hook Pattern

Location: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```tsx
export function useEmployees(options: UseEmployeesOptions = {}) {
  const { limit = 20, page, search, departmentId, active, enabled = true } = options

  return useApiQuery('/employees', {
    params: {
      limit,
      page,
      q: search,
      department_id: departmentId,
      active,
    },
    enabled,
  })
}

export function useEmployee(id: string, enabled = true) {
  return useApiQuery('/employees/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateEmployee() {
  return useApiMutation('/employees', 'post', {
    invalidateKeys: [['/employees']],
  })
}

export function useUpdateEmployee() {
  return useApiMutation('/employees/{id}', 'put', {
    invalidateKeys: [['/employees']],
  })
}

export function useDeleteEmployee() {
  return useApiMutation('/employees/{id}', 'delete', {
    invalidateKeys: [['/employees']],
  })
}
```

### Exports Index

All hooks are exported through `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`:

```tsx
export { useEmployees, useEmployee, useCreateEmployee, ... } from './use-employees'
export { useDepartments, useDepartment } from './use-departments'
// etc.
```

---

## 4. Team API Endpoints (From OpenAPI Spec)

Location: `/home/tolga/projects/terp/api/paths/teams.yaml`

### Available Endpoints

| Method | Endpoint | Operation | Description |
|--------|----------|-----------|-------------|
| GET | `/teams` | `listTeams` | List teams with filters (department_id, is_active) |
| POST | `/teams` | `createTeam` | Create a new team |
| GET | `/teams/{id}` | `getTeam` | Get team by ID (supports `include_members` query param) |
| PUT | `/teams/{id}` | `updateTeam` | Update team |
| DELETE | `/teams/{id}` | `deleteTeam` | Delete team |
| GET | `/teams/{id}/members` | `listTeamMembers` | List team members |
| POST | `/teams/{id}/members` | `addTeamMember` | Add member to team |
| PUT | `/teams/{id}/members/{employee_id}` | `updateTeamMember` | Update member role |
| DELETE | `/teams/{id}/members/{employee_id}` | `removeTeamMember` | Remove member |
| GET | `/employees/{employee_id}/teams` | `getEmployeeTeams` | Get teams for employee |

### Schema Types

Location: `/home/tolga/projects/terp/api/schemas/teams.yaml`

```yaml
TeamMemberRole:
  type: string
  enum: [member, lead, deputy]

Team:
  properties:
    id: uuid
    tenant_id: uuid
    department_id: uuid (optional)
    name: string
    description: string (optional)
    leader_employee_id: uuid (optional)
    is_active: boolean
    created_at: datetime
    updated_at: datetime
    department: Department (nested)
    leader: Employee (nested)
    members: TeamMember[] (nested)

TeamMember:
  properties:
    team_id: uuid
    employee_id: uuid
    joined_at: datetime
    role: TeamMemberRole
    employee: Employee (nested)

CreateTeamRequest:
  required: [name]
  properties:
    department_id: uuid (optional)
    name: string (1-255 chars)
    description: string (optional)
    leader_employee_id: uuid (optional)
    is_active: boolean (default: true)

UpdateTeamRequest:
  properties: (all optional)
    department_id, name, description, leader_employee_id, is_active

AddTeamMemberRequest:
  required: [employee_id]
  properties:
    employee_id: uuid
    role: TeamMemberRole (optional)

UpdateTeamMemberRequest:
  required: [role]
  properties:
    role: TeamMemberRole
```

### Generated TypeScript Types

Available in `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`:

```typescript
type Team = components['schemas']['Team']
type TeamMember = components['schemas']['TeamMember']
type TeamMemberRole = components['schemas']['TeamMemberRole']  // 'member' | 'lead' | 'deputy'
type CreateTeamRequest = components['schemas']['CreateTeamRequest']
type UpdateTeamRequest = components['schemas']['UpdateTeamRequest']
type AddTeamMemberRequest = components['schemas']['AddTeamMemberRequest']
type UpdateTeamMemberRequest = components['schemas']['UpdateTeamMemberRequest']
type TeamList = components['schemas']['TeamList']
```

---

## 5. UI Components Available

### Core Components

Location: `/home/tolga/projects/terp/apps/web/src/components/ui/`

| Component | File | Description |
|-----------|------|-------------|
| Button | `button.tsx` | Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg |
| Card | `card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction |
| Table | `table.tsx` | Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| Sheet | `sheet.tsx` | Side panel. Sides: top, right, bottom, left |
| Badge | `badge.tsx` | Variants: default, secondary, destructive, outline, ghost, link |
| Select | `select.tsx` | Dropdown select with SelectTrigger, SelectContent, SelectItem |
| Input | `input.tsx` | Text input |
| Label | `label.tsx` | Form label |
| Checkbox | `checkbox.tsx` | Checkbox with indeterminate state support |
| Skeleton | `skeleton.tsx` | Loading placeholder |
| Alert | `alert.tsx` | Alert messages |
| DropdownMenu | `dropdown-menu.tsx` | Action menus with DropdownMenuItem variant="destructive" |
| Popover | `popover.tsx` | Popover container |
| Calendar | `calendar.tsx` | Date picker |
| ScrollArea | `scroll-area.tsx` | Scrollable container |
| Tooltip | `tooltip.tsx` | Tooltips |

### Custom Components

| Component | File | Description |
|-----------|------|-------------|
| SearchInput | `search-input.tsx` | Debounced search with clear button |
| Pagination | `pagination.tsx` | Page navigation with rows-per-page selector |
| ConfirmDialog | `confirm-dialog.tsx` | Confirmation sheet for destructive actions |

### Domain Components

| Component | File | Description |
|-----------|------|-------------|
| StatusBadge | `employees/status-badge.tsx` | Active/Inactive/Exited badge |
| AbsenceTypeSelector | `absences/absence-type-selector.tsx` | Card-based type picker |
| BulkActions | `employees/bulk-actions.tsx` | Multi-select action bar |

---

## 6. State Management Patterns

### Local State for UI

```tsx
// Pagination
const [page, setPage] = React.useState(1)
const [limit, setLimit] = React.useState(20)

// Filters
const [search, setSearch] = React.useState('')
const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)

// Selection (for tables)
const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

// Dialog/Sheet state
const [createOpen, setCreateOpen] = React.useState(false)
const [editItem, setEditItem] = React.useState<Item | null>(null)
const [viewItem, setViewItem] = React.useState<Item | null>(null)
const [deleteItem, setDeleteItem] = React.useState<Item | null>(null)
```

### Server State (React Query)

- All API data is managed via `@tanstack/react-query`
- Mutations automatically invalidate related queries via `invalidateKeys`
- `enabled` prop controls when queries execute
- Loading/fetching states available from hooks

### Form State

```tsx
interface FormState {
  field1: string
  field2: string | undefined
  // ...
}

const INITIAL_STATE: FormState = { ... }

const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
const [error, setError] = React.useState<string | null>(null)

// Update field
setForm(prev => ({ ...prev, field1: newValue }))
```

---

## 7. Navigation Configuration

Location: `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`

Teams page would fit in the "Management" section:

```tsx
{
  title: 'Management',
  roles: ['admin'],
  items: [
    // ... existing items
    {
      title: 'Teams',
      href: '/admin/teams',
      icon: UsersIcon,  // or similar
      roles: ['admin'],
      description: 'Manage teams and members',
    },
  ],
}
```

---

## 8. Selector/Picker Patterns

### AbsenceTypeSelector Pattern

Location: `/home/tolga/projects/terp/apps/web/src/components/absences/absence-type-selector.tsx`

Card-based selection grid:
- Grid layout with responsive columns
- Selected state with ring highlight
- Check icon on selected item
- Loading skeleton state
- Empty state handling

```tsx
interface AbsenceTypeSelectorProps {
  value?: string
  onChange?: (typeId: string) => void
  types?: AbsenceType[]
  isLoading?: boolean
  disabled?: boolean
  className?: string
}
```

### Select Pattern for Dropdowns

For simple selections, use the standard `Select` component:

```tsx
<Select
  value={form.departmentId || '__none__'}
  onValueChange={(value) => setForm(prev => ({
    ...prev,
    departmentId: value === '__none__' ? '' : value
  }))}
  disabled={isSubmitting || isLoading}
>
  <SelectTrigger>
    <SelectValue placeholder="Select department" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="__none__">None</SelectItem>
    {items.map((item) => (
      <SelectItem key={item.id} value={item.id}>
        {item.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## 9. Files to Create for Team Management

### Hooks

```
apps/web/src/hooks/api/use-teams.ts
```

Contents:
- `useTeams(options)` - list teams with filters
- `useTeam(id, enabled)` - get single team
- `useCreateTeam()` - create team mutation
- `useUpdateTeam()` - update team mutation
- `useDeleteTeam()` - delete team mutation
- `useTeamMembers(teamId, enabled)` - list members
- `useAddTeamMember()` - add member mutation
- `useUpdateTeamMember()` - update role mutation
- `useRemoveTeamMember()` - remove member mutation

Update exports in `apps/web/src/hooks/api/index.ts`

### Components

```
apps/web/src/components/teams/
├── index.ts
├── team-card.tsx           # Card display for team (for grid view)
├── team-data-table.tsx     # Table display for teams
├── team-form-sheet.tsx     # Create/edit team form
├── team-detail-sheet.tsx   # View team details with members
├── team-status-badge.tsx   # Active/Inactive badge
├── member-list.tsx         # List of team members with role badges
├── member-picker-sheet.tsx # Sheet for adding members (search employees)
└── role-select.tsx         # Dropdown for member role selection
```

### Page

```
apps/web/src/app/(dashboard)/admin/teams/page.tsx
```

---

## 10. Implementation Considerations

### Team Card Layout (from ticket)

```
+-----------------------------------+
| Frontend Team          [Active]   |
| Department: Engineering           |
| Leader: John Smith                |
| Members: 8                        |
| [View] [Edit] [Manage Members]    |
+-----------------------------------+
```

Implementation approach:
- Use `Card` component
- `CardHeader` with team name and `StatusBadge`
- `CardContent` with department, leader, member count
- `CardFooter` with action buttons or `DropdownMenu`

### Member Picker

For adding members:
1. Open a sheet with employee search
2. Use `useEmployees` hook with search filter
3. Display employees not already in team
4. Select employee and optional role
5. Submit via `useAddTeamMember` mutation

### Role Management

Member roles:
- `member` - Regular team member
- `lead` - Team leader
- `deputy` - Deputy leader

Display with colored badges:
- Lead: Primary/default color
- Deputy: Secondary color
- Member: Outline/subtle

---

## Summary

The codebase follows consistent patterns for admin management pages:

1. **Page**: Manages state for filters, pagination, selection, and dialogs
2. **DataTable**: Displays data with selection, sorting, row actions
3. **FormSheet**: Handles create/edit in side panel
4. **DetailSheet**: Shows full details with actions
5. **ConfirmDialog**: Confirms destructive actions
6. **API Hooks**: Wrap `useApiQuery`/`useApiMutation` for type-safe data access

Team management can follow these exact patterns with:
- Teams list page (`/admin/teams`)
- Team CRUD operations
- Member management via nested sheets
- Role assignment via select/dropdown
