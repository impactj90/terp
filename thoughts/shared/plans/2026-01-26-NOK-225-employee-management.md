# NOK-225: Employee Management Interface Implementation Plan

**Date**: 2026-01-26
**Ticket**: NOK-225
**Feature**: Employee Management Interface for HR Administrators

---

## Overview

Implement a comprehensive employee management interface for HR administrators with full CRUD operations, advanced filtering, pagination, bulk actions, and status management. The interface will live under `/admin/employees` and be accessible only to users with admin role.

### Goals

1. Create an employee list page with data table supporting pagination, sorting, and filtering
2. Implement search with debounce for efficient typeahead functionality
3. Build employee detail view sheet with edit capability
4. Create new employee form with validation
5. Add bulk actions for mass operations
6. Implement soft delete with confirmation dialog
7. Add status badges and quick action menus per row

---

## Prerequisites

The following already exist and will be leveraged:

### Backend (Fully Implemented)
- Employee CRUD endpoints in `/home/tolga/projects/terp/apps/api/internal/handler/employee.go`
- Repository with pagination support in `/home/tolga/projects/terp/apps/api/internal/repository/employee.go`
- OpenAPI spec in `/home/tolga/projects/terp/api/schemas/employees.yaml` and `/home/tolga/projects/terp/api/paths/employees.yaml`

### Frontend Hooks (Fully Implemented)
- `useEmployees`, `useEmployee`, `useCreateEmployee`, `useUpdateEmployee`, `useDeleteEmployee` in `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

### UI Components (Available)
- Table components in `/home/tolga/projects/terp/apps/web/src/components/ui/table.tsx`
- Sheet component for slide-over forms
- DropdownMenu for actions
- Button, Input, Select, Badge, Alert components
- Calendar and DateRangePicker components

### Navigation (Already Configured)
- Sidebar nav entry exists in `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` pointing to `/admin/employees`

---

## Implementation Phases

### Phase 1: Foundation Components

Create reusable components that will be used across the employee management interface.

#### 1.1 Debounced Search Input Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/search-input.tsx`

Purpose: Reusable search input with built-in debounce for API efficiency.

```typescript
interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number // default 300
  className?: string
}
```

Implementation notes:
- Use `useState` for local input value
- Use `useEffect` with `setTimeout` for debounce
- Clear timeout on cleanup
- Include search icon and optional clear button

#### 1.2 Pagination Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/pagination.tsx`

Purpose: Reusable pagination controls with page navigation and page size selector.

```typescript
interface PaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  pageSizes?: number[] // default [10, 20, 50, 100]
}
```

Implementation notes:
- First/Last/Prev/Next buttons
- Page number display with current/total
- Results count display (e.g., "Showing 1-20 of 150")
- Page size dropdown selector
- Follow shadcn/ui patterns with Button and Select components

#### 1.3 Confirmation Dialog Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/confirm-dialog.tsx`

Purpose: Reusable confirmation dialog for destructive actions.

```typescript
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string // default "Confirm"
  cancelLabel?: string // default "Cancel"
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

Implementation notes:
- Use Sheet component with side="bottom" (following pending-requests.tsx pattern)
- Support loading state for async operations
- Destructive variant for delete actions

#### 1.4 Status Badge Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/employees/status-badge.tsx`

Purpose: Display employee status with appropriate styling.

```typescript
interface StatusBadgeProps {
  isActive: boolean
  exitDate?: string | null
  className?: string
}
```

Implementation notes:
- Active: Green badge (variant="default")
- Inactive: Gray badge (variant="secondary")
- Exited: Red badge (variant="destructive") - if exit_date is in past
- Use existing Badge component from UI library

**Verification Steps for Phase 1:**
1. Components render without errors
2. SearchInput debounces correctly (verify with console.log)
3. Pagination calculates page numbers correctly
4. ConfirmDialog opens/closes and triggers callbacks

---

### Phase 2: Employee List Page

#### 2.1 Employee List Page Component

**File**: `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/employees/page.tsx`

Purpose: Main employee management page with data table.

```typescript
// Page state
const [page, setPage] = useState(1)
const [limit, setLimit] = useState(20)
const [search, setSearch] = useState('')
const [debouncedSearch, setDebouncedSearch] = useState('')
const [departmentFilter, setDepartmentFilter] = useState<string | undefined>()
const [activeFilter, setActiveFilter] = useState<boolean | undefined>()
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

// Dialogs
const [createOpen, setCreateOpen] = useState(false)
const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null)
```

Layout structure:
```
<div className="space-y-6">
  {/* Header */}
  <div className="flex justify-between items-center">
    <div>
      <h1>Employees</h1>
      <p>Manage employee records</p>
    </div>
    <Button onClick={() => setCreateOpen(true)}>
      <Plus /> New Employee
    </Button>
  </div>

  {/* Filters bar */}
  <div className="flex gap-4 flex-wrap">
    <SearchInput />
    <DepartmentFilter />
    <StatusFilter />
    {selectedIds.size > 0 && <BulkActions />}
  </div>

  {/* Data table */}
  <Card>
    <EmployeeDataTable />
  </Card>

  {/* Pagination */}
  <Pagination />

  {/* Dialogs */}
  <EmployeeFormSheet />
  <ConfirmDialog />
</div>
```

Implementation notes:
- Check admin role at top of component with useHasRole(['admin'])
- Redirect to dashboard if not admin
- Handle loading and empty states
- Reset to page 1 when filters change

#### 2.2 Employee Data Table Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-data-table.tsx`

Purpose: Reusable data table for employee list with selection support.

```typescript
interface EmployeeDataTableProps {
  employees: Employee[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
  onViewTimesheet: (employee: Employee) => void
}
```

Table columns:
1. **Checkbox** - For bulk selection
2. **Personnel #** - Personnel number (sortable)
3. **Name** - Full name with avatar placeholder (sortable)
4. **Email** - Email address
5. **Department** - Department name (nullable)
6. **Status** - StatusBadge component
7. **Entry Date** - Formatted date
8. **Actions** - DropdownMenu with actions

Row actions in dropdown:
- View Details
- Edit
- View Timesheet
- Separator
- Deactivate/Delete (destructive)

Implementation notes:
- Use Table components from UI library
- Checkbox in header for select all (current page)
- Clickable row to view details
- Hover states on rows

**Verification Steps for Phase 2:**
1. Page renders at `/admin/employees`
2. Table shows employee data from API
3. Search filters results after debounce
4. Department and status filters work
5. Pagination controls update data
6. Row selection works (single and all)

---

### Phase 3: Employee Forms

#### 3.1 Employee Form Sheet (Create/Edit)

**File**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-form-sheet.tsx`

Purpose: Slide-over sheet form for creating and editing employees.

```typescript
interface EmployeeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null // null = create mode, Employee = edit mode
  onSuccess?: () => void
}
```

Form fields (organized in sections):

**Personal Information:**
- First Name* (Input)
- Last Name* (Input)
- Email (Input, email type)
- Phone (Input)

**Employment Details:**
- Personnel Number* (Input, required for create, readonly for edit)
- PIN* (Input, password type, only for create)
- Entry Date* (DatePicker)
- Exit Date (DatePicker, only for edit)
- Department (Select from departments)
- Cost Center (Select from cost centers)
- Employment Type (Select from employment types)

**Contract Details:**
- Weekly Hours (Input, number)
- Vacation Days Per Year (Input, number)

Implementation notes:
- Follow pattern from booking-edit-dialog.tsx
- Use useState for form state
- Reset form on open with useEffect
- Validation for required fields
- Show error messages inline
- Different title/description for create vs edit
- Personnel number readonly in edit mode (cannot change)
- PIN only shown in create mode

#### 3.2 Hooks for Reference Data

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-departments.ts`

```typescript
export function useDepartments(options = {}) {
  return useApiQuery('/departments', {
    params: { active: true },
    ...options,
  })
}
```

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-cost-centers.ts`

```typescript
export function useCostCenters(options = {}) {
  return useApiQuery('/cost-centers', {
    params: { active: true },
    ...options,
  })
}
```

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employment-types.ts`

```typescript
export function useEmploymentTypes(options = {}) {
  return useApiQuery('/employment-types', {
    ...options,
  })
}
```

Update exports in `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

**Verification Steps for Phase 3:**
1. Create form opens and shows all fields
2. Required field validation works
3. Create submits correctly and invalidates query
4. Edit form populates with existing data
5. Edit submits partial update correctly
6. Form resets on close and reopen

---

### Phase 4: Employee Detail View

#### 4.1 Employee Detail Sheet

**File**: `/home/tolga/projects/terp/apps/web/src/components/employees/employee-detail-sheet.tsx`

Purpose: Read-only detail view with edit capability.

```typescript
interface EmployeeDetailSheetProps {
  employeeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (employee: Employee) => void
  onDelete: (employee: Employee) => void
}
```

Layout:
```
<SheetContent className="sm:max-w-lg">
  <SheetHeader>
    <div className="flex items-center gap-4">
      <Avatar>{initials}</Avatar>
      <div>
        <SheetTitle>{fullName}</SheetTitle>
        <SheetDescription>{personnelNumber}</SheetDescription>
      </div>
      <StatusBadge />
    </div>
  </SheetHeader>

  <div className="py-4 space-y-6">
    {/* Contact Info */}
    <Section title="Contact Information">
      <DetailRow label="Email" value={email} />
      <DetailRow label="Phone" value={phone} />
    </Section>

    {/* Employment */}
    <Section title="Employment Details">
      <DetailRow label="Department" value={department?.name} />
      <DetailRow label="Cost Center" value={costCenter?.name} />
      <DetailRow label="Employment Type" value={employmentType?.name} />
      <DetailRow label="Entry Date" value={formattedEntryDate} />
      <DetailRow label="Exit Date" value={formattedExitDate} />
    </Section>

    {/* Contract */}
    <Section title="Contract">
      <DetailRow label="Weekly Hours" value={weeklyHours} />
      <DetailRow label="Vacation Days" value={vacationDays} />
    </Section>

    {/* Cards */}
    <Section title="Access Cards">
      <CardsList cards={employee.cards} />
    </Section>

    {/* Contacts */}
    <Section title="Emergency Contacts">
      <ContactsList contacts={employee.contacts} />
    </Section>
  </div>

  <SheetFooter>
    <Button variant="outline" onClick={onViewTimesheet}>
      View Timesheet
    </Button>
    <Button onClick={() => onEdit(employee)}>
      Edit
    </Button>
  </SheetFooter>
</SheetContent>
```

Implementation notes:
- Fetch full employee details with useEmployee hook
- Loading skeleton while fetching
- Link to timesheet page
- Quick edit button to transition to edit sheet

**Verification Steps for Phase 4:**
1. Detail sheet opens when row is clicked
2. Shows all employee information
3. Related data (department, contacts, cards) displays correctly
4. Edit button transitions to edit form
5. View Timesheet navigates correctly

---

### Phase 5: Delete and Bulk Actions

#### 5.1 Delete Employee Flow

Use existing ConfirmDialog component from Phase 1.

Implementation in page component:
```typescript
const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null)
const deleteEmployeeMutation = useDeleteEmployee()

const handleDeleteClick = (employee: Employee) => {
  setDeleteEmployee(employee)
}

const handleConfirmDelete = async () => {
  if (!deleteEmployee) return

  try {
    await deleteEmployeeMutation.mutateAsync({
      path: { id: deleteEmployee.id },
    })
    setDeleteEmployee(null)
  } catch (error) {
    // Error handled by mutation
  }
}
```

Dialog content:
- Title: "Deactivate Employee"
- Description: "Are you sure you want to deactivate {firstName} {lastName}? They will no longer be able to clock in or access the system."
- Variant: destructive
- Confirm button: "Deactivate"

#### 5.2 Bulk Actions Component

**File**: `/home/tolga/projects/terp/apps/web/src/components/employees/bulk-actions.tsx`

```typescript
interface BulkActionsProps {
  selectedCount: number
  selectedIds: Set<string>
  onClear: () => void
  onActivate: () => void
  onDeactivate: () => void
  onExport: () => void
}
```

Layout:
```
<div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
  <span className="text-sm font-medium">
    {selectedCount} selected
  </span>
  <Button size="sm" variant="outline" onClick={onActivate}>
    Activate
  </Button>
  <Button size="sm" variant="outline" onClick={onDeactivate}>
    Deactivate
  </Button>
  <Button size="sm" variant="outline" onClick={onExport}>
    Export
  </Button>
  <Button size="sm" variant="ghost" onClick={onClear}>
    Clear
  </Button>
</div>
```

Implementation notes:
- Bulk operations require new API endpoints (consider for future)
- For now, implement client-side loop with existing single-employee mutations
- Show progress indicator during bulk operations
- Confirmation dialog for bulk deactivate

#### 5.3 Bulk Operations API (Backend Enhancement - Optional)

If bulk operations are needed, add to OpenAPI and implement:

**POST /employees/bulk/activate**
```yaml
requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [ids]
        properties:
          ids:
            type: array
            items:
              type: string
              format: uuid
```

**POST /employees/bulk/deactivate** - Same schema

For MVP, skip backend bulk endpoints and use sequential single updates.

**Verification Steps for Phase 5:**
1. Delete confirmation shows correct employee name
2. Delete deactivates employee (soft delete)
3. Deleted employee shows as inactive
4. Bulk selection works across pagination
5. Bulk actions appear when items selected
6. Bulk deactivate works (sequential calls)

---

### Phase 6: Enhancements and Polish

#### 6.1 Empty States

Add empty state illustrations for:
- No employees found (with search/filters)
- No employees at all (new tenant)

```typescript
<div className="text-center py-12">
  <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
  <h3 className="mt-4 text-lg font-medium">No employees found</h3>
  <p className="text-sm text-muted-foreground">
    {hasFilters
      ? "Try adjusting your search or filters"
      : "Get started by adding your first employee"}
  </p>
  {!hasFilters && (
    <Button className="mt-4" onClick={() => setCreateOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      Add Employee
    </Button>
  )}
</div>
```

#### 6.2 Loading States

- Skeleton rows in table during loading
- Disabled state on filters during query
- Shimmer effect on pagination

#### 6.3 Keyboard Navigation

- `Enter` on search to submit immediately
- `Escape` to clear search/close dialogs
- `Tab` navigation through table rows
- Arrow keys for pagination

#### 6.4 URL State Sync (Optional Enhancement)

Sync filters to URL params for shareable/bookmarkable views:
```typescript
const searchParams = useSearchParams()
const router = useRouter()

// Read from URL
const pageFromUrl = Number(searchParams.get('page')) || 1
const searchFromUrl = searchParams.get('q') || ''

// Update URL on change
const updateUrl = (params: Record<string, string>) => {
  const newParams = new URLSearchParams(searchParams)
  Object.entries(params).forEach(([key, value]) => {
    if (value) newParams.set(key, value)
    else newParams.delete(key)
  })
  router.replace(`?${newParams.toString()}`)
}
```

**Verification Steps for Phase 6:**
1. Empty states display appropriately
2. Loading states prevent double-clicks
3. Keyboard navigation works
4. URL updates with filters (if implemented)

---

## File Summary

### New Files to Create

```
apps/web/src/
  app/(dashboard)/admin/employees/
    page.tsx                           # Main employee list page
  components/
    ui/
      search-input.tsx                 # Debounced search input
      pagination.tsx                   # Pagination controls
      confirm-dialog.tsx               # Confirmation dialog
    employees/
      index.ts                         # Barrel export
      employee-data-table.tsx          # Data table component
      employee-form-sheet.tsx          # Create/edit form
      employee-detail-sheet.tsx        # Detail view
      status-badge.tsx                 # Status badge
      bulk-actions.tsx                 # Bulk actions bar
  hooks/api/
    use-departments.ts                 # Departments query hook
    use-cost-centers.ts                # Cost centers query hook
    use-employment-types.ts            # Employment types query hook
```

### Files to Modify

```
apps/web/src/hooks/api/index.ts        # Add new hook exports
```

---

## Success Criteria

1. **Functional Requirements**
   - [ ] Admin users can view paginated list of employees
   - [ ] Search filters employees by name, personnel number, email
   - [ ] Department and status filters work correctly
   - [ ] Admins can create new employees with validation
   - [ ] Admins can edit existing employee details
   - [ ] Admins can soft-delete (deactivate) employees with confirmation
   - [ ] Bulk selection and actions work
   - [ ] Status badges display correctly

2. **Non-Functional Requirements**
   - [ ] Page loads in under 2 seconds
   - [ ] Search debounces to prevent excessive API calls
   - [ ] Forms provide clear validation feedback
   - [ ] Responsive design works on tablet and desktop
   - [ ] Non-admin users cannot access the page

3. **Code Quality**
   - [ ] Components follow existing patterns
   - [ ] Type safety with TypeScript
   - [ ] No ESLint errors
   - [ ] Reusable components extracted appropriately

---

## Testing Checklist

### Manual Testing

1. **List Page**
   - Navigate to /admin/employees as admin
   - Verify employee list loads
   - Test search (wait for debounce)
   - Test department filter
   - Test active/inactive filter
   - Test pagination (page numbers, page size)
   - Verify non-admin redirect

2. **Create Employee**
   - Click "New Employee" button
   - Fill required fields only - submit should work
   - Leave required field empty - validation error
   - Submit valid form - employee appears in list
   - Verify query invalidation

3. **Edit Employee**
   - Click edit on existing employee
   - Modify fields
   - Save changes
   - Verify changes persisted

4. **Delete Employee**
   - Click delete on employee
   - Cancel - employee still exists
   - Confirm - employee marked inactive
   - Verify soft delete (not hard delete)

5. **Bulk Actions**
   - Select multiple employees
   - Verify selection count
   - Test bulk deactivate
   - Test clear selection

---

## Dependencies

- React Query (already installed)
- openapi-fetch (already configured)
- lucide-react icons (already installed)
- shadcn/ui components (Table, Sheet, Button, etc.)

No new npm packages required.

---

## Estimated Effort

| Phase | Description | Estimate |
|-------|-------------|----------|
| 1 | Foundation Components | 2 hours |
| 2 | Employee List Page | 3 hours |
| 3 | Employee Forms | 3 hours |
| 4 | Employee Detail View | 2 hours |
| 5 | Delete and Bulk Actions | 2 hours |
| 6 | Enhancements and Polish | 2 hours |
| **Total** | | **14 hours** |

---

## Notes

1. The backend API is fully implemented - no backend changes required
2. Employee hooks already exist and support all needed operations
3. Navigation entry already exists in sidebar config
4. Follow existing patterns from timesheet page and absence components
5. Use Sheet component for all slide-over panels (not Dialog)
6. Confirmation dialogs use Sheet with side="bottom" pattern
